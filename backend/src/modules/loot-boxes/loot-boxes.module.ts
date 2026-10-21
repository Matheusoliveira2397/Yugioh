import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../cards/entities/card.entity';
import { LootBox, LootBoxOpening } from './loot-box.entity';
import { LootBoxesService } from './loot-boxes.service';
import { LootBoxesController } from './loot-boxes.controller';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LootBox, LootBoxOpening, Card]),
    MissionsModule,
  ],
  controllers: [LootBoxesController],
  providers: [LootBoxesService],
  exports: [LootBoxesService],
})
export class LootBoxesModule {}
