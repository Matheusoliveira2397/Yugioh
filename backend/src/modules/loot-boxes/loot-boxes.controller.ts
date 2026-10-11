import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { LootBoxesService, LootBoxInput } from './loot-boxes.service';

@Controller('loot-boxes')
export class LootBoxesController {
  constructor(private readonly service: LootBoxesService) {}
  @Get() list() { return this.service.publicList(); }
  @Get('admin') @UseGuards(JwtAuthGuard, MasterGuard)
  adminList() { return this.service.adminList(); }
  @Post('admin') @UseGuards(JwtAuthGuard, MasterGuard)
  create(@Body() input: LootBoxInput) { return this.service.create(input); }
  @Patch('admin/:id') @UseGuards(JwtAuthGuard, MasterGuard)
  update(@Param('id') id: string, @Body() input: Partial<LootBoxInput>) { return this.service.update(id, input); }
  @Delete('admin/:id') @UseGuards(JwtAuthGuard, MasterGuard)
  disable(@Param('id') id: string) { return this.service.remove(id); }
  @Post(':id/open') @UseGuards(JwtAuthGuard)
  open(@Param('id') id: string, @Request() req: { user: { id: number } },
       @Body() body: { paymentMethod: 'credits' | 'cash' }) {
    return this.service.open(id, req.user.id, body.paymentMethod);
  }
}
