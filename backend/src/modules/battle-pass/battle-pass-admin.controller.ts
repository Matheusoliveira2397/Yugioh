import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { BattlePassService, BattlePassLevelInput } from './battle-pass.service';

@Controller('admin/battle-pass')
@UseGuards(JwtAuthGuard, AdminGuard)
export class BattlePassAdminController {
  constructor(private readonly battlePassService: BattlePassService) {}

  @Get('seasons')
  listSeasons() {
    return this.battlePassService.findAllSeasonsAdmin();
  }

  @Post('seasons')
  createSeason(
    @Body()
    body: {
      name: string;
      description?: string | null;
      startsAt: string;
      endsAt: string;
      premiumPriceCredits?: number;
      xpPerWin?: number;
      xpPerLoss?: number;
      bannerUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.battlePassService.createSeason(body);
  }

  @Put('seasons/:id')
  updateSeason(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      startsAt?: string;
      endsAt?: string;
      premiumPriceCredits?: number;
      xpPerWin?: number;
      xpPerLoss?: number;
      bannerUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.battlePassService.updateSeason(id, body);
  }

  @Post('seasons/:id/activate')
  activateSeason(@Param('id') id: string) {
    return this.battlePassService.activateSeason(id);
  }

  @Delete('seasons/:id')
  deleteSeason(@Param('id') id: string) {
    return this.battlePassService.deleteSeason(id);
  }

  @Get('seasons/:id/levels')
  getLevels(@Param('id') id: string) {
    return this.battlePassService.getLevelsAdmin(id);
  }

  @Put('seasons/:id/levels')
  replaceLevels(
    @Param('id') id: string,
    @Body() body: { levels: BattlePassLevelInput[] },
  ) {
    return this.battlePassService.replaceLevels(id, body.levels || []);
  }

  @Post('grant-xp')
  grantXp(@Body() body: { userId: number; amount: number }) {
    return this.battlePassService.grantXpAdmin(
      Number(body.userId),
      Number(body.amount),
    );
  }
}
