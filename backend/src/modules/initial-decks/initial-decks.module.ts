import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InitialDecksController } from './initial-decks.controller';
import { InitialDecksService } from './initial-decks.service';
import { InitialDecksDbMigrationService } from './initial-decks-db-migration.service';
import { InitialDeck } from './entities/initial-deck.entity';
import { InitialDeckCard } from './entities/initial-deck-card.entity';
import { ShopModule } from '../shop/shop.module';
import { UsersModule } from '../users/users.module';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([InitialDeck, InitialDeckCard, Deck, DeckCard]),
    ShopModule,
    UsersModule,
  ],
  controllers: [InitialDecksController],
  providers: [InitialDecksService, InitialDecksDbMigrationService],
  exports: [InitialDecksService],
})
export class InitialDecksModule {}

