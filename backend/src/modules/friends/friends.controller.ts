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
    return this.friendsService.getFriends(req.user.id);
  }

  @Post('request')
  async sendFriendRequest(@Request() req: any, @Body() body: { username: string }) {
    return this.friendsService.sendFriendRequest(req.user.id, body.username);
  }

  @Put(':id/accept')
  async acceptFriendRequest(@Request() req: any, @Param('id') id: string) {
    return this.friendsService.acceptFriendRequest(id, req.user.id);
  }

  @Put(':id/reject')
  async rejectFriendRequest(@Request() req: any, @Param('id') id: string) {
    return this.friendsService.rejectFriendRequest(id, req.user.id);
  }
}
