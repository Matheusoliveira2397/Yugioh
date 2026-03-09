import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between, In } from 'typeorm';
import { ChallengeArena } from './arena.entity';
import { ArenaLevelRange } from './entities/arena-level-range.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duel, DuelStatus, DuelResult } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { ShopService } from '../shop/shop.service';
import { DuelsGateway } from '../duels/duels.gateway';
import { GroupsService } from '../groups/groups.service';
import { SeasonsService } from '../seasons/seasons.service';

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
    private shopService: ShopService,
    @Inject(forwardRef(() => DuelsGateway))
    private duelsGateway: DuelsGateway,
    private groupsService: GroupsService,
    private seasonsService: SeasonsService,
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

  /**
   * Retorna a arena ativa no momento. Considera apenas INSTÂNCIAS (arenas do dia),
   * nunca os modelos/templates (isRecurring = true). Assim a arena que abre é sempre
   * a que foi criada no horário configurado pelo cron.
   */
  async getCurrentArena(): Promise<ChallengeArena | null> {
    try {
      const now = new Date();
      const arena = await Promise.race([
        this.arenaRepository
          .createQueryBuilder('a')
          .where('a.isActive = :active', { active: true })
          .andWhere('a.startTime < :now', { now })
          .andWhere('a.endTime > :now', { now })
          .andWhere(`(a.config->>'isRecurring' IS NULL OR a.config->>'isRecurring' <> 'true')`)
          .orderBy('a.startTime', 'DESC')
          .getOne(),
        new Promise<ChallengeArena | null>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout: getCurrentArena')), 2000)
        ),
      ]).catch(() => null);
      return arena;
    } catch (error) {
      console.error(`[getCurrentArena] Erro:`, error);
      return null;
    }
  }

  /**
   * Última arena já encerrada (endTime no passado). Para exibir top 5 da última arena.
   */
  async getLastFinishedArena(): Promise<ChallengeArena | null> {
    try {
      const now = new Date();
      const arena = await Promise.race([
        this.arenaRepository
          .createQueryBuilder('a')
          .where('a.endTime < :now', { now })
          .andWhere(`(a.config->>'isRecurring' IS NULL OR a.config->>'isRecurring' <> 'true')`)
          .orderBy('a.endTime', 'DESC')
          .getOne(),
        new Promise<ChallengeArena | null>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout: getLastFinishedArena')), 2000)
        ),
      ]).catch(() => null);
      return arena;
    } catch (error) {
      console.error(`[getLastFinishedArena] Erro:`, error);
      return null;
    }
  }

  /**
   * Top 5 de cada faixa da última arena encerrada. Para exibir na página da arena.
   */
  async getLastArenaTop5PerDivision(): Promise<{ arena: { id: string; name: string; endTime: string }; rankings: Record<string, any[]> } | null> {
    const lastArena = await this.getLastFinishedArena();
    if (!lastArena) return null;
    const allRankings = await this.getAllArenaRankings(lastArena.id);
    const top5PerDivision: Record<string, any[]> = {};
    for (const [divisionName, list] of Object.entries(allRankings)) {
      top5PerDivision[divisionName] = Array.isArray(list) ? list.slice(0, 5) : [];
    }
    return {
      arena: {
        id: lastArena.id,
        name: lastArena.name,
        endTime: (lastArena.endTime instanceof Date ? lastArena.endTime : new Date(lastArena.endTime)).toISOString(),
      },
      rankings: top5PerDivision,
    };
  }

  /**
   * Próxima arena agendada. Apenas instâncias (não templates).
   */
  async getNextArena(): Promise<ChallengeArena | null> {
    try {
      const now = new Date();
      const arena = await Promise.race([
        this.arenaRepository
          .createQueryBuilder('a')
          .where('a.isActive = :active', { active: true })
          .andWhere('a.startTime > :now', { now })
          .andWhere(`(a.config->>'isRecurring' IS NULL OR a.config->>'isRecurring' <> 'true')`)
          .orderBy('a.startTime', 'ASC')
          .getOne(),
        new Promise<ChallengeArena | null>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout: getNextArena')), 2000)
        ),
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

  // Arenas são criadas APENAS pelos Horários de Arena (arena_schedules) via ArenaScheduleService.createTodayArenas().
  // Não criar arenas em horários fixos (0, 6, 12, 18) para evitar arena em horários aleatórios.

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

  /** Pontos por vitória e derrota na arena (conforme regra: vitória 10, derrota 3) */
  private static readonly ARENA_WIN_POINTS = 10;
  private static readonly ARENA_LOSS_POINTS = 3;
  private static readonly ARENA_MAX_DUELS = 50;

  // Buscar ranking por faixa de nível: vitória = 10 pts, derrota = 3 pts; filtro por nível do jogador
  async getArenaRankingByDivision(arenaId: string, division: string, levelRangeBounds?: { min: number; max: number }) {
    try {
      const arena = await Promise.race([
        this.arenaRepository.findOne({
          where: { id: arenaId },
          select: ['id', 'startTime', 'endTime', 'config'],
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout: findOne arena')), 2000)
        ),
      ]).catch(() => null);

      if (!arena) return [];

      let min = levelRangeBounds?.min ?? 1;
      let max = levelRangeBounds?.max ?? 999;
      if (!levelRangeBounds) {
        const ranges = (arena.config as any)?.levelRanges || (await this.getLevelRanges());
        const range = (ranges as Array<{ min: number; max: number; name: string }>).find(r => r.name === division);
        if (range) {
          min = range.min;
          max = range.max;
        }
      }

      const duels: Duel[] = await Promise.race([
        this.duelRepository
          .createQueryBuilder('duel')
          .select(['duel.id', 'duel.player1Id', 'duel.player2Id', 'duel.result', 'duel.finishedAt'])
          .where('duel.status = :status', { status: DuelStatus.FINISHED })
          .andWhere('duel.finishedAt BETWEEN :startTime AND :endTime', {
            startTime: arena.startTime,
            endTime: arena.endTime,
          })
          .limit(1000)
          .getMany(),
        new Promise<Duel[]>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout: getArenaRankingByDivision')), 3000)
        ),
      ]).catch(() => [] as Duel[]);

      if (duels.length === 0) return [];

      const playerIds = new Set<number>();
      duels.forEach(d => {
        playerIds.add(d.player1Id);
        playerIds.add(d.player2Id);
      });

      const players: User[] = await Promise.race([
        this.userRepository.find({
          where: Array.from(playerIds).map(id => ({ id })),
          select: ['id', 'nickname', 'clanTag', 'profileImage', 'level'],
        }),
        new Promise<User[]>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout: find players')), 2000)
        ),
      ]).catch(() => [] as User[]);

      const playerMap = new Map(players.map(p => [p.id, p]));
      const inRange = (level: number) => level >= min && level <= max;

      const talismanBonusMap = await this.shopService.getEquippedTalismansForUsers(Array.from(playerIds));

      const playerScores: Map<number, { wins: number; losses: number; score: number; user: User | null }> = new Map();

      for (const duel of duels) {
        const p1 = playerMap.get(duel.player1Id);
        const p2 = playerMap.get(duel.player2Id);
        if (!p1 || !p2) continue;

        const l1 = p1.level ?? 1;
        const l2 = p2.level ?? 1;
        if (!inRange(l1) || !inRange(l2)) continue;

        const p1Bonus = talismanBonusMap.get(p1.id)?.bonusArenaPointsPct ?? 0;
        const p2Bonus = talismanBonusMap.get(p2.id)?.bonusArenaPointsPct ?? 0;
        const p1Multiplier = 1 + p1Bonus / 100;
        const p2Multiplier = 1 + p2Bonus / 100;

        if (duel.result === DuelResult.PLAYER1_WIN) {
          const p1Data = playerScores.get(p1.id) || { wins: 0, losses: 0, score: 0, user: p1 };
          p1Data.wins++;
          p1Data.score += Math.round(ArenaService.ARENA_WIN_POINTS * p1Multiplier);
          playerScores.set(p1.id, p1Data);
          const p2Data = playerScores.get(p2.id) || { wins: 0, losses: 0, score: 0, user: p2 };
          p2Data.losses++;
          p2Data.score += Math.round(ArenaService.ARENA_LOSS_POINTS * p2Multiplier);
          playerScores.set(p2.id, p2Data);
        } else if (duel.result === DuelResult.PLAYER2_WIN) {
          const p2Data = playerScores.get(p2.id) || { wins: 0, losses: 0, score: 0, user: p2 };
          p2Data.wins++;
          p2Data.score += Math.round(ArenaService.ARENA_WIN_POINTS * p2Multiplier);
          playerScores.set(p2.id, p2Data);
          const p1Data = playerScores.get(p1.id) || { wins: 0, losses: 0, score: 0, user: p1 };
          p1Data.losses++;
          p1Data.score += Math.round(ArenaService.ARENA_LOSS_POINTS * p1Multiplier);
          playerScores.set(p1.id, p1Data);
        }
      }

      const userIds = Array.from(playerScores.values())
        .filter(d => d.user !== null)
        .map(d => d.user!.id);
      const groupMembers = await this.groupMemberRepository.find({
        where: { userId: In(userIds), isActive: true },
        relations: ['group'],
        select: ['userId', 'groupId'],
      });
      const groupMap = new Map<number, string>();
      groupMembers.forEach(m => {
        if (m.group?.logo) groupMap.set(m.userId, m.group.logo);
      });

      const ranking = Array.from(playerScores.values())
        .filter(d => d.user !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 100)
        .map((data, index) => {
          const totalDuels = data.wins + data.losses;
          const remainingDuels = Math.max(0, ArenaService.ARENA_MAX_DUELS - totalDuels);
          return {
            rank: index + 1,
            userId: data.user!.id,
            nickname: data.user!.nickname,
            clanTag: data.user!.clanTag,
            profileImage: data.user!.profileImage,
            level: data.user!.level ?? 1,
            wins: data.wins,
            losses: data.losses,
            score: data.score,
            remainingDuels,
            groupLogo: groupMap.get(data.user!.id) || undefined,
          };
        });

      return ranking;
    } catch (error) {
      console.error(`[getArenaRankingByDivision] Erro:`, error);
      return [];
    }
  }

  // Buscar todos os rankings por faixa de nível da arena (usa levelRanges da arena se existir)
  async getAllArenaRankings(arenaId: string) {
    try {
      const arena = await this.arenaRepository.findOne({
        where: { id: arenaId },
        select: ['id', 'config'],
      });
      const levelRanges =
        arena && (arena.config as any)?.levelRanges?.length
          ? ((arena.config as any).levelRanges as Array<{ min: number; max: number; name: string }>)
          : await this.getLevelRanges();
      const divisions = levelRanges.map((r: { min: number; max: number; name: string }) => ({
        name: r.name,
        min: r.min,
        max: r.max,
      }));

      const rankingsPromises = divisions.map((div: { name: string; min: number; max: number }) =>
        Promise.race([
          this.getArenaRankingByDivision(arenaId, div.name, { min: div.min, max: div.max }),
          new Promise<any[]>((resolve) =>
            setTimeout(() => {
              console.warn(`[getAllArenaRankings] Timeout para divisão ${div.name}`);
              resolve([]);
            }, 5000)
          ),
        ])
      );

      const results = await Promise.all(rankingsPromises);
      const rankings: Record<string, any[]> = {};
      divisions.forEach((div: { name: string }, index: number) => {
        rankings[div.name] = results[index] || [];
      });
      return rankings;
    } catch (error) {
      console.error(`[getAllArenaRankings] Erro:`, error);
      return {};
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
    const emptyReward = () => ({ cash: 0, credits: 0, cardId: undefined, score: 0, additionalScore: 0 });
    if (!config.rewards?.levelRangeRewards && config.rewards?.top5Rewards && config.levelRanges?.length > 0) {
      config.rewards.levelRangeRewards = config.levelRanges.map((range: any) => ({
        levelRange: range.name || range,
        top1: { ...emptyReward(), ...config.rewards.top5Rewards.top1 },
        top2: { ...emptyReward(), ...config.rewards.top5Rewards.top2 },
        top3: { ...emptyReward(), ...config.rewards.top5Rewards.top3 },
        top4: { ...emptyReward(), ...config.rewards.top5Rewards.top4 },
        top5: { ...emptyReward(), ...config.rewards.top5Rewards.top5 },
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

    // Não sobrescrever startTime/endTime com null (colunas NOT NULL)
    const { startTime, endTime, ...rest } = data as Partial<ChallengeArena> & { startTime?: Date | null; endTime?: Date | null };
    if (startTime != null) (rest as any).startTime = new Date(startTime);
    if (endTime != null) (rest as any).endTime = new Date(endTime);

    Object.assign(arena, rest);
    return await this.arenaRepository.save(arena);
  }

  async deleteArena(id: string): Promise<void> {
    await this.arenaRepository.delete(id);
  }

  /**
   * Marca a arena como premiação distribuída (persistência garantida em JSONB, sem sobrescrever o config).
   */
  private async markArenaRewardsDistributed(arenaId: string, _currentConfig?: ChallengeArena['config']): Promise<void> {
    await this.arenaRepository.query(
      `UPDATE challenge_arenas
       SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{rewardsDistributed}', 'true')
       WHERE id = $1`,
      [arenaId],
    );
  }

  /**
   * Marca rewardsDistributed = true só se ainda não estiver true (atômico).
   * Usa jsonb_set para não sobrescrever o resto do config.
   * Retorna true se esta chamada foi a que marcou; false se já estava marcado.
   */
  private async markArenaRewardsDistributedIfNotAlready(arenaId: string, _currentConfig?: ChallengeArena['config']): Promise<boolean> {
    const result = await this.arenaRepository.query(
      `UPDATE challenge_arenas
       SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{rewardsDistributed}', 'true')
       WHERE id = $1
         AND (config IS NULL OR (config->>'rewardsDistributed') IS DISTINCT FROM 'true')
       RETURNING id`,
      [arenaId],
    );
    return Array.isArray(result) && result.length > 0;
  }

  /**
   * Distribuir prêmios para os top 5 de cada faixa de nível quando a arena termina.
   * Usa UPDATE atômico para marcar rewardsDistributed e evitar premiação repetida (cron ou múltiplas instâncias).
   */
  async distributeArenaRewards(arenaId: string): Promise<void> {
    try {
      const arena = await this.arenaRepository.findOne({ where: { id: arenaId } });
      if (!arena) {
        console.error(`[distributeArenaRewards] Arena ${arenaId} não encontrada`);
        return;
      }

      const now = new Date();
      if (new Date(arena.endTime) > now) {
        console.warn(`[distributeArenaRewards] Arena ${arenaId} ainda não terminou. Premiação não distribuída.`);
        return;
      }

      // Checagem em memória (evitar trabalho desnecessário; aceita boolean ou string do JSONB)
      const raw = arena.config?.rewardsDistributed as boolean | string | undefined;
      const alreadyDistributed = raw === true || String(raw) === 'true';
      if (alreadyDistributed) {
        console.log(`[distributeArenaRewards] Prêmios da arena ${arenaId} já foram distribuídos (cache).`);
        return;
      }

      const rewards = arena.config?.rewards?.levelRangeRewards;
      if (!rewards || rewards.length === 0) {
        console.log(`[distributeArenaRewards] Nenhuma premiação configurada para a arena ${arenaId}`);
        await this.markArenaRewardsDistributed(arenaId, arena.config);
        return;
      }

      // Atômico: só quem conseguir marcar no banco prossegue. Evita premiação repetida mesmo com cron a cada 5 min ou múltiplas instâncias.
      const claimed = await this.markArenaRewardsDistributedIfNotAlready(arenaId, arena.config);
      if (!claimed) {
        console.log(`[distributeArenaRewards] Prêmios da arena ${arenaId} já foram marcados como distribuídos por outro processo. Abortando.`);
        return;
      }
      // Re-buscar arena para ter config atualizado (com rewardsDistributed = true)
      const arenaAfterClaim = await this.arenaRepository.findOne({ where: { id: arenaId } });
      if (!arenaAfterClaim) return;
      const arenaRef = arenaAfterClaim;

      const levelRanges = arenaRef.config?.levelRanges || await this.getLevelRanges();
      let totalDistributed = 0;

      const arenaName = (arenaRef.config as any)?.name || arenaRef.name || 'Arena';
      const levelRangesList = (Array.isArray(levelRanges) ? levelRanges : []) as Array<{ min: number; max: number; name: string }>;

      // Para cada faixa de nível configurada
      for (const levelRangeReward of rewards) {
        const levelRangeName = levelRangeReward.levelRange;
        const rangeDef = levelRangesList.find((r) => r.name === levelRangeName);
        const levelRangeBounds = rangeDef ? { min: rangeDef.min, max: rangeDef.max } : undefined;

        // Buscar ranking top 5 dessa faixa (com bounds para filtrar por nível)
        const ranking = await this.getArenaRankingByDivision(arenaId, levelRangeName, levelRangeBounds);
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

            const talisman = await this.shopService.getEquippedTalisman(player.userId);
            const cashMult = 1 + (talisman?.bonusCashPct ?? 0) / 100;
            const scoreMult = 1 + (talisman?.bonusScorePct ?? 0) / 100;

            const cashToAdd = Math.floor((reward.cash || 0) * cashMult);
            const creditsToAdd = reward.credits || 0;
            const totalScoreToAdd = Math.floor(((reward.score || 0) + (reward.additionalScore || 0)) * scoreMult);
            const cardId = reward.cardId;

            const hasAnyReward = cashToAdd > 0 || creditsToAdd > 0 || totalScoreToAdd > 0 || (cardId && cardId.trim() !== '');

            if (hasAnyReward) {
              const updateFields: string[] = [];
              const updateValues: any[] = [];
              let paramIndex = 1;

              if (cashToAdd > 0) {
                updateFields.push(`cash = COALESCE(cash, 0) + $${paramIndex}`);
                updateValues.push(cashToAdd);
                paramIndex++;
              }

              if (creditsToAdd > 0) {
                updateFields.push(`credits = COALESCE(credits, 0) + $${paramIndex}`);
                updateValues.push(creditsToAdd);
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
                  `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, cash, credits, total_score`,
                  updateValues
                );
              }

              // Score da premiação: somar ao ranking da season e ao grupo (ranking semanal, season e geral do grupo)
              if (totalScoreToAdd > 0) {
                try {
                  await this.seasonsService.updateUserRanking(player.userId, totalScoreToAdd, true);
                } catch (seasonErr: any) {
                  console.warn(`[distributeArenaRewards] Erro ao atualizar ranking da season para usuário ${player.userId}:`, seasonErr?.message || seasonErr);
                }
                try {
                  await this.groupsService.updateMemberScore(player.userId, totalScoreToAdd);
                } catch (groupErr: any) {
                  console.warn(`[distributeArenaRewards] Erro ao atualizar score do grupo para usuário ${player.userId}:`, groupErr?.message || groupErr);
                }
              }

              if (cardId && cardId.trim() !== '') {
                try {
                  await this.shopService.addCardToUserInventory(
                    player.userId,
                    cardId,
                    'REWARD',
                    1,
                  );
                } catch (cardError) {
                  console.error(`[distributeArenaRewards] Erro ao dar carta ${cardId} para usuário ${player.userId}:`, cardError);
                }
              }

              totalDistributed++;
              console.log(`[distributeArenaRewards] Prêmio distribuído para ${user.nickname} (${levelRangeName}, posição ${position}): cash=${cashToAdd}, credits=${creditsToAdd}, score=${totalScoreToAdd}, card=${cardId || '-'}`);

              // Notificar o duelista na campainha
              const parts: string[] = [];
              if (cashToAdd > 0) parts.push(`${cashToAdd} Cash`);
              if (creditsToAdd > 0) parts.push(`${creditsToAdd} Créditos`);
              if (totalScoreToAdd > 0) parts.push(`${totalScoreToAdd} pontos`);
              if (cardId && cardId.trim() !== '') parts.push('1 Carta');
              const rewardText = parts.length ? parts.join(', ') : 'Premiação';
              const content = `Premiação ${arenaName}: ${rewardText}. ${position}º lugar na faixa ${levelRangeName}.`;
              try {
                this.duelsGateway.emitSystemMessageToUser(player.userId, {
                  id: `arena-reward-${arenaId}-${player.userId}-${Date.now()}`,
                  type: 'system',
                  content,
                  createdAt: new Date().toISOString(),
                });
              } catch (notifErr) {
                console.warn(`[distributeArenaRewards] Falha ao notificar usuário ${player.userId}:`, notifErr);
              }
            }
          }
        }
      }

      console.log(`[distributeArenaRewards] ✅ Prêmios da arena ${arenaId} distribuídos. Total: ${totalDistributed} jogadores premiados`);
    } catch (error) {
      console.error(`[distributeArenaRewards] ❌ Erro ao distribuir prêmios da arena ${arenaId}:`, error);
    }
  }

  /**
   * Encerrar arenas cujo horário de término já passou (isActive = false).
   * Roda a cada minuto para que a arena "feche" logo após o fim, antes de qualquer premiação.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeEndedArenas(): Promise<void> {
    try {
      const now = new Date();
      const ended = await this.arenaRepository.find({
        where: { isActive: true, endTime: LessThan(now) },
      });
      for (const arena of ended) {
        await this.arenaRepository.update(arena.id, { isActive: false });
        console.log(`[closeEndedArenas] Arena ${arena.name} (${arena.id}) encerrada (horário de término passou).`);
      }
    } catch (error) {
      console.error('[closeEndedArenas] Erro ao encerrar arenas:', error);
    }
  }

  /**
   * Distribuir prêmios apenas de arenas já encerradas (endTime no passado).
   * Roda a cada 5 min; a premiação só cai depois que a arena já foi fechada por closeEndedArenas.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAndDistributeRewards(): Promise<void> {
    try {
      const now = new Date();
      // Buscar apenas arenas encerradas que ainda NÃO tiveram premiação (evita reprocessar e reenviar notificações)
      const rows = await this.arenaRepository.query(
        `SELECT id FROM challenge_arenas
         WHERE "endTime" < $1
           AND (config IS NULL OR (config->>'rewardsDistributed') IS DISTINCT FROM 'true')
         ORDER BY "endTime" ASC`,
        [now],
      );
      const arenaIds = (rows || []).map((r: { id: string }) => r.id as string);

      for (const arenaId of arenaIds) {
        const arena = await this.arenaRepository.findOne({ where: { id: arenaId } });
        if (!arena) continue;
        console.log(`[checkAndDistributeRewards] Distribuindo prêmios da arena ${arena.name} (${arena.id}) (arena já encerrada).`);
        await this.distributeArenaRewards(arena.id);
        await this.arenaRepository.update(arena.id, { isActive: false });
      }
    } catch (error) {
      console.error('[checkAndDistributeRewards] Erro ao verificar arenas finalizadas:', error);
    }
  }

  /**
   * A cada minuto: se há arena ativa e ainda não notificamos "arena abriu", emite notificação para todos e marca.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndNotifyArenaOpened(): Promise<void> {
    try {
      const current = await this.getCurrentArena();
      if (!current || (current.config as any)?.notifiedOpen === true) return;

      const arenaName = (current.config as any)?.name || current.name || 'Arena';
      this.duelsGateway.emitSystemMessageToAll({
        id: `arena-opened-${current.id}-${Date.now()}`,
        type: 'system',
        content: `⚔️ A arena "${arenaName}" abriu! Participe agora na Arena de Duelos.`,
        createdAt: new Date().toISOString(),
      });
      current.config = { ...(current.config || {}), notifiedOpen: true };
      await this.arenaRepository.save(current);
    } catch (error) {
      console.warn('[checkAndNotifyArenaOpened]', error);
    }
  }
}
