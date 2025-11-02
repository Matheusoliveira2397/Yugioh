import { Injectable, Inject } from '@nestjs/common';
import { RedisClientType } from 'redis';

export interface DuelState {
  id: string;
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  player1LifePoints: number;
  player2LifePoints: number;
  status: 'waiting' | 'active' | 'finished';
  winnerId?: string;
  startedAt: Date;
}

@Injectable()
export class DuelService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redisClient: RedisClientType,
  ) {}

  async createDuel(player1Id: string, player2Id: string): Promise<DuelState> {
    const duelId = `duel:${Date.now()}:${Math.random()}`;
    
    const duel: DuelState = {
      id: duelId,
      player1Id,
      player2Id,
      currentTurn: player1Id,
      player1LifePoints: 8000,
      player2LifePoints: 8000,
      status: 'active',
      startedAt: new Date(),
    };

    await this.redisClient.setEx(
      duelId,
      3600, // 1 hora de expiração
      JSON.stringify(duel),
    );

    return duel;
  }

  async getDuel(duelId: string): Promise<DuelState | null> {
    const data = await this.redisClient.get(duelId);
    return data ? JSON.parse(data) : null;
  }

  async updateDuel(duelId: string, updates: Partial<DuelState>): Promise<DuelState> {
    const duel = await this.getDuel(duelId);
    if (!duel) {
      throw new Error('Duel not found');
    }

    const updated = { ...duel, ...updates };
    await this.redisClient.setEx(duelId, 3600, JSON.stringify(updated));
    
    return updated;
  }

  async endDuel(duelId: string, winnerId: string): Promise<void> {
    await this.updateDuel(duelId, {
      status: 'finished',
      winnerId,
    });
  }

  async switchTurn(duelId: string): Promise<DuelState> {
    const duel = await this.getDuel(duelId);
    if (!duel) {
      throw new Error('Duel not found');
    }

    const nextTurn = duel.currentTurn === duel.player1Id 
      ? duel.player2Id 
      : duel.player1Id;

    return this.updateDuel(duelId, { currentTurn: nextTurn });
  }
}
