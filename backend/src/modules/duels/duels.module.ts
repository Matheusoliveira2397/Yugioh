import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DuelsService } from './duels.service';
import { DuelsController } from './duels.controller';
import { DuelsGateway } from './duels.gateway';
import { MatchmakingService } from './matchmaking.service';
import { DuelQueueService } from './duel-queue.service';
import { Duel } from './entities/duel.entity';
import { DuelLog } from './entities/duel-log.entity';
import { User } from '../users/entities/user.entity';
import { DecksModule } from '../decks/decks.module';
import { ArenaModule } from '../arena/arena.module';
import { GroupsModule } from '../groups/groups.module';
import { CardsModule } from '../cards/cards.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Duel, DuelLog, User]),
    DecksModule,
    forwardRef(() => ArenaModule),
    forwardRef(() => GroupsModule),
    forwardRef(() => CardsModule),
    AuthModule,
  ],
  controllers: [DuelsController],
  providers: [DuelsService, DuelsGateway, MatchmakingService, DuelQueueService],
  exports: [DuelsService],
})
export class DuelsModule {}
