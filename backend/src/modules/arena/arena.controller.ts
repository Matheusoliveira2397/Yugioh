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
    const now = new Date();
    // 1) Próxima arena já instanciada (startTime > now)
    let next = await this.arenaService.getNextArena();
    if (next) {
      const startTime = next.startTime instanceof Date ? next.startTime : new Date(next.startTime);
      return {
        arena: next,
        timeUntilStart: startTime.getTime() - now.getTime(),
        startsAt: startTime,
      };
    }
    // 2) Nenhuma instância futura: usar horários (schedules) para contagem regressiva até a próxima arena (hoje ou outro dia)
    const scheduled = await this.arenaScheduleService.getNextScheduledStart();
    if (scheduled) {
      const startTime = scheduled.startTime instanceof Date ? scheduled.startTime : new Date(scheduled.startTime);
      const durationMs = (scheduled.durationMinutes ?? 120) * 60 * 1000;
      return {
        arena: {
          id: 'scheduled',
          name: scheduled.name,
          startTime: startTime.toISOString(),
          endTime: new Date(startTime.getTime() + durationMs).toISOString(),
          description: `Próxima arena: ${scheduled.name}`,
          isActive: false,
          participants: 0,
          scoreMultiplier: 1,
        },
        timeUntilStart: startTime.getTime() - now.getTime(),
        startsAt: startTime,
      };
    }
    return { arena: null, message: 'Nenhuma arena programada' };
  }

  @Get('upcoming')
  async getUpcomingArena() {
    const current = await this.arenaService.getCurrentArena();
    if (current) {
      return { arena: null, message: 'Arena já está ativa' };
    }

    const now = new Date();
    const tenMinutesInMs = 10 * 60 * 1000;
    const marginMs = 2000;

    let startTime: Date;
    let arenaForBanner: any;

    const nextInstance = await this.arenaService.getNextArena();
    if (nextInstance) {
      startTime = nextInstance.startTime instanceof Date ? nextInstance.startTime : new Date(nextInstance.startTime);
      arenaForBanner = nextInstance;
    } else {
      const scheduled = await this.arenaScheduleService.getNextScheduledStart();
      if (!scheduled) {
        return { arena: null, message: 'Nenhuma arena programada' };
      }
      startTime = scheduled.startTime instanceof Date ? scheduled.startTime : new Date(scheduled.startTime);
      const durationMs = (scheduled.durationMinutes ?? 120) * 60 * 1000;
      arenaForBanner = {
        id: 'scheduled',
        name: scheduled.name,
        startTime: startTime.toISOString(),
        endTime: new Date(startTime.getTime() + durationMs).toISOString(),
        description: `Próxima arena: ${scheduled.name}`,
        isActive: false,
        participants: 0,
        scoreMultiplier: 1,
      };
    }

    const timeUntil = startTime.getTime() - now.getTime();
    if (timeUntil > 0 && timeUntil <= tenMinutesInMs + marginMs) {
      return {
        arena: arenaForBanner,
        timeUntilStart: timeUntil,
        startsAt: startTime,
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

  @Get('last-ranking')
  async getLastArenaTop5() {
    const data = await this.arenaService.getLastArenaTop5PerDivision();
    return data ?? { arena: null, rankings: {} };
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
    const arena = await this.arenaService.createArenaAdmin(createArenaDto);
    // Se o horário da arena for agora (ou nos próximos 15 min), criar a instância do dia na hora
    this.arenaScheduleService.createTodayArenas().catch(() => {});
    return arena;
  }

  /** Força a criação das instâncias de hoje a partir dos modelos (Criar Arena). Use se a arena não abriu no horário. */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/create-today-instances')
  async createTodayInstances() {
    await this.arenaScheduleService.createTodayArenas();
    return { message: 'Verificação concluída. Se havia modelo no horário, a arena foi criada.' };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/config/level-ranges')
  async getLevelRangesAdmin() {
    return await this.arenaService.getLevelRanges();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('admin/config/level-ranges')
  async updateLevelRanges(@Body() levelRanges: Array<{ min: number; max: number; name: string }>) {
    await this.arenaService.updateLevelRanges(levelRanges);
    return { message: 'Faixas de nível atualizadas com sucesso', levelRanges: await this.arenaService.getLevelRanges() };
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
    const arena = await this.arenaService.updateArena(id, updateArenaDto);
    this.arenaScheduleService.createTodayArenas().catch(() => {});
    return arena;
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/:id')
  async deleteArena(@Param('id') id: string) {
    return await this.arenaService.deleteArena(id);
  }
}
