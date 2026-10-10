import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedBot } from './entities/managed-bot.entity';
import { User } from '../users/entities/user.entity';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagedBot, User, Deck, DeckCard])],
  providers: [BotsService],
  controllers: [BotsController],
})
export class BotsModule {}
