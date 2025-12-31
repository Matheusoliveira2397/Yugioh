import { Controller, Get, Post, Put, Delete, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ArenaService } from './arena.service';
import { ArenaScheduleService } from './arena-schedule.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('arena')
export class ArenaController {
  constructor(
    private readonly arenaService: ArenaService,
    private readonly arenaScheduleService: ArenaScheduleService,
  ) {}

  @Get('current')
  async getCurrentArena() {
    const arena = await this.arenaService.getCurrentArena();
    if (!arena) {
      return { arena: null, message: 'Nenhuma arena ativa no momento' };
    }
    return { arena };
  }

  @Get('next')
  async getNextArena() {
    const current = await this.arenaService.getCurrentArena();
    if (current) {
      return { arena: current, message: 'Arena já está ativa!' };
    }

    const next = await this.arenaService.getNextArena();
    if (!next) {
      return { arena: null, message: 'Nenhuma arena programada' };
    }

    const now = new Date();
    const timeUntil = next.startTime.getTime() - now.getTime();

    return {
      arena: next,
      timeUntilStart: timeUntil,
      startsAt: next.startTime,
    };
  }

  @Get('upcoming')
  async getUpcomingArena() {
    const current = await this.arenaService.getCurrentArena();
    if (current) {
      return { arena: null, message: 'Arena já está ativa' };
    }

    const next = await this.arenaService.getNextArena();
    if (!next) {
      return { arena: null, message: 'Nenhuma arena programada' };
    }

    const now = new Date();
    const timeUntil = next.startTime.getTime() - now.getTime();
    const tenMinutesInMs = 10 * 60 * 1000; // 10 minutos em milissegundos

    // Retornar apenas se a arena começa em menos de 10 minutos
    if (timeUntil > 0 && timeUntil <= tenMinutesInMs) {
      return {
        arena: next,
        timeUntilStart: timeUntil,
        startsAt: next.startTime,
      };
    }

    return { arena: null, message: 'Arena não começa nos próximos 10 minutos' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('join/:id')
  async joinArena(@Param('id') id: string) {
    await this.arenaService.joinArena(id);
    return { message: 'Você entrou na arena de desafios!' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('leave/:id')
  async leaveArena(@Param('id') id: string) {
    await this.arenaService.leaveArena(id);
    return { message: 'Você saiu da arena de desafios' };
  }

  @Get('stats/:id')
  async getArenaStats(@Param('id') id: string) {
    return await this.arenaService.getArenaStats(id);
  }

  @Get('ranking/:id')
  async getArenaRankings(@Param('id') id: string) {
    return await this.arenaService.getAllArenaRankings(id);
  }

  @Get('ranking/:id/division/:division')
  async getArenaRankingByDivision(
    @Param('id') id: string,
    @Param('division') division: string,
  ) {
    return await this.arenaService.getArenaRankingByDivision(id, decodeURIComponent(division));
  }

  @Get('config/level-ranges')
  async getLevelRanges() {
    return await this.arenaService.getLevelRanges();
  }

  // Admin endpoints - ORDEM IMPORTANTE: rotas específicas ANTES de rotas com parâmetros dinâmicos
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/all')
  async getAllArenas() {
    return await this.arenaService.getAllArenas();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/create')
  async createArena(@Body() createArenaDto: any) {
    return await this.arenaService.createArenaAdmin(createArenaDto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/config/level-ranges')
  async getLevelRangesAdmin() {
    return await this.arenaService.getLevelRanges();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('admin/config/level-ranges')
  async updateLevelRanges(@Body() levelRanges: Array<{ min: number; max: number; name: string }>) {
    return await this.arenaService.updateLevelRanges(levelRanges);
  }

  // ==================== HORÁRIOS RECORRENTES ====================
  // IMPORTANTE: Estas rotas devem vir ANTES de 'admin/:id' para evitar conflito de roteamento

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/schedules')
  async getAllSchedules() {
    return await this.arenaScheduleService.getAllSchedules();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/schedules')
  async createSchedule(@Body() data: {
    name: string;
    startTime: string; // HH:mm
    durationMinutes: number;
    isActive?: boolean;
    order?: number;
    config?: {
      levelRanges?: Array<{ min: number; max: number; name: string }>;
      scoreMultiplier?: number;
      bonusGems?: number;
      description?: string;
      rewards?: {
        levelRangeRewards?: Array<{
          levelRange: string;
          top1?: { cash?: number; score?: number; additionalScore?: number };
          top2?: { cash?: number; score?: number; additionalScore?: number };
          top3?: { cash?: number; score?: number; additionalScore?: number };
          top4?: { cash?: number; score?: number; additionalScore?: number };
          top5?: { cash?: number; score?: number; additionalScore?: number };
        }>;
      };
    };
  }) {
    return await this.arenaScheduleService.createSchedule(data);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('admin/schedules/:id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() data: {
      name?: string;
      startTime?: string;
      durationMinutes?: number;
      isActive?: boolean;
      order?: number;
      config?: any;
    },
  ) {
    return await this.arenaScheduleService.updateSchedule(id, data);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/schedules/:id')
  async deleteSchedule(@Param('id') id: string) {
    return await this.arenaScheduleService.deleteSchedule(id);
  }

  // Rotas com parâmetros dinâmicos DEVEM vir por último
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/:id')
  async getArenaById(@Param('id') id: string) {
    return await this.arenaService.getArenaById(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('admin/:id')
  async updateArena(@Param('id') id: string, @Body() updateArenaDto: any) {
    return await this.arenaService.updateArena(id, updateArenaDto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/:id')
  async deleteArena(@Param('id') id: string) {
    return await this.arenaService.deleteArena(id);
  }
}
