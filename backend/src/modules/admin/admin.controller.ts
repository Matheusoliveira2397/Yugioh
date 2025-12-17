import { Controller, Put, Param, UseGuards, Get, Query, Delete, Post, Body, UseInterceptors, UploadedFile, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminService } from './admin.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AchievementType } from '../users/entities/achievement.entity';
import { UploadService } from '../upload/upload.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private usersService: UsersService,
    private uploadService: UploadService,
  ) {}

  // Gestão de Usuários
  @Get('users')
  getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    // Converter query parameters para números, com valores padrão
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    // Validar que são números válidos
    const validPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const validLimit = isNaN(limitNum) || limitNum < 1 ? 50 : limitNum;
    
    return this.adminService.getAllUsers(validPage, validLimit);
  }

  @Get('users/online')
  getOnlineUsers() {
    return this.adminService.getOnlineUsers();
  }

  @Get('users/:id')
  getUserDetails(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.getUserDetails(userId);
  }

  @Get('users/:id/ip-history')
  getUserIpHistory(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.getUserIpHistory(userId);
  }

  @Delete('users/:id/ban')
  banUser(@Param('id') id: string, @Body() body: { reason?: string }) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.banUser(userId, body.reason);
  }

  @Put('users/:id/unban')
  unbanUser(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.unbanUser(userId);
  }

  // Promoções e Demissões
  @Put('users/:id/promote/master')
  promoteToMaster(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.promoteToMaster(userId);
  }

  @Put('users/:id/promote/admin')
  promoteToAdmin(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.promoteToAdmin(userId);
  }

  @Put('users/:id/demote')
  demoteToPlayer(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.demoteToPlayer(userId);
  }

  // Editar Recursos do Usuário
  @Put('users/:id/resources')
  updateUserResources(
    @Param('id') id: string,
    @Body() body: { credits?: number; cash?: number; rating?: number }
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.updateUserResources(userId, body);
  }

  // Estatísticas do Sistema
  @Get('stats/overview')
  getSystemStats() {
    return this.adminService.getSystemStats();
  }

  // Excluir Usuário
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new Error('ID inválido');
    }
    return this.adminService.deleteUser(userId);
  }

  // Gerenciamento de Abas do Site
  @Get('site-tabs')
  getSiteTabs() {
    return this.adminService.getSiteTabs();
  }

  @Get('site-tabs/active')
  getActiveSiteTabs() {
    return this.adminService.getActiveSiteTabs();
  }

  @Put('site-tabs/:key')
  updateSiteTab(@Param('key') key: string, @Body() body: { isActive: boolean }) {
    return this.adminService.updateSiteTab(key, body.isActive);
  }

  @Post('site-tabs/initialize')
  initializeSiteTabs() {
    return this.adminService.initializeSiteTabs();
  }

  // Resetar deck do Admin
  @Post('reset-admin-deck')
  resetAdminDeck() {
    return this.adminService.resetAdminDeck();
  }

  // Adicionar recursos em massa
  @Post('bulk-add-resources')
  addBulkResources(
    @Body() body: {
      credits?: number;
      cash?: number;
      filter: 'all' | 'online' | 'loggedToday' | 'loggedThisWeek' | 'loggedThisMonth';
    }
  ) {
    return this.adminService.addBulkResources(body);
  }

  // Enviar mensagem para todos os usuários
  @Post('messages/broadcast')
  broadcastMessage(@Body() body: { content: string }) {
    return this.adminService.broadcastMessage(body.content);
  }

  // Enviar conquista para usuário(s)
  @Post('achievements/send')
  @UseInterceptors(FileInterceptor('image'))
  async sendAchievement(
    @Body() body: { userIds: string; title: string; description?: string; type?: string },
    @UploadedFile() file?: Express.Multer.File
  ) {
    // Aceita IDs numéricos ou nicknames separados por vírgula
    // Exemplo: "1,2,3" ou "admin,player1,player2" ou "1,admin,2"
    const identifiers = body.userIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    let imagePath: string | undefined;
    if (file && this.uploadService) {
      imagePath = await this.uploadService.uploadAchievementImage(file, body.title);
    }

    const type = body.type ? (AchievementType[body.type as keyof typeof AchievementType] || AchievementType.VICTORIES) : AchievementType.VICTORIES;

    return this.adminService.sendAchievement(identifiers, body.title, body.description || '', imagePath, type);
  }

  // ==================== DIVISÕES ====================

  @Get('divisions')
  getAllDivisions() {
    return this.adminService.getAllDivisions();
  }

  @Get('divisions/:id')
  getDivisionById(@Param('id') id: string) {
    return this.adminService.getDivisionById(id);
  }

  @Post('divisions')
  createDivision(@Body() body: {
    name: string;
    order: number;
    maxDuelistas: number;
    sobe: number;
    desce: number;
    premiacao?: string;
    premiacaoJson?: any;
  }) {
    return this.adminService.createDivision(body);
  }

  @Put('divisions/:id')
  updateDivision(
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      order?: number;
      maxDuelistas?: number;
      sobe?: number;
      desce?: number;
      premiacao?: string;
      premiacaoJson?: any;
    },
  ) {
    return this.adminService.updateDivision(id, body);
  }

  @Delete('divisions/:id')
  deleteDivision(@Param('id') id: string) {
    return this.adminService.deleteDivision(id);
  }

  @Post('seasons/ensure-all-users-have-ranking')
  async ensureAllUsersHaveRanking() {
    return this.adminService.ensureAllUsersHaveSeasonRanking();
  }

  @Post('users/recalculate-levels')
  async recalculateAllUsersLevels() {
    return this.usersService.recalculateAllUsersLevels();
  }
}
