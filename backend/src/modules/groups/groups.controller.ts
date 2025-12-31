import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, UseInterceptors, UploadedFiles, ForbiddenException, BadRequestException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';
import { UploadService } from '../upload/upload.service';

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly uploadService: UploadService,
  ) {
    console.log('✅ GroupsController inicializado - Rotas de mensagens registradas');
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]))
  async createGroup(
    @Request() req: ExpressRequest & { user: any },
    @Body() body: { name: string; tag: string; description?: string },
    @UploadedFiles() files?: { logo?: Express.Multer.File[], banner?: Express.Multer.File[] }
  ) {
    const userId = Number(req.user.id);
    
    let logo: string | undefined;
    let banner: string | undefined;
    
    // Logo é obrigatória
    if (!files || !files.logo || !files.logo[0]) {
      throw new BadRequestException('A logo do clã é obrigatória');
    }
    
    // Processar uploads
    const tempId = `temp_${Date.now()}`;
    logo = await this.uploadService.uploadGroupLogo(files.logo[0], tempId);
    
    if (files.banner && files.banner[0]) {
      banner = await this.uploadService.uploadGroupBanner(files.banner[0], tempId);
    }
    
    const group = await this.groupsService.createGroup(userId, body.name, body.tag, body.description, logo, banner);
    
    return group;
  }

  @Post('join/:groupId')
  @UseGuards(JwtAuthGuard)
  async joinGroup(@Request() req: ExpressRequest & { user: any }, @Param('groupId') groupId: string) {
    const userId = Number(req.user.id);
    return this.groupsService.joinGroup(userId, groupId);
  }

  @Delete('leave/:groupId')
  @UseGuards(JwtAuthGuard)
  async leaveGroup(@Request() req: ExpressRequest & { user: any }, @Param('groupId') groupId: string) {
    const userId = Number(req.user.id);
    return this.groupsService.leaveGroup(userId, groupId);
  }

  @Get('all')
  async getAllGroups(@Query('public') isPublic?: string) {
    const publicFilter = isPublic === 'true' ? true : isPublic === 'false' ? false : undefined;
    return this.groupsService.getAllGroups(publicFilter);
  }

  @Get('leaderboard/groups')
  async getGroupsRanking() {
    return this.groupsService.getGroupsRanking();
  }

  @Get('ranking/season')
  async getGroupsSeasonRanking() {
    return this.groupsService.getGroupsSeasonRanking();
  }

  @Get('ranking/general')
  async getGroupsGeneralRanking() {
    return this.groupsService.getGroupsGeneralRanking();
  }

  @Get('ranking/top5')
  async getTop5Groups() {
    return this.groupsService.getTop5Groups();
  }


  // Todas as rotas específicas devem vir ANTES de @Get(':id')
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

  @Get(':id/achievements')
  async getGroupAchievements(@Param('id') id: string) {
    return this.groupsService.getGroupAchievements(id);
  }

  // Rota genérica por último
  @Get(':id')
  async getGroup(@Param('id') id: string) {
    return this.groupsService.getGroup(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]))
  async updateGroup(
    @Request() req: ExpressRequest & { user: any },
    @Param('id') id: string,
    @Body() body: { name?: string; tag?: string; description?: string; isPublic?: boolean },
    @UploadedFiles() files?: { logo?: Express.Multer.File[], banner?: Express.Multer.File[] }
  ) {
    const userId = Number(req.user.id);
    
    const updateData: any = {};
    
    if (body.name) updateData.name = body.name;
    if (body.tag) updateData.tag = body.tag;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isPublic !== undefined) {
      updateData.isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : body.isPublic === 'true' || body.isPublic === true;
    }
    
    // Processar uploads se houver arquivos
    if (files) {
      if (files.logo && files.logo[0]) {
        const tempId = `temp_${Date.now()}`;
        updateData.logo = await this.uploadService.uploadGroupLogo(files.logo[0], tempId);
      }
      
      if (files.banner && files.banner[0]) {
        const tempId = `temp_${Date.now()}`;
        updateData.banner = await this.uploadService.uploadGroupBanner(files.banner[0], tempId);
      }
    }
    
    return this.groupsService.updateGroup(userId, id, updateData);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteGroup(@Request() req: ExpressRequest & { user: any }, @Param('id') id: string) {
    const userId = Number(req.user.id);
    return this.groupsService.deleteGroup(userId, id);
  }

  @Post(':id/promote/:memberUserId')
  @UseGuards(JwtAuthGuard)
  async promoteMember(
    @Request() req: ExpressRequest & { user: any },
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Body() body: { role: string }
  ) {
    const userId = Number(req.user.id);
    const memberId = Number(memberUserId);
    const role = body.role as any; // 'CO_LEADER' ou 'ELDER'
    return this.groupsService.promoteMember(userId, id, memberId, role);
  }

  @Post(':id/demote/:memberUserId')
  @UseGuards(JwtAuthGuard)
  async demoteMember(
    @Request() req: ExpressRequest & { user: any },
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string
  ) {
    const userId = Number(req.user.id);
    const memberId = Number(memberUserId);
    return this.groupsService.demoteMember(userId, id, memberId);
  }

  @Get('user/:userId/info')
  @UseGuards(JwtAuthGuard)
  async getUserGroupInfo(
    @Request() req: ExpressRequest & { user: any },
    @Param('userId') userId: string
  ) {
    const userIdNum = Number(userId);
    // Verificar se o usuário está buscando suas próprias informações ou é admin
    if (Number(req.user.id) !== userIdNum && req.user.role !== 'ADMIN' && req.user.role !== 'MASTER') {
      throw new ForbiddenException('Você não tem permissão para acessar essas informações');
    }
    return this.groupsService.getUserGroupInfo(userIdNum);
  }
}
