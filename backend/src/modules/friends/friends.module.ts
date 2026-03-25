import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { MessagesController } from './messages.controller';
import { FriendsGateway } from './friends.gateway';
import { Friendship } from './entities/friendship.entity';
import { PrivateMessage } from './entities/private-message.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, PrivateMessage, User]),
    AuthModule,
  ],
  controllers: [FriendsController, MessagesController],
  providers: [FriendsService, FriendsGateway],
  exports: [FriendsService, FriendsGateway],
})
export class FriendsModule {}
