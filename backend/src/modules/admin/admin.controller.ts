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

  // Estatísticas do Sistema
  @Get('stats/overview')
  getSystemStats() {
    return this.adminService.getSystemStats();
  }
}
