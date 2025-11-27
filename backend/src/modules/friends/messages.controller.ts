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
    const userId = Number(req.user.id);
    const friendIdNum = parseInt(friendId, 10);
    if (isNaN(friendIdNum)) {
      throw new Error('ID de amigo inválido');
    }
    return this.friendsService.getMessages(userId, friendIdNum);
  }

  @Post()
  async sendMessage(
    @Request() req: any,
    @Body() body: { receiverId: string; content: string },
  ) {
    const userId = Number(req.user.id);
    const receiverId = parseInt(body.receiverId, 10);
    if (isNaN(receiverId)) {
      throw new Error('ID de destinatário inválido');
    }
    return this.friendsService.sendMessage(userId, receiverId, body.content);
  }

  @Put(':friendId/read')
  async markAsRead(@Request() req: any, @Param('friendId') friendId: string) {
    const userId = Number(req.user.id);
    const friendIdNum = parseInt(friendId, 10);
    if (isNaN(friendIdNum)) {
      throw new Error('ID de amigo inválido');
    }
    return this.friendsService.markAsRead(userId, friendIdNum);
  }
}
