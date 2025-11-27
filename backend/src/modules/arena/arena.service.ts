import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between } from 'typeorm';
import { ChallengeArena } from './arena.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duel, DuelStatus, DuelResult } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ArenaService {
  constructor(
    @InjectRepository(ChallengeArena)
    private arenaRepository: Repository<ChallengeArena>,
    @InjectRepository(Duel)
    private duelRepository: Repository<Duel>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Determinar divisão baseada no nível
  getLevelDivision(level: number): string {
    if (level <= 1) return 'Nível 1';
    if (level <= 3) return 'Nível 2-3';
    if (level <= 5) return 'Nível 4-5';
    if (level <= 10) return 'Nível 6-10';
    return 'Nível 11+';
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
      const duels = await Promise.race([
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
      ]).catch(() => []);

      if (duels.length === 0) {
        return [];
      }

      // Buscar players apenas dos duelos encontrados (uma query só)
      const playerIds = new Set<number>();
      duels.forEach(duel => {
        playerIds.add(duel.player1Id);
        playerIds.add(duel.player2Id);
      });

      const players = await Promise.race([
        this.userRepository.find({
          where: Array.from(playerIds).map(id => ({ id })),
          select: ['id', 'nickname', 'clanTag', 'profileImage', 'level']
        }),
        new Promise<User[]>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: find players')), 2000)
        )
      ]).catch(() => []);

      const playerMap = new Map(players.map(p => [p.id, p]));

      // Calcular scores por jogador na divisão
      const playerScores: Map<number, { wins: number; losses: number; score: number; user: User | null }> = new Map();

      for (const duel of duels) {
        const p1 = playerMap.get(duel.player1Id);
        const p2 = playerMap.get(duel.player2Id);
        
        if (!p1 || !p2) continue;

        const p1Division = this.getLevelDivision(p1.level || 1);
        const p2Division = this.getLevelDivision(p2.level || 1);

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

      // Converter para array e ordenar por score
      const ranking = Array.from(playerScores.values())
        .filter(data => data.user !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10) // Top 10
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
      const divisions = ['Nível 1', 'Nível 2-3', 'Nível 4-5', 'Nível 6-10', 'Nível 11+'];
      
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
}
