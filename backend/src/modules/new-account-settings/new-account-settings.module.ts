import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewAccountSettings } from '../admin/entities/new-account-settings.entity';
import { NewAccountSettingsService } from './new-account-settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewAccountSettings]),
  ],
  providers: [NewAccountSettingsService],
  exports: [NewAccountSettingsService],
})
export class NewAccountSettingsModule {}

