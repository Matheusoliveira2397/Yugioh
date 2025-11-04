import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeasonsService } from './seasons.service';
import { SeasonsController } from './seasons.controller';
import { Season } from './entities/season.entity';
import { SeasonRanking } from './entities/season-ranking.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Season, SeasonRanking, User])],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
