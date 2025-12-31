import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DuelsService } from './duels.service';
import { DuelsController } from './duels.controller';
import { DuelsGateway } from './duels.gateway';
import { MatchmakingService } from './matchmaking.service';
import { DuelQueueService } from './duel-queue.service';
import { DuelsDbMigrationService } from './duels-db-migration.service';
import { CardEffectsService } from './services/card-effects.service';
import { DuelUtilsService } from './services/duel-utils.service';
import { CardEffectHandlersService } from './services/card-effect-handlers.service';
import { FieldActionsService } from './services/field-actions.service';
import { TurnPhaseService } from './services/turn-phase.service';
import { Duel } from './entities/duel.entity';
import { DuelLog } from './entities/duel-log.entity';
import { DuelHistory } from './entities/duel-history.entity';
import { User } from '../users/entities/user.entity';
import { DecksModule } from '../decks/decks.module';
import { ArenaModule } from '../arena/arena.module';
import { GroupsModule } from '../groups/groups.module';
import { CardsModule } from '../cards/cards.module';
import { AuthModule } from '../auth/auth.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { UsersModule } from '../users/users.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { LevelsModule } from '../levels/levels.module';
import { AdminModule } from '../admin/admin.module';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Duel, DuelLog, DuelHistory, User]),
    DecksModule,
    forwardRef(() => ArenaModule),
    forwardRef(() => GroupsModule),
    forwardRef(() => CardsModule),
    forwardRef(() => TournamentsModule),
    forwardRef(() => SeasonsModule),
    AuthModule,
    UsersModule,
    LevelsModule,
    forwardRef(() => AdminModule),
    EconomyModule,
  ],
  controllers: [DuelsController],
  providers: [
    DuelsService,
    DuelsGateway,
    MatchmakingService,
    DuelQueueService,
    DuelsDbMigrationService,
    CardEffectsService,
    DuelUtilsService,
    CardEffectHandlersService,
    FieldActionsService,
    TurnPhaseService,
  ],
  exports: [
    DuelsService,
    DuelsGateway,
    CardEffectsService,
    DuelUtilsService,
    CardEffectHandlersService,
    FieldActionsService,
    TurnPhaseService,
  ],
})
export class DuelsModule {}
