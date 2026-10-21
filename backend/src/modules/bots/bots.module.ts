import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Duel } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { ManagedBot } from './entities/managed-bot.entity';
import { BotRunnerService } from './bot-runner.service';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotAiService } from './bot-ai.service';
import { BotExperienceService } from './bot-experience.service';

/**
 * Não importa DuelsModule: o BotRunner resolve Matchmaking/Gateway/Service
 * via ModuleRef depois do boot, evitando ciclo de import com Duels.
 */
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([ManagedBot, User, Deck, DeckCard, Duel]),
  ],
  providers: [BotsService, BotRunnerService, BotAiService, BotExperienceService],
  controllers: [BotsController],
})
export class BotsModule {}
