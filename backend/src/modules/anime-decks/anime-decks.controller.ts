import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AnimeDecksService } from './anime-decks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('anime-decks')
export class AnimeDecksController {
  constructor(private readonly animeDecksService: AnimeDecksService) {}

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    return this.animeDecksService.findAll();
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  async findActive() {
    return this.animeDecksService.findActiveDecks();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    return this.animeDecksService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(
    @Body()
    createDeckDto: {
      name: string;
      description?: string;
      coverCardId?: string | null;
      cards: Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }>;
    },
  ) {
    return this.animeDecksService.create(createDeckDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body()
    updateDeckDto: {
      name?: string;
      description?: string;
      isActive?: boolean;
      coverCardId?: string | null;
      cards?: Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }>;
    },
  ) {
    return this.animeDecksService.update(id, updateDeckDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    await this.animeDecksService.remove(id);
    return { message: 'Deck anime removido com sucesso' };
  }
}
