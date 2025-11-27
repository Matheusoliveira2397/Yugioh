import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
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

  @Post('request')
  async sendFriendRequest(@Request() req: any, @Body() body: { username: string }) {
    const userId = Number(req.user.id);
    return this.friendsService.sendFriendRequest(userId, body.username);
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
}
