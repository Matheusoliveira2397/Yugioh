import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createGroup(
    @Request() req: ExpressRequest & { user: any },
    @Body() body: { name: string; tag: string; description?: string }
  ) {
    return this.groupsService.createGroup(req.user.id, body.name, body.tag, body.description);
  }

  @Post('join/:groupId')
  @UseGuards(JwtAuthGuard)
  async joinGroup(@Request() req: ExpressRequest & { user: any }, @Param('groupId') groupId: string) {
    return this.groupsService.joinGroup(req.user.id, groupId);
  }

  @Delete('leave/:groupId')
  @UseGuards(JwtAuthGuard)
  async leaveGroup(@Request() req: ExpressRequest & { user: any }, @Param('groupId') groupId: string) {
    return this.groupsService.leaveGroup(req.user.id, groupId);
  }

  @Get('all')
  async getAllGroups(@Query('public') isPublic?: string) {
    const publicFilter = isPublic === 'true' ? true : isPublic === 'false' ? false : undefined;
    return this.groupsService.getAllGroups(publicFilter);
  }

  @Get(':id')
  async getGroup(@Param('id') id: string) {
    return this.groupsService.getGroup(id);
  }

  @Get(':id/ranking/weekly')
  async getWeeklyRanking(@Param('id') id: string) {
    return this.groupsService.getWeeklyRanking(id);
  }

  @Get(':id/ranking/season')
  async getSeasonRanking(@Param('id') id: string) {
    return this.groupsService.getSeasonRanking(id);
  }

  @Get(':id/ranking/total')
  async getTotalRanking(@Param('id') id: string) {
    return this.groupsService.getTotalRanking(id);
  }

  @Get('leaderboard/groups')
  async getGroupsRanking() {
    return this.groupsService.getGroupsRanking();
  }

  @Get('ranking/top5')
  async getTop5Groups() {
    return this.groupsService.getTop5Groups();
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteGroup(@Request() req: ExpressRequest & { user: any }, @Param('id') id: string) {
    return this.groupsService.deleteGroup(req.user.id, id);
  }
}
