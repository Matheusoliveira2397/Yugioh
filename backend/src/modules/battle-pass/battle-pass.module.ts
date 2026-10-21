import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BattlePassSeason } from './entities/battle-pass-season.entity';
import { BattlePassLevel } from './entities/battle-pass-level.entity';
import { UserBattlePass } from './entities/user-battle-pass.entity';
import { Card } from '../cards/entities/card.entity';
import { BattlePassService } from './battle-pass.service';
import { BattlePassController } from './battle-pass.controller';
import { BattlePassAdminController } from './battle-pass-admin.controller';
import { EconomyModule } from '../economy/economy.module';
import { ShopModule } from '../shop/shop.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BattlePassSeason,
      BattlePassLevel,
      UserBattlePass,
      Card,
    ]),
    EconomyModule,
    ShopModule,
    AuthModule,
  ],
  controllers: [BattlePassController, BattlePassAdminController],
  providers: [BattlePassService],
  exports: [BattlePassService],
})
export class BattlePassModule {}
