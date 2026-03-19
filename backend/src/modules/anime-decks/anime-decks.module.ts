import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnimeDecksController } from './anime-decks.controller';
import { AnimeDecksService } from './anime-decks.service';
import { AnimeDecksDbMigrationService } from './anime-decks-db-migration.service';
import { AnimeDeck } from './entities/anime-deck.entity';
import { AnimeDeckCard } from './entities/anime-deck-card.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AnimeDeck, AnimeDeckCard])],
  controllers: [AnimeDecksController],
  providers: [AnimeDecksService, AnimeDecksDbMigrationService],
  exports: [AnimeDecksService],
})
export class AnimeDecksModule {}
