import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { RandomDuelLevelRangesService } from './random-duel-level-ranges.service';
import { PublicStatsService } from './public-stats.service';
import { CreditPackagesService } from '../credit-packages/credit-packages.service';

@Controller('public')
export class PublicController {
  constructor(
    private adminService: AdminService,
    private randomDuelLevelRangesService: RandomDuelLevelRangesService,
    private publicStatsService: PublicStatsService,
    private creditPackagesService: CreditPackagesService,
  ) {}

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

  /** Chave PIX e WhatsApp configurados no admin (página de créditos). */
  @Get('credit-payment-contact')
  getCreditPaymentContact() {
    return this.creditPackagesService.getPublicPaymentContact();
  }

  // Endpoint público para buscar divisões disponíveis (sem autenticação)
  @Get('divisions/available')
  getAvailableDivisions() {
    return this.adminService.getAvailableDivisions();
  }

  // Endpoint público para buscar faixa de nível do random duel (sem autenticação)
  @Get('random-duel-level-ranges/active')
  getActiveRandomDuelLevelRanges() {
    return this.randomDuelLevelRangesService.getActiveRanges();
  }

  // Endpoint público para buscar faixa de nível de um nível específico (sem autenticação)
  @Get('random-duel-level-ranges/for-level/:level')
  getRangeForLevel(@Param('level', ParseIntPipe) level: number) {
    return this.randomDuelLevelRangesService.getRangeForLevel(level);
  }

  /** O que rolou até agora — estatísticas públicas para a tela de login */
  @Get('stats')
  getPublicStats() {
    return this.publicStatsService.getStats();
  }
}

