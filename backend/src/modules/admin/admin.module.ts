import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { Deck } from '../decks/entities/deck.entity';
import { Transaction } from '../economy/entities/transaction.entity';
import { SeasonRanking } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Friendship } from '../friends/entities/friendship.entity';
import { PrivateMessage } from '../friends/entities/private-message.entity';
import { TournamentParticipant } from '../tournaments/entities/tournament-participant.entity';
import { TournamentMatch } from '../tournaments/entities/tournament-match.entity';
import { Tournament } from '../tournaments/entities/tournament.entity';
import { Duel } from '../duels/entities/duel.entity';
import { DuelLog } from '../duels/entities/duel-log.entity';
import { DuelHistory } from '../duels/entities/duel-history.entity';
import { Group } from '../groups/entities/group.entity';
import { News } from '../news/news.entity';
import { RedisModule } from '../redis/redis.module';
import { SiteTab } from './entities/site-tab.entity';
import { Division } from './entities/division.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { InitialDecksModule } from '../initial-decks/initial-decks.module';
import { DuelsModule } from '../duels/duels.module';
import { ChatModule } from '../chat/chat.module';
import { FriendsModule } from '../friends/friends.module';
import { Achievement } from '../users/entities/achievement.entity';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserCard,
      Deck,
      DeckCard,
      Transaction,
      SeasonRanking,
      Season,
      GroupMember,
      Friendship,
      PrivateMessage,
      TournamentParticipant,
      TournamentMatch,
      Tournament,
      Duel,
      DuelLog,
      DuelHistory,
      Group,
      News,
      SiteTab,
      Achievement,
      Division,
    ]),
    RedisModule,
    InitialDecksModule,
    DuelsModule,
    ChatModule,
    FriendsModule,
    UploadModule,
    UsersModule,
  ],
  controllers: [AdminController, PublicController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
