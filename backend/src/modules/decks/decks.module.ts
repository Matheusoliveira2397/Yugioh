import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DecksService } from './decks.service';
import { DecksController } from './decks.controller';
import { DecksDbMigrationService } from './decks-db-migration.service';
import { Deck } from './entities/deck.entity';
import { DeckCard } from './entities/deck-card.entity';
import { Card } from '../cards/entities/card.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Deck, DeckCard, Card, UserCard, User])],
  controllers: [DecksController],
  providers: [DecksService, DecksDbMigrationService],
  exports: [DecksService],
})
export class DecksModule {}
