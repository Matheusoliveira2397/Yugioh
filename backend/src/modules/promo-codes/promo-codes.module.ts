import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode } from './entities/promo-code.entity';
import { PromoCodeRedemption } from './entities/promo-code-redemption.entity';
import { Card } from '../cards/entities/card.entity';
import { PromoCodesService } from './promo-codes.service';
import { PromoCodesController } from './promo-codes.controller';
import { PromoCodesAdminController } from './promo-codes-admin.controller';
import { EconomyModule } from '../economy/economy.module';
import { ShopModule } from '../shop/shop.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PromoCode, PromoCodeRedemption, Card]),
    EconomyModule,
    ShopModule,
    AuthModule,
  ],
  controllers: [PromoCodesController, PromoCodesAdminController],
  providers: [PromoCodesService],
  exports: [PromoCodesService],
})
export class PromoCodesModule {}
