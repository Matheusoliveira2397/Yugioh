import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { TournamentTypesService } from './tournament-types.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { TournamentType } from './entities/tournament-type.entity';

@Controller('tournament-types')
@UseGuards(JwtAuthGuard)
export class TournamentTypesController {
  constructor(private readonly tournamentTypesService: TournamentTypesService) {}

  @Get()
  @UseGuards(AdminGuard)
  findAll() {
    return this.tournamentTypesService.findAll();
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  findOne(@Param('id') id: string) {
    return this.tournamentTypesService.findOne(id);
  }

  @Get(':id/next-sequence')
  @UseGuards(AdminGuard)
  getNextSequence(@Param('id') id: string) {
    return this.tournamentTypesService.getNextSequence(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() data: Partial<TournamentType>) {
    return this.tournamentTypesService.create(data);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() data: Partial<TournamentType>) {
    return this.tournamentTypesService.update(id, data);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.tournamentTypesService.remove(id);
  }
}
