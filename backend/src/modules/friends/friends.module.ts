import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { MessagesController } from './messages.controller';
import { Friendship } from './entities/friendship.entity';
import { PrivateMessage } from './entities/private-message.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Friendship, PrivateMessage, User])],
  controllers: [FriendsController, MessagesController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
