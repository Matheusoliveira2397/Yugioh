import { Controller, Get, Post, UseGuards, Request, Param } from '@nestjs/common';
import { ArenaService } from './arena.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('arena')
export class ArenaController {
  constructor(private readonly arenaService: ArenaService) {}

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
}
