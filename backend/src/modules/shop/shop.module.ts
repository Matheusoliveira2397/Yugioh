import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { ShopItem } from './entities/shop-item.entity';
import { UserCard } from './entities/user-card.entity';
import { TalismanTemplate } from './entities/talisman-template.entity';
import { UserTalisman } from './entities/user-talisman.entity';
import { MaletaTemplate } from './entities/maleta-template.entity';
import { UserMaleta } from './entities/user-maleta.entity';
import { User } from '../users/entities/user.entity';
import { Card } from '../cards/entities/card.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { EconomyModule } from '../economy/economy.module';
import { CosmeticsModule } from '../cosmetics/cosmetics.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShopItem,
      UserCard,
      TalismanTemplate,
      UserTalisman,
      MaletaTemplate,
      UserMaleta,
      User,
      Card,
      DeckCard,
    ]),
    EconomyModule,
    CosmeticsModule,
    PromotionsModule,
    forwardRef(() => MissionsModule),
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
