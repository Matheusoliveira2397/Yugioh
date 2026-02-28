import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between, In } from 'typeorm';
import { ChallengeArena } from './arena.entity';
import { ArenaLevelRange } from './entities/arena-level-range.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duel, DuelStatus, DuelResult } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupMember } from '../groups/entities/group-member.entity';

@Injectable()
export class ArenaService implements OnModuleInit {
  constructor(
    @InjectRepository(ChallengeArena)
    private arenaRepository: Repository<ChallengeArena>,
    @InjectRepository(ArenaLevelRange)
    private levelRangeRepository: Repository<ArenaLevelRange>,
    @InjectRepository(Duel)
    private duelRepository: Repository<Duel>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Group)
    private groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private groupMemberRepository: Repository<GroupMember>,
  ) {}

  async onModuleInit() {
    // Verificar e criar tabela arena_level_ranges se não existir
    try {
      console.log('🔧 [ArenaService] Verificando tabela arena_level_ranges...');
      
      const tableExists = await this.levelRangeRepository.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'arena_level_ranges'
      `);
      
      if (tableExists.length === 0) {
        console.log('🔧 [ArenaService] Tabela arena_level_ranges não existe. Criando automaticamente...');
        
        await this.levelRangeRepository.query(`
          CREATE TABLE IF NOT EXISTS "arena_level_ranges" (
            "id" SERIAL PRIMARY KEY,
            "min" INTEGER NOT NULL,
            "max" INTEGER NOT NULL,
            "name" VARCHAR(100) NOT NULL,
            "order" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        console.log('✅ [ArenaService] Tabela arena_level_ranges criada com sucesso!');
      } else {
        console.log('✅ [ArenaService] Tabela arena_level_ranges já existe');
      }
    } catch (error: any) {
      console.error('❌ [ArenaService] Erro ao verificar/criar tabela arena_level_ranges:', error);
    }

    // Verificar se existem faixas de nível no banco, se não, criar as padrão
    try {
      const count = await this.levelRangeRepository.count();
      if (count === 0) {
        console.log('🔧 [ArenaService] Criando faixas de nível padrão...');
        const defaultRanges = [
          { min: 1, max: 1, name: 'Nível 1', order: 1 },
          { min: 2, max: 3, name: 'Nível 2-3', order: 2 },
          { min: 4, max: 5, name: 'Nível 4-5', order: 3 },
          { min: 6, max: 10, name: 'Nível 6-10', order: 4 },
          { min: 11, max: 999, name: 'Nível 11+', order: 5 },
  ];
        
        for (const range of defaultRanges) {
          const levelRange = this.levelRangeRepository.create(range);
          await this.levelRangeRepository.save(levelRange);
        }
        console.log('✅ [ArenaService] Faixas de nível padrão criadas com sucesso!');
      }
    } catch (error: any) {
      console.error('❌ [ArenaService] Erro ao criar faixas de nível padrão:', error);
    }
  }

  // Determinar divisão baseada no nível
  async getLevelDivision(level: number): Promise<string> {
    const ranges = await this.getLevelRanges();
    for (const range of ranges) {
      if (level >= range.min && level <= range.max) {
        return range.name;
      }
    }
    return 'Nível 11+';
  }

  async getLevelRanges(): Promise<Array<{ min: number; max: number; name: string }>> {
    const ranges = await this.levelRangeRepository.find({
      order: { order: 'ASC' },
    });
    return ranges.map(r => ({ min: r.min, max: r.max, name: r.name }));
  }

  async updateLevelRanges(ranges: Array<{ min: number; max: number; name: string }>): Promise<void> {
    // Deletar todas as faixas existentes usando query SQL
    await this.levelRangeRepository.query('DELETE FROM arena_level_ranges');
    
    // Criar novas faixas
    const newRanges = ranges.map((range, index) => 
      this.levelRangeRepository.create({
        ...range,
        order: index + 1,
      })
    );
    
    if (newRanges.length > 0) {
      await this.levelRangeRepository.save(newRanges);
    }
  }

  async getCurrentArena(): Promise<ChallengeArena | null> {
    try {
      const now = new Date();
      
      const arena = await Promise.race([
        this.arenaRepository.findOne({
          where: {
            isActive: true,
            startTime: LessThan(now),
            endTime: MoreThan(now),
          },
          order: { startTime: 'DESC' },
          select: ['id', 'name', 'description', 'startTime', 'endTime', 'isActive', 'participants', 'scoreMultiplier', 'bonusGems']
        }),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: getCurrentArena')), 2000)
        )
      ]).catch(() => null);

      return arena;
    } catch (error) {
      console.error(`[getCurrentArena] Erro:`, error);
      return null;
    }
  }

  async getNextArena(): Promise<ChallengeArena | null> {
    try {
      const now = new Date();
      
      const arena = await Promise.race([
        this.arenaRepository.findOne({
          where: {
            isActive: true,
            startTime: MoreThan(now),
          },
          order: { startTime: 'ASC' },
          select: ['id', 'name', 'description', 'startTime', 'endTime', 'isActive', 'participants', 'scoreMultiplier', 'bonusGems']
        }),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: getNextArena')), 2000)
        )
      ]).catch(() => null);

      return arena;
    } catch (error) {
      console.error(`[getNextArena] Erro:`, error);
      return null;
    }
  }

  async createArena(startTime: Date, durationHours: number = 2): Promise<ChallengeArena> {
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

    const arena = this.arenaRepository.create({
      name: `Arena de Desafios - ${startTime.toLocaleString('pt-BR')}`,
      description: 'Arena especial com recompensas aumentadas! Duelos mais competitivos aguardam!',
      startTime,
      endTime,
      scoreMultiplier: 1.5,
      bonusGems: 50,
      participants: 0,
    });

    return await this.arenaRepository.save(arena);
  }

  async joinArena(arenaId: string): Promise<void> {
    await this.arenaRepository.increment({ id: arenaId }, 'participants', 1);
  }

  async leaveArena(arenaId: string): Promise<void> {
    await this.arenaRepository.decrement({ id: arenaId }, 'participants', 1);
  }

  // Criar arenas automaticamente a cada 6 horas
  @Cron('0 0,6,12,18 * * *') // 00:00, 06:00, 12:00, 18:00
  async scheduleArenas() {
    console.log('🏟️  Agendando próximas arenas de desafios...');
    
    const now = new Date();
    const nextArena = await this.getNextArena();

    // Se não há próxima arena agendada, criar uma para daqui a 6 horas
    if (!nextArena) {
      const startTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      await this.createArena(startTime, 2);
      console.log(`✅ Nova arena agendada para ${startTime.toLocaleString('pt-BR')}`);
    }
  }

  // Limpar arenas antigas
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanOldArenas() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const result = await this.arenaRepository
      .createQueryBuilder()
      .delete()
      .where('endTime < :date', { date: oneWeekAgo })
      .execute();

    console.log(`🧹 Limpou ${result.affected} arenas antigas`);
  }

  async getArenaStats(arenaId: string) {
    try {
      const arena = await Promise.race([
        this.arenaRepository.findOne({
          where: { id: arenaId },
          select: ['id', 'name', 'description', 'startTime', 'endTime', 'isActive', 'participants', 'scoreMultiplier', 'bonusGems', 'config']
        }),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: getArenaStats')), 2000)
        )
      ]).catch(() => null);

      if (!arena) {
        return null;
      }

      const now = new Date();
      const isActive = arena.startTime <= now && arena.endTime > now;
      const timeRemaining = isActive ? arena.endTime.getTime() - now.getTime() : 0;

      return {
        ...arena,
        isCurrentlyActive: isActive,
        timeRemainingMs: timeRemaining,
      };
    } catch (error) {
      console.error(`[getArenaStats] Erro:`, error);
      return null;
    }
  }

  // Buscar ranking por divisão de nível para uma arena - ULTRA OTIMIZADO
  async getArenaRankingByDivision(arenaId: string, division: string) {
    try {
      const arena = await Promise.race([
        this.arenaRepository.findOne({
          where: { id: arenaId },
          select: ['id', 'startTime', 'endTime', 'scoreMultiplier']
        }),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: findOne arena')), 2000)
        )
      ]).catch(() => null);

      if (!arena) {
        return [];
      }

      // Query ULTRA OTIMIZADA - sem eager loading, apenas campos essenciais
      const duels: Duel[] = await Promise.race([
        this.duelRepository
          .createQueryBuilder('duel')
          .select([
            'duel.id',
            'duel.player1Id',
            'duel.player2Id',
            'duel.result',
            'duel.finishedAt'
          ])
          .where('duel.status = :status', { status: DuelStatus.FINISHED })
          .andWhere('duel.finishedAt BETWEEN :startTime AND :endTime', {
            startTime: arena.startTime,
            endTime: arena.endTime
          })
          .limit(1000) // Limitar a 1000 duelos máximo
          .getMany(),
        new Promise<Duel[]>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: getArenaRankingByDivision')), 3000)
        )
      ]).catch(() => [] as Duel[]);

      if (duels.length === 0) {
        return [];
      }

      // Buscar players apenas dos duelos encontrados (uma query só)
      const playerIds = new Set<number>();
      duels.forEach(duel => {
        playerIds.add(duel.player1Id);
        playerIds.add(duel.player2Id);
      });

      const players: User[] = await Promise.race([
        this.userRepository.find({
          where: Array.from(playerIds).map(id => ({ id })),
          select: ['id', 'nickname', 'clanTag', 'profileImage', 'level', 'division']
        }),
        new Promise<User[]>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: find players')), 2000)
        )
      ]).catch(() => [] as User[]);

      const playerMap = new Map(players.map(p => [p.id, p]));

      // Calcular scores por jogador na divisão
      const playerScores: Map<number, { wins: number; losses: number; score: number; user: User | null }> = new Map();

      for (const duel of duels) {
        const p1 = playerMap.get(duel.player1Id);
        const p2 = playerMap.get(duel.player2Id);
        
        if (!p1 || !p2) continue;

        // Buscar divisão do campo division da tabela users
        const p1Division = p1.division || 'Bronze';
        const p2Division = p2.division || 'Bronze';

        // Só contar duelos onde ambos estão na mesma divisão
        if (p1Division !== division || p2Division !== division) continue;

        // Calcular score base
        const baseScore = 100;
        const multiplier = arena.scoreMultiplier || 1.5;
        const scoreGained = Math.floor(baseScore * multiplier);

        if (duel.result === DuelResult.PLAYER1_WIN) {
          const p1Data = playerScores.get(p1.id) || { wins: 0, losses: 0, score: 0, user: p1 };
          p1Data.wins++;
          p1Data.score += scoreGained;
          playerScores.set(p1.id, p1Data);

          const p2Data = playerScores.get(p2.id) || { wins: 0, losses: 0, score: 0, user: p2 };
          p2Data.losses++;
          playerScores.set(p2.id, p2Data);
        } else if (duel.result === DuelResult.PLAYER2_WIN) {
          const p2Data = playerScores.get(p2.id) || { wins: 0, losses: 0, score: 0, user: p2 };
          p2Data.wins++;
          p2Data.score += scoreGained;
          playerScores.set(p2.id, p2Data);

          const p1Data = playerScores.get(p1.id) || { wins: 0, losses: 0, score: 0, user: p1 };
          p1Data.losses++;
          playerScores.set(p1.id, p1Data);
        }
      }

      // Buscar grupos dos jogadores para pegar as logos
      const userIds = Array.from(playerScores.values())
        .filter(data => data.user !== null)
        .map(data => data.user!.id);
      
      const groupMembers = await this.groupMemberRepository.find({
        where: { userId: In(userIds), isActive: true },
        relations: ['group'],
        select: ['userId', 'groupId']
      });

      const groupMap = new Map<number, string>();
      for (const member of groupMembers) {
        if (member.group && member.group.logo) {
          groupMap.set(member.userId, member.group.logo);
        }
      }

      // Converter para array e ordenar por score
      const ranking = Array.from(playerScores.values())
        .filter(data => data.user !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) // Top 5
        .map((data, index) => ({
          rank: index + 1,
          userId: data.user!.id,
          nickname: data.user!.nickname,
          clanTag: data.user!.clanTag,
          profileImage: data.user!.profileImage,
          level: data.user!.level || 1,
          wins: data.wins,
          losses: data.losses,
          score: data.score,
          groupLogo: groupMap.get(data.user!.id) || undefined,
        }));

      return ranking;
    } catch (error) {
      console.error(`[getArenaRankingByDivision] Erro ao buscar ranking:`, error);
      // Retornar array vazio em caso de erro - não travar o sistema
      return [];
    }
  }

  // Buscar todos os rankings por divisão de uma arena - OTIMIZADO
  async getAllArenaRankings(arenaId: string) {
    try {
      const levelRanges = await this.getLevelRanges();
      const divisions = levelRanges.map(r => r.name);
      
      // Executar todas as queries em paralelo com timeout
      const rankingsPromises = divisions.map(division => 
        Promise.race([
          this.getArenaRankingByDivision(arenaId, division),
          new Promise<any[]>((resolve) => 
            setTimeout(() => {
              console.warn(`[getAllArenaRankings] Timeout para divisão ${division}`);
              resolve([]);
            }, 5000)
          )
        ])
      );

      const results = await Promise.all(rankingsPromises);
      
      const rankings: Record<string, any[]> = {};
      divisions.forEach((division, index) => {
        rankings[division] = results[index] || [];
      });

      return rankings;
    } catch (error) {
      console.error(`[getAllArenaRankings] Erro ao buscar rankings:`, error);
      // Retornar objeto vazio em caso de erro
      return {
        'Nível 1': [],
        'Nível 2-3': [],
        'Nível 4-5': [],
        'Nível 6-10': [],
        'Nível 11+': []
      };
    }
  }

  // Admin methods
  async getAllArenas(): Promise<ChallengeArena[]> {
    return await this.arenaRepository.find({
      order: { startTime: 'DESC' },
      take: 100,
    });
  }

  async getArenaById(id: string): Promise<ChallengeArena | null> {
    return await this.arenaRepository.findOne({ where: { id } });
  }

  async createArenaAdmin(data: {
    name: string;
    description?: string;
    startTime: Date | null;
    endTime: Date | null;
    scoreMultiplier?: number;
    bonusGems?: number;
    config?: any;
  }): Promise<ChallengeArena> {
    const config = data.config || {};
    
    // Se não tem levelRangeRewards mas tem top5Rewards e levelRanges, gerar automaticamente
    if (!config.rewards?.levelRangeRewards && config.rewards?.top5Rewards && config.levelRanges?.length > 0) {
      config.rewards.levelRangeRewards = config.levelRanges.map((range: any) => ({
        levelRange: range.name || range,
        top1: config.rewards.top5Rewards.top1 || { cash: 0, score: 0, additionalScore: 0 },
        top2: config.rewards.top5Rewards.top2 || { cash: 0, score: 0, additionalScore: 0 },
        top3: config.rewards.top5Rewards.top3 || { cash: 0, score: 0, additionalScore: 0 },
        top4: config.rewards.top5Rewards.top4 || { cash: 0, score: 0, additionalScore: 0 },
        top5: config.rewards.top5Rewards.top5 || { cash: 0, score: 0, additionalScore: 0 },
      }));
    }
    
    // Se é uma arena recorrente (isRecurring = true), usar datas placeholder
    // As datas reais serão criadas automaticamente pelo sistema de horários
    let startTime: Date;
    let endTime: Date;
    
    if (config.isRecurring && config.dailyStartTime && config.durationMinutes) {
      // Para arenas recorrentes, criar uma data placeholder (hoje no horário configurado)
      // Isso serve apenas como referência, as arenas reais serão criadas automaticamente
      const now = new Date();
      const [hours, minutes] = config.dailyStartTime.split(':').map(Number);
      startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
      endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + config.durationMinutes);
    } else {
      // Para arenas normais, usar as datas fornecidas
      startTime = data.startTime ? new Date(data.startTime) : new Date();
      endTime = data.endTime ? new Date(data.endTime) : new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas padrão
    }
    
    const arena = this.arenaRepository.create({
      name: data.name,
      description: data.description,
      startTime: startTime,
      endTime: endTime,
      scoreMultiplier: data.scoreMultiplier || 1.5,
      bonusGems: data.bonusGems || 50,
      config: config,
      isActive: true,
      participants: 0,
    });

    return await this.arenaRepository.save(arena);
  }

  async updateArena(id: string, data: Partial<ChallengeArena>): Promise<ChallengeArena> {
    const arena = await this.arenaRepository.findOne({ where: { id } });
    if (!arena) {
      throw new Error('Arena não encontrada');
    }

    // Preservar config existente e mesclar com nova config
    if (data.config) {
      data.config = { ...(arena.config || {}), ...data.config };
    }

    if (data.startTime) data.startTime = new Date(data.startTime);
    if (data.endTime) data.endTime = new Date(data.endTime);

    Object.assign(arena, data);
    return await this.arenaRepository.save(arena);
  }

  async deleteArena(id: string): Promise<void> {
    await this.arenaRepository.delete(id);
  }

  /**
   * Distribuir prêmios para os top 5 de cada faixa de nível quando a arena termina
   */
  async distributeArenaRewards(arenaId: string): Promise<void> {
    try {
      const arena = await this.arenaRepository.findOne({ where: { id: arenaId } });
      if (!arena) {
        console.error(`[distributeArenaRewards] Arena ${arenaId} não encontrada`);
        return;
      }

      // Verificar se já foram distribuídos os prêmios
      if (arena.config?.rewardsDistributed === true) {
        console.log(`[distributeArenaRewards] Prêmios da arena ${arenaId} já foram distribuídos`);
        return;
      }

      const rewards = arena.config?.rewards?.levelRangeRewards;
      if (!rewards || rewards.length === 0) {
        console.log(`[distributeArenaRewards] Nenhuma premiação configurada para a arena ${arenaId}`);
        // Marcar como distribuído mesmo sem prêmios
        arena.config = { ...arena.config, rewardsDistributed: true };
        await this.arenaRepository.save(arena);
        return;
      }

      const levelRanges = arena.config?.levelRanges || await this.getLevelRanges();
      let totalDistributed = 0;

      // Para cada faixa de nível configurada
      for (const levelRangeReward of rewards) {
        const levelRangeName = levelRangeReward.levelRange;
        
        // Buscar ranking top 5 dessa faixa
        const ranking = await this.getArenaRankingByDivision(arenaId, levelRangeName);
        const top5 = ranking.slice(0, 5);

        // Distribuir prêmios para cada posição
        for (let i = 0; i < top5.length; i++) {
          const player = top5[i];
          const position = i + 1; // 1, 2, 3, 4, 5
          const rewardKey = `top${position}` as 'top1' | 'top2' | 'top3' | 'top4' | 'top5';
          const reward = levelRangeReward[rewardKey];

          if (reward) {
            const user = await this.userRepository.findOne({ where: { id: player.userId } });
            if (!user) continue;

            // Calcular valores a adicionar
            const cashToAdd = reward.cash || 0;
            const totalScoreToAdd = (reward.score || 0) + (reward.additionalScore || 0);

            if (cashToAdd > 0 || totalScoreToAdd > 0) {
              // Usar SQL direto para garantir precisão
              const updateFields: string[] = [];
              const updateValues: any[] = [];
              let paramIndex = 1;

              if (cashToAdd > 0) {
                updateFields.push(`cash = COALESCE(cash, 0) + $${paramIndex}`);
                updateValues.push(cashToAdd);
                paramIndex++;
              }

              if (totalScoreToAdd > 0) {
                updateFields.push(`total_score = COALESCE(total_score, 0) + $${paramIndex}`);
                updateValues.push(totalScoreToAdd);
                paramIndex++;
              }

              if (updateFields.length > 0) {
                updateValues.push(player.userId);
                await this.userRepository.query(
                  `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, cash, total_score`,
                  updateValues
                );
                totalDistributed++;
                console.log(`[distributeArenaRewards] Prêmio distribuído para ${user.nickname} (${levelRangeName}, posição ${position}): cash=${cashToAdd}, score=${totalScoreToAdd}`);
              }
            }
          }
        }
      }

      // Marcar como distribuído
      arena.config = { ...arena.config, rewardsDistributed: true };
      await this.arenaRepository.save(arena);

      console.log(`[distributeArenaRewards] ✅ Prêmios da arena ${arenaId} distribuídos. Total: ${totalDistributed} jogadores premiados`);
    } catch (error) {
      console.error(`[distributeArenaRewards] ❌ Erro ao distribuir prêmios da arena ${arenaId}:`, error);
    }
  }

  /**
   * Verificar e distribuir prêmios de arenas finalizadas
   */
  @Cron(CronExpression.EVERY_5_MINUTES) // Verificar a cada 5 minutos
  async checkAndDistributeRewards(): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar arenas que terminaram mas ainda não tiveram prêmios distribuídos
      const finishedArenas = await this.arenaRepository.find({
        where: {
          isActive: true,
          endTime: LessThan(now),
        },
      });

      for (const arena of finishedArenas) {
        // Verificar se já foram distribuídos
        if (arena.config?.rewardsDistributed !== true) {
          console.log(`[checkAndDistributeRewards] Distribuindo prêmios da arena ${arena.name} (${arena.id})`);
          await this.distributeArenaRewards(arena.id);
          
          // Desativar arena após distribuir prêmios
          arena.isActive = false;
          await this.arenaRepository.save(arena);
        }
      }
    } catch (error) {
      console.error('[checkAndDistributeRewards] Erro ao verificar arenas finalizadas:', error);
    }
  }
}
