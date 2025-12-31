import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
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
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    }),
  ],
  controllers: [FriendsController, MessagesController],
  providers: [FriendsService, FriendsGateway],
  exports: [FriendsService, FriendsGateway],
})
export class FriendsModule {}
