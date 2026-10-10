import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { BotsService, BotInput } from './bots.service';

@Controller('admin/bots')
@UseGuards(JwtAuthGuard, MasterGuard)
export class BotsController {
  constructor(private readonly bots: BotsService) {}
  @Get() list() { return this.bots.list(); }
  @Post() create(@Body() body: BotInput) { return this.bots.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: Partial<BotInput>) { return this.bots.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.bots.remove(id); }
}
