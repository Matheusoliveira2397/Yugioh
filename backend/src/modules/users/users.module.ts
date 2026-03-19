import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersCosmeticsController } from './users-cosmetics.controller';
import { UserSystemNotificationsDbMigrationService } from './user-system-notifications-db-migration.service';
import { User } from './entities/user.entity';
import { Achievement } from './entities/achievement.entity';
import { UserSystemNotification } from './entities/user-system-notification.entity';
import { AchievementsService } from './achievements.service';
import { UploadModule } from '../upload/upload.module';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';
import { SeasonRanking } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Group } from '../groups/entities/group.entity';
import { LevelsModule } from '../levels/levels.module';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Achievement, UserSystemNotification, SeasonRanking, Season, GroupMember, Group, Deck, DeckCard]),
    UploadModule,
    MailModule,
    RedisModule,
    LevelsModule,
  ],
  controllers: [UsersController, UsersCosmeticsController],
  providers: [UsersService, AchievementsService, UserSystemNotificationsDbMigrationService],
  exports: [UsersService, AchievementsService],
})
export class UsersModule {}
