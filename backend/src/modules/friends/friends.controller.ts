import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
  Delete,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  async getFriends(@Request() req: any) {
    const userId = Number(req.user.id);
    return this.friendsService.getFriends(userId);
  }

  @Get('user/:userId')
  async getUserFriends(@Request() req: any, @Param('userId') userId: string) {
    const targetUserId = Number(userId);
    if (isNaN(targetUserId)) {
      throw new Error('ID de usuário inválido');
    }
    return this.friendsService.getFriends(targetUserId);
  }

  @Post('request')
  async sendFriendRequest(@Request() req: any, @Body() body: { username?: string; userId?: number }) {
    const userId = Number(req.user.id);
    const friendIdentifier = body.userId || body.username;
    if (!friendIdentifier) {
      throw new Error('username ou userId é obrigatório');
    }
    return this.friendsService.sendFriendRequest(userId, friendIdentifier);
  }

  @Get('status/:otherUserId')
  async getFriendshipStatus(@Request() req: any, @Param('otherUserId') otherUserId: string) {
    const userId = Number(req.user.id);
    const otherUserIdNum = Number(otherUserId);
    return this.friendsService.getFriendshipStatus(userId, otherUserIdNum);
  }

  @Get('pending')
  async getPendingRequests(@Request() req: any) {
    const userId = Number(req.user.id);
    return this.friendsService.getPendingRequests(userId);
  }

  @Put(':id/accept')
  async acceptFriendRequest(@Request() req: any, @Param('id') id: string) {
    const userId = Number(req.user.id);
    return this.friendsService.acceptFriendRequest(id, userId);
  }

  @Put(':id/reject')
  async rejectFriendRequest(@Request() req: any, @Param('id') id: string) {
    const userId = Number(req.user.id);
    return this.friendsService.rejectFriendRequest(id, userId);
  }

  @Delete('cancel/:otherUserId')
  async cancelFriendRequest(@Request() req: any, @Param('otherUserId') otherUserId: string) {
    const userId = Number(req.user.id);
    const otherUserIdNum = Number(otherUserId);
    if (isNaN(otherUserIdNum)) {
      throw new Error('ID de usuário inválido');
    }
    return this.friendsService.cancelFriendRequest(userId, otherUserIdNum);
  }

  @Delete('remove/:otherUserId')
  async removeFriend(@Request() req: any, @Param('otherUserId') otherUserId: string) {
    const userId = Number(req.user.id);
    const otherUserIdNum = Number(otherUserId);
    if (isNaN(otherUserIdNum)) {
      throw new Error('ID de usuário inválido');
    }
    return this.friendsService.removeFriend(userId, otherUserIdNum);
  }
}
