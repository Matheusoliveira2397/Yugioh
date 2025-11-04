import { Controller, Put, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

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
}
