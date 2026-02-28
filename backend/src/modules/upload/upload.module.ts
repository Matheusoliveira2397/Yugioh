import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadService } from './upload.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [UploadService, SupabaseStorageService],
  exports: [UploadService],
})
export class UploadModule {}
