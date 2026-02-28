import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { News } from './news.entity';
import { NewsView } from './news-view.entity';
import { NewsDbMigrationService } from './news-db-migration.service';

@Module({
  imports: [TypeOrmModule.forFeature([News, NewsView])],
  controllers: [NewsController],
  providers: [NewsService, NewsDbMigrationService],
  exports: [NewsService],
})
export class NewsModule {}
