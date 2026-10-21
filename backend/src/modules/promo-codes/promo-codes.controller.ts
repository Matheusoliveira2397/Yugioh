import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PromoCodesService } from './promo-codes.service';

@Controller('promo-codes')
@UseGuards(JwtAuthGuard)
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Post('redeem')
  redeem(@Req() req: any, @Body() body: { code?: string }) {
    const userId = Number(req.user.id);
    return this.promoCodesService.redeem(userId, body?.code || '');
  }
}
