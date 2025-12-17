import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { LevelsService } from './levels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('levels')
@UseGuards(JwtAuthGuard)
export class LevelsController {
  constructor(
    private readonly levelsService: LevelsService,
  ) {}

  @Get()
  async getAllLevels() {
    return this.levelsService.getAllLevels();
  }

  @Get('info/:level')
  async getLevelInfo(@Param('level') level: number) {
    return this.levelsService.getLevelInfo(level);
  }

  @Get('next/:currentLevel')
  async getNextLevels(
    @Param('currentLevel') currentLevel: number,
    @Query('count') count?: number,
  ) {
    const levelCount = count ? parseInt(count.toString(), 10) : 10;
    return this.levelsService.getNextLevels(currentLevel, levelCount);
  }
}

