import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MissionCategory } from './entities/mission-category.entity';
import { Mission } from './entities/mission.entity';
import { MissionObjective } from './entities/mission-objective.entity';
import { UserMissionProgress } from './entities/user-mission-progress.entity';
import { Card } from '../cards/entities/card.entity';
import { MissionsService } from './missions.service';
import { MissionsController } from './missions.controller';
import { MissionsAdminController } from './missions-admin.controller';
import { EconomyModule } from '../economy/economy.module';
import { ShopModule } from '../shop/shop.module';
import { AuthModule } from '../auth/auth.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { BattlePassModule } from '../battle-pass/battle-pass.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MissionCategory,
      Mission,
      MissionObjective,
      UserMissionProgress,
      Card,
    ]),
    EconomyModule,
    forwardRef(() => ShopModule),
    AuthModule,
    forwardRef(() => SeasonsModule),
    forwardRef(() => BattlePassModule),
  ],
  controllers: [MissionsController, MissionsAdminController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
