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

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get(':friendId')
  async getMessages(@Request() req: any, @Param('friendId') friendId: string) {
    return this.friendsService.getMessages(req.user.id, friendId);
  }

  @Post()
  async sendMessage(
    @Request() req: any,
    @Body() body: { receiverId: string; content: string },
  ) {
    return this.friendsService.sendMessage(
      req.user.id,
      body.receiverId,
      body.content,
    );
  }

  @Put(':friendId/read')
  async markAsRead(@Request() req: any, @Param('friendId') friendId: string) {
    return this.friendsService.markAsRead(req.user.id, friendId);
  }
}
