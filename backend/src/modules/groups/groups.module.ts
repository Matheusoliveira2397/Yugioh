import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupMessagesController } from './group-messages.controller';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupMessage } from './entities/group-message.entity';
import { User } from '../users/entities/user.entity';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Group, GroupMember, GroupMessage, User]), UploadModule],
  controllers: [GroupsController, GroupMessagesController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
