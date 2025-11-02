import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';
import { RedisModule } from '../redis/redis.module';
import { DuelModule } from '../duel/duel.module';

@Module({
  imports: [RedisModule, DuelModule],
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
