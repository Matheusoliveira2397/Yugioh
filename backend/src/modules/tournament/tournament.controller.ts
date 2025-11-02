import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { TournamentService } from './tournament.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentController {
  constructor(private tournamentService: TournamentService) {}

  @Get()
  findAll() {
    return this.tournamentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentService.findOne(id);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Request() req: any) {
    return this.tournamentService.join(id, req.user.id);
  }
}
