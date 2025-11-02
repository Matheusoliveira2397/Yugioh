import { Module } from '@nestjs/common';
import { DuelGateway } from './duel.gateway';
import { DuelService } from './duel.service';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [RedisModule, UsersModule],
  providers: [DuelGateway, DuelService],
  exports: [DuelService],
})
export class DuelModule {}
