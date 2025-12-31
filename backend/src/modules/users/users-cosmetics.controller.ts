import { Controller, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('me')
export class UsersCosmeticsController {
  constructor(private readonly usersService: UsersService) {}

  // Atualizar cosméticos equipados do próprio usuário (playmat e skin de carta)
  @UseGuards(JwtAuthGuard)
  @Patch('cosmetics')
  async updateMyCosmetics(
    @Body()
    body: {
      equippedPlaymatId?: string | null;
      equippedPlaymatImage?: string | null;
      equippedSkinId?: string | null;
      equippedSkinImage?: string | null;
      equippedDeckName?: string | null;
    },
    @Request() req: any,
  ) {
    const userId =
      typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : Number(req.user.id);
    return this.usersService.updateCosmetics(userId, body);
  }
}


