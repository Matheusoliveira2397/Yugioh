import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { ChallengeArena } from './arena.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ArenaService {
  constructor(
    @InjectRepository(ChallengeArena)
    private arenaRepository: Repository<ChallengeArena>,
  ) {}

  async getCurrentArena(): Promise<ChallengeArena | null> {
    const now = new Date();
    
    const arena = await this.arenaRepository.findOne({
      where: {
        isActive: true,
        startTime: LessThan(now),
        endTime: MoreThan(now),
      },
      order: { startTime: 'DESC' },
    });

    return arena;
  }

  async getNextArena(): Promise<ChallengeArena | null> {
    const now = new Date();
    
    const arena = await this.arenaRepository.findOne({
      where: {
        isActive: true,
        startTime: MoreThan(now),
      },
      order: { startTime: 'ASC' },
    });

    return arena;
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
    const arena = await this.arenaRepository.findOne({
      where: { id: arenaId },
    });

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
  }
}
