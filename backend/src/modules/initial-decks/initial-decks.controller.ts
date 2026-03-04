import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InitialDecksService } from './initial-decks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('initial-decks')
export class InitialDecksController {
  constructor(private readonly initialDecksService: InitialDecksService) {}

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    return this.initialDecksService.findAll();
  }

  @Get('active')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findActive() {
    return this.initialDecksService.findActiveDecks();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    return this.initialDecksService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() createDeckDto: { name: string; description?: string; cards: Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }> }) {
    return this.initialDecksService.create(createDeckDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDeckDto: { name?: string; description?: string; isActive?: boolean; cards?: Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }> }
  ) {
    return this.initialDecksService.update(id, updateDeckDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    await this.initialDecksService.remove(id);
    return { message: 'Deck inicial removido com sucesso' };
  }
}

