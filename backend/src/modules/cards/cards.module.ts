import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { Card } from './entities/card.entity';
import { UploadModule } from '../upload/upload.module';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Card]),
    UploadModule,
    forwardRef(() => ShopModule),
  ],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
