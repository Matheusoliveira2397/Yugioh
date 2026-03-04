import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { ShopItem } from './entities/shop-item.entity';
import { UserCard } from './entities/user-card.entity';
import { User } from '../users/entities/user.entity';
import { Card } from '../cards/entities/card.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShopItem, UserCard, User, Card, DeckCard]),
    EconomyModule,
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {
  constructor() {
    console.log('🛒 ShopModule loaded successfully!');
  }
}
