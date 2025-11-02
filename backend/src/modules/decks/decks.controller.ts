import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DecksService } from './decks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDeckDto } from './dto/create-deck.dto';

@Controller('decks')
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(private decksService: DecksService) {}

  @Post()
  create(@Request() req: any, @Body() createDeckDto: CreateDeckDto) {
    return this.decksService.create(req.user.id, createDeckDto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.decksService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.decksService.findOne(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.decksService.delete(id, req.user.id);
  }
}
