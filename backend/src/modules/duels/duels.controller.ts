import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('duels')
@UseGuards(JwtAuthGuard)
export class DuelsController {
  constructor(private readonly duelsService: DuelsService) {}

  @Get('my-duels')
  async getMyDuels(@Request() req: any) {
    // Implementar busca de duelos do usuário
    return { message: 'Lista de duelos' };
  }

  @Get(':id')
  async getDuel(@Param('id') id: string) {
    return this.duelsService.findDuelById(id);
  }

  @Get(':id/logs')
  async getDuelLogs(@Param('id') id: string) {
    return this.duelsService.getDuelLogs(id);
  }
}
