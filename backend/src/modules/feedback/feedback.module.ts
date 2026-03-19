import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserFeedback } from './entities/user-feedback.entity';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackDbMigrationService } from './feedback-db-migration.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserFeedback])],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackDbMigrationService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
