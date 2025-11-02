import { Injectable, Inject } from '@nestjs/common';
import { RedisClientType } from 'redis';

interface QueuePlayer {
  userId: string;
  socketId: string;
  rating: number;
  joinedAt: number;
}

@Injectable()
export class MatchmakingService {
  private readonly QUEUE_KEY = 'matchmaking:queue';
  private readonly RANGE_INITIAL = 100;
  private readonly RANGE_INCREMENT = 50;
  private readonly TIME_THRESHOLD = 30000; // 30 segundos

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redisClient: RedisClientType,
  ) {}

  async addToQueue(player: QueuePlayer): Promise<void> {
    await this.redisClient.zAdd(this.QUEUE_KEY, {
      score: player.rating,
      value: JSON.stringify(player),
    });
  }

  async removeFromQueue(userId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((p) => p.userId !== userId);
    
    await this.redisClient.del(this.QUEUE_KEY);
    
    for (const player of filtered) {
      await this.addToQueue(player);
    }
  }

  async findMatch(player: QueuePlayer): Promise<QueuePlayer | null> {
    const queue = await this.getQueue();
    const now = Date.now();
    const waitTime = now - player.joinedAt;
    
    // Aumentar range de rating baseado no tempo de espera
    const ratingRange = this.RANGE_INITIAL + 
      Math.floor(waitTime / this.TIME_THRESHOLD) * this.RANGE_INCREMENT;

    const minRating = player.rating - ratingRange;
    const maxRating = player.rating + ratingRange;

    // Procurar oponente no range de rating
    for (const opponent of queue) {
      if (
        opponent.userId !== player.userId &&
        opponent.rating >= minRating &&
        opponent.rating <= maxRating
      ) {
        return opponent;
      }
    }

    return null;
  }

  async getQueue(): Promise<QueuePlayer[]> {
    const members = await this.redisClient.zRange(this.QUEUE_KEY, 0, -1);
    return members.map((m) => JSON.parse(m));
  }

  async getQueueSize(): Promise<number> {
    return await this.redisClient.zCard(this.QUEUE_KEY);
  }
}
