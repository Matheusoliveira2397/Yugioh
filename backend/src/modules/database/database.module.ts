import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseCleanupService } from './database-cleanup.service';
import { DatabaseOptimizationService } from './database-optimization.service';
import { DuelLog } from '../duels/entities/duel-log.entity';
import { Duel } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Card } from '../cards/entities/card.entity';
import { ChatMessage, ChatMessageSchema } from '../chat/schemas/chat-message.schema';

@Module({
  imports: [
    TypeOrmModule.forFeature([DuelLog, Duel, User, Card]),
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
  ],
  providers: [DatabaseCleanupService, DatabaseOptimizationService],
  exports: [DatabaseCleanupService, DatabaseOptimizationService],
})
export class DatabaseModule {}
