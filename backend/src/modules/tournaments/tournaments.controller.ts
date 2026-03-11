import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentRankingService } from './tournament-ranking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Tournament, TournamentStatus } from './entities/tournament.entity';

@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentRankingService: TournamentRankingService,
  ) {}

  /**
   * Listar todos os torneios
   */
  @Get()
  findAll(@Query('status') status?: TournamentStatus) {
    return this.tournamentsService.findAll(status);
  }

  /**
   * Ranking de torneios (classes Obelisco, Rá, Slifer)
   */
  @Get('ranking/list')
  getRanking(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : undefined;
    return this.tournamentRankingService.getRanking(Number.isFinite(n) ? n : undefined);
  }

  /**
   * Configuração das classes (minPoints, maxPlayers)
   */
  @Get('ranking/classes')
  getRankingClasses() {
    return this.tournamentRankingService.getClasses();
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
    const userId = Number(req.user.id);
    return this.tournamentsService.create(userId, tournamentData);
  }

  /**
   * Inscrever-se no torneio
   */
  @Post(':id/register')
  register(@Param('id') id: string, @Request() req: any) {
    const userId = Number(req.user.id);
    return this.tournamentsService.register(id, userId);
  }

  /**
   * Gerar chave do torneio manualmente (admin)
   */
  @Post(':id/generate-bracket')
  @UseGuards(AdminGuard)
  generateBracket(@Param('id') id: string) {
    return this.tournamentsService.generateBracket(id);
  }

  /**
   * Atualizar torneio (apenas admin)
   */
  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() tournamentData: Partial<Tournament>) {
    return this.tournamentsService.update(id, tournamentData);
  }

  /**
   * Excluir torneio (apenas admin)
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.tournamentsService.remove(id);
  }

  /**
   * Obter top 3 do torneio
   */
  @Get(':id/top3')
  getTop3(@Param('id') id: string) {
    return this.tournamentsService.getTop3(id);
  }

  /**
   * Obter bracket/chave do torneio
   */
  @Get(':id/bracket')
  getBracket(@Param('id') id: string) {
    return this.tournamentsService.getBracket(id);
  }
}
