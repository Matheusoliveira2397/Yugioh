import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CosmeticsService } from './cosmetics.service';
import { CosmeticsController } from './cosmetics.controller';
import { Playmat } from './entities/playmat.entity';
import { Sleeve } from './entities/sleeve.entity';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Playmat, Sleeve]), UploadModule],
  controllers: [CosmeticsController],
  providers: [CosmeticsService],
  exports: [CosmeticsService],
})
export class CosmeticsModule {
  constructor() {
    console.log('🎨 CosmeticsModule loaded successfully!');
  }
}

