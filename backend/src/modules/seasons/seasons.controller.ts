import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { SeasonsService } from './seasons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get('active')
  async getActiveSeason() {
    return this.seasonsService.getActiveSeason();
  }

  @Get('all')
  async getAllSeasons() {
    return this.seasonsService.getAllSeasons();
  }

  @Get('ranking')
  async getSeasonRanking(
    @Query('seasonId') seasonId?: string,
    @Query('limit') limit?: number
  ) {
    return this.seasonsService.getSeasonRanking(seasonId, limit || 100);
  }

  @Get('ranking/user/:userId')
  @UseGuards(JwtAuthGuard)
  async getUserRanking(
    @Param('userId') userId: string,
    @Query('seasonId') seasonId?: string
  ) {
    return this.seasonsService.getUserRanking(userId, seasonId);
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createSeason(@Query('days') days?: number) {
    return this.seasonsService.createSeason(days || 30);
  }

  @Post('end/:id')
  @UseGuards(JwtAuthGuard)
  async endSeason(@Param('id') id: string) {
    return this.seasonsService.endSeason(id);
  }
}
