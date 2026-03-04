import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersCosmeticsController } from './users-cosmetics.controller';
import { User } from './entities/user.entity';
import { Achievement } from './entities/achievement.entity';
import { AchievementsService } from './achievements.service';
import { UploadModule } from '../upload/upload.module';
import { MailModule } from '../mail/mail.module';
import { SeasonRanking } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Group } from '../groups/entities/group.entity';
import { LevelsModule } from '../levels/levels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Achievement, SeasonRanking, Season, GroupMember, Group]),
    UploadModule,
    MailModule,
    LevelsModule,
  ],
  controllers: [UsersController, UsersCosmeticsController],
  providers: [UsersService, AchievementsService],
  exports: [UsersService, AchievementsService],
})
export class UsersModule {}
