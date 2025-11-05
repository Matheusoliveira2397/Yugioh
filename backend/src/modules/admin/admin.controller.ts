import { Controller, Put, Param, UseGuards, Get, Query, Delete, Post, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // Gestão de Usuários
  @Get('users')
  getAllUsers(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.adminService.getAllUsers(page, limit);
  }

  @Get('users/online')
  getOnlineUsers() {
    return this.adminService.getOnlineUsers();
  }

  @Get('users/:id')
  getUserDetails(@Param('id') userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Get('users/:id/ip-history')
  getUserIpHistory(@Param('id') userId: string) {
    return this.adminService.getUserIpHistory(userId);
  }

  @Delete('users/:id/ban')
  banUser(@Param('id') userId: string, @Body() body: { reason?: string }) {
    return this.adminService.banUser(userId, body.reason);
  }

  @Put('users/:id/unban')
  unbanUser(@Param('id') userId: string) {
    return this.adminService.unbanUser(userId);
  }

  // Promoções e Demissões
  @Put('users/:id/promote/master')
  promoteToMaster(@Param('id') userId: string) {
    return this.adminService.promoteToMaster(userId);
  }

  @Put('users/:id/promote/admin')
  promoteToAdmin(@Param('id') userId: string) {
    return this.adminService.promoteToAdmin(userId);
  }

  @Put('users/:id/demote')
  demoteToPlayer(@Param('id') userId: string) {
    return this.adminService.demoteToPlayer(userId);
  }

  // Estatísticas do Sistema
  @Get('stats/overview')
  getSystemStats() {
    return this.adminService.getSystemStats();
  }
}
