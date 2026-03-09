import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPromotion } from './entities/card-promotion.entity';
import { PromotionsService } from './promotions.service';
import { Card } from '../cards/entities/card.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CardPromotion, Card]),
  ],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
