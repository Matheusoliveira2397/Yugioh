import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BattlePassService, BattlePassTrack } from './battle-pass.service';

@Controller('battle-pass')
@UseGuards(JwtAuthGuard)
export class BattlePassController {
  constructor(private readonly battlePassService: BattlePassService) {}

  @Get('current')
  getCurrent(@Req() req: any) {
    const userId = Number(req.user.id);
    return this.battlePassService.getCurrentForUser(userId);
  }

  @Post('buy-premium')
  buyPremium(@Req() req: any) {
    const userId = Number(req.user.id);
    return this.battlePassService.buyPremium(userId);
  }

  @Post('claim')
  claim(
    @Req() req: any,
    @Body() body: { level: number; track: BattlePassTrack },
  ) {
    const userId = Number(req.user.id);
    const level = Math.floor(Number(body.level));
    const track = body.track === 'premium' ? 'premium' : 'free';
    return this.battlePassService.claimReward(userId, level, track);
  }

  @Post('claim-all')
  claimAll(@Req() req: any) {
    const userId = Number(req.user.id);
    return this.battlePassService.claimAll(userId);
  }
}
