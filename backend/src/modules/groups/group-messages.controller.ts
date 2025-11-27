import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';

@Controller('groups/messages')
@UseGuards(JwtAuthGuard)
export class GroupMessagesController {
  constructor(private readonly groupsService: GroupsService) {
    console.log('✅ GroupMessagesController inicializado');
  }

  @Get(':groupId')
  async getGroupMessages(
    @Request() req: ExpressRequest & { user: any },
    @Param('groupId') groupId: string,
    @Query('limit') limit?: string,
  ) {
    const userId = Number(req.user.id);
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.groupsService.getGroupMessages(groupId, userId, limitNum);
  }

  @Post(':groupId')
  async sendGroupMessage(
    @Request() req: ExpressRequest & { user: any },
    @Param('groupId') groupId: string,
    @Body() body: { message: string },
  ) {
    console.log(`📨 [sendGroupMessage] Recebida requisição POST /groups/messages/${groupId}`);
    console.log(`📨 [sendGroupMessage] Body:`, body);
    const userId = Number(req.user.id);
    console.log(`📨 [sendGroupMessage] UserId:`, userId);
    const result = await this.groupsService.sendGroupMessage(groupId, userId, body.message);
    console.log(`✅ [sendGroupMessage] Mensagem enviada com sucesso`);
    return result;
  }
}

