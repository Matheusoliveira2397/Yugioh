import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupRequest } from './entities/group-request.entity';
import { User } from '../users/entities/user.entity';
import { Achievement } from '../users/entities/achievement.entity';
import { UserSystemNotification } from '../users/entities/user-system-notification.entity';
import { UploadModule } from '../upload/upload.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { DuelsModule } from '../duels/duels.module';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, GroupMember, GroupRequest, User, Achievement, UserSystemNotification]),
    UploadModule,
    SeasonsModule,
    forwardRef(() => DuelsModule),
    MissionsModule,
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
