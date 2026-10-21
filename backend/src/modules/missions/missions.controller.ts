import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MissionsService } from './missions.service';

@Controller('missions')
@UseGuards(JwtAuthGuard)
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get()
  getMine(@Req() req: any) {
    return this.missionsService.getPlayerMissions(Number(req.user.id));
  }

  @Get('objective-types')
  getObjectiveTypes() {
    return this.missionsService.getObjectiveCatalog();
  }

  @Post('track-login')
  trackLogin(@Req() req: any) {
    return this.missionsService
      .trackLogin(Number(req.user.id))
      .then(() => ({ ok: true }));
  }

  @Post('categories/:categoryId/claim-all')
  claimAll(@Req() req: any, @Param('categoryId') categoryId: string) {
    return this.missionsService.claimAllInCategory(
      Number(req.user.id),
      categoryId,
    );
  }

  @Post(':id/claim')
  claim(@Req() req: any, @Param('id') id: string) {
    return this.missionsService.claimMission(Number(req.user.id), id);
  }
}
