import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('public')
export class PublicController {
  constructor(private adminService: AdminService) {}

  // Endpoint público para buscar abas ativas (sem autenticação)
  @Get('site-tabs/active')
  getActiveSiteTabs() {
    return this.adminService.getActiveSiteTabs();
  }

  // Endpoint público para buscar redes sociais ativas (sem autenticação)
  @Get('social-media/active')
  getActiveSocialMedia() {
    return this.adminService.getActiveSocialMedia();
  }
}

