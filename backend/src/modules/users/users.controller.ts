import { Controller, Get, Param, Patch, Body, UseGuards, Request, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from '../upload/upload.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private uploadService: UploadService,
  ) {}

  @Get()
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @Get('me')
  async getProfile(@Request() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post(':id/profile-image')
  @UseInterceptors(FileInterceptor('profileImage'))
  async uploadProfileImage(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Request() req: any,
  ) {
    // Verifica se o usuário está atualizando a própria imagem
    if (req.user.id !== id) {
      throw new BadRequestException('Você só pode atualizar sua própria imagem de perfil');
    }

    if (!file) {
      throw new BadRequestException('Nenhuma imagem foi enviada');
    }

    try {
      // Busca o usuário para pegar a imagem antiga
      const user = await this.usersService.findById(id);
      
      // Se tem imagem antiga e não é a padrão, deleta
      if (user.profileImage && !user.profileImage.includes('/avatars/default')) {
        await this.uploadService.deleteAvatar(user.profileImage);
      }

      // Faz upload da nova imagem
      const imageUrl = await this.uploadService.uploadAvatar(file, id);

      // Atualiza no banco de dados
      return this.usersService.updateProfileImage(id, imageUrl);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao fazer upload da imagem');
    }
  }

  @Get('ranking/season')
  async getSeasonRanking() {
    return this.usersService.getSeasonRanking();
  }

  @Get('ranking/general')
  async getGeneralRanking() {
    return this.usersService.getGeneralRanking();
  }

  @Get('ranking/top5')
  async getTop5Players() {
    return this.usersService.getTop5Players();
  }
}
