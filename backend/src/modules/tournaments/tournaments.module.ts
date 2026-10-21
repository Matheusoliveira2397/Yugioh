import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { TournamentsDbMigrationService } from './tournaments-db-migration.service';
import { Tournament } from './entities/tournament.entity';
import { TournamentType } from './entities/tournament-type.entity';
import { TournamentClass } from './entities/tournament-class.entity';
import { TournamentParticipant } from './entities/tournament-participant.entity';
import { TournamentMatch } from './entities/tournament-match.entity';
import { TournamentTypesService } from './tournament-types.service';
import { TournamentTypesController } from './tournament-types.controller';
import { DuelsModule } from '../duels/duels.module';
import { UsersModule } from '../users/users.module';
import { ShopModule } from '../shop/shop.module';
import { User } from '../users/entities/user.entity';
import { TournamentRankingService } from './tournament-ranking.service';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tournament,
      TournamentType,
      TournamentClass,
      TournamentParticipant,
      TournamentMatch,
      User,
    ]),
    ScheduleModule.forRoot(), // Para Cron Jobs
    forwardRef(() => DuelsModule),
    UsersModule,
    ShopModule,
    MissionsModule,
  ],
  controllers: [TournamentsController, TournamentTypesController],
  providers: [TournamentsService, TournamentTypesService, TournamentRankingService, TournamentsDbMigrationService],
  exports: [TournamentsService, TournamentTypesService, TournamentRankingService],
})
export class TournamentsModule {}
