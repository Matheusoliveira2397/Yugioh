import { Module, forwardRef } from '@nestjs/common';
import { DuelsModule } from '../duels/duels.module';
import { Duel } from '../duels/entities/duel.entity';
import { BotRunnerService } from './bot-runner.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedBot } from './entities/managed-bot.entity';
import { User } from '../users/entities/user.entity';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagedBot, User, Deck, DeckCard, Duel]), forwardRef(() => DuelsModule)],
  providers: [BotsService, BotRunnerService],
  controllers: [BotsController],
})
export class BotsModule {}
