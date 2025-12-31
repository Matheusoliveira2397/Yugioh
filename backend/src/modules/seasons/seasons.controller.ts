import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { SeasonsService } from './seasons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

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
    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum)) {
      throw new Error('ID de usuário inválido');
    }
    return this.seasonsService.getUserRanking(userIdNum, seasonId);
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

  @Get('ranking/division/:division')
  async getDivisionRanking(
    @Param('division') division: string,
    @Query('seasonId') seasonId?: string,
    @Query('limit') limit?: number
  ) {
    return this.seasonsService.getDivisionRanking(division as any, seasonId, limit || 100);
  }

  // ========== ENDPOINTS ADMIN ==========
  
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllSeasonsAdmin() {
    return this.seasonsService.getAllSeasons();
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getSeasonById(@Param('id') id: string) {
    return this.seasonsService.getSeasonById(id);
  }

  @Post('admin/create')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createSeasonAdmin(@Body() createDto: {
    name: string;
    startDate: Date;
    endDate: Date;
    prizes?: {
      first: { trophy: string; credits: number };
      second: { trophy: string; credits: number };
      third: { trophy: string; credits: number };
    };
    divisionPrizes?: {
      [key: string]: {
        first: { trophy: string; credits: number };
        second: { trophy: string; credits: number };
        third: { trophy: string; credits: number };
      };
    };
  }) {
    return this.seasonsService.createSeasonAdmin(createDto);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateSeason(@Param('id') id: string, @Body() updateDto: {
    name?: string;
    startDate?: Date;
    endDate?: Date;
    isActive?: boolean;
    prizes?: {
      first: { trophy: string; credits: number };
      second: { trophy: string; credits: number };
      third: { trophy: string; credits: number };
    };
    divisionPrizes?: {
      [key: string]: {
        first: { trophy: string; credits: number };
        second: { trophy: string; credits: number };
        third: { trophy: string; credits: number };
      };
    };
  }) {
    return this.seasonsService.updateSeason(id, updateDto);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteSeason(@Param('id') id: string) {
    return this.seasonsService.deleteSeason(id);
  }

  @Post('admin/:id/end')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async endSeasonAdmin(@Param('id') id: string) {
    return this.seasonsService.endSeason(id);
  }
}
