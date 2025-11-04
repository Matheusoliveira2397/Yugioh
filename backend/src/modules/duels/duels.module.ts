import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DuelsService } from './duels.service';
import { DuelsController } from './duels.controller';
import { DuelsGateway } from './duels.gateway';
import { Duel } from './entities/duel.entity';
import { DuelLog } from './entities/duel-log.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Duel, DuelLog, User])],
  controllers: [DuelsController],
  providers: [DuelsService, DuelsGateway],
  exports: [DuelsService],
})
export class DuelsModule {}
