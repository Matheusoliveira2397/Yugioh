import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Tournament, TournamentStatus } from './entities/tournament.entity';

@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  /**
   * Listar todos os torneios
   */
  @Get()
  findAll(@Query('status') status?: TournamentStatus) {
    return this.tournamentsService.findAll(status);
  }

  /**
   * Buscar torneio específico
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  /**
   * Criar torneio (apenas admin)
   */
  @Post()
  @UseGuards(AdminGuard)
  create(@Request() req: any, @Body() tournamentData: Partial<Tournament>) {
    return this.tournamentsService.create(req.user.userId, tournamentData);
  }

  /**
   * Inscrever-se no torneio
   */
  @Post(':id/register')
  register(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.register(id, req.user.userId);
  }

  /**
   * Gerar chave do torneio manualmente (admin)
   */
  @Post(':id/generate-bracket')
  @UseGuards(AdminGuard)
  generateBracket(@Param('id') id: string) {
    return this.tournamentsService.generateBracket(id);
  }
}
