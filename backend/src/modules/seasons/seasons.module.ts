import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeasonsService } from './seasons.service';
import { SeasonsController } from './seasons.controller';
import { SeasonsDbMigrationService } from './seasons-db-migration.service';
import { Season } from './entities/season.entity';
import { SeasonRanking } from './entities/season-ranking.entity';
import { User } from '../users/entities/user.entity';
import { DivisionsModule } from '../divisions/divisions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Season, SeasonRanking, User]),
    DivisionsModule,
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService, SeasonsDbMigrationService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
