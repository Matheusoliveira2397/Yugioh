import { Controller, Get, Param, Patch, Body, UseGuards, Request, Post, UploadedFile, UseInterceptors, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { AchievementsService } from './achievements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from '../upload/upload.service';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private achievementsService: AchievementsService,
    private uploadService: UploadService,
  ) {}

  @Get('ranking/season')
  async getSeasonRanking(@Query('seasonId') seasonId?: string) {
    return this.usersService.getSeasonRanking(seasonId);
  }

  @Get('ranking/general')
  async getGeneralRanking() {
    return this.usersService.getGeneralRanking();
  }

  @Get('ranking/season/division/:division')
  async getSeasonRankingByDivision(@Param('division') division: string, @Query('seasonId') seasonId?: string) {
    return this.usersService.getSeasonRankingByDivision(division, seasonId);
  }

  @Get('ranking/top5')
  async getTop5Players() {
    return this.usersService.getTop5Players();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: any) {
    // CRÍTICO: Timeout agressivo para garantir que HTTP sempre responda
    return Promise.race([
      (async () => {
        // Yield ao Event Loop ANTES de fazer query (prioriza HTTP)
        await new Promise(resolve => setImmediate(resolve));
        
        // Buscar dados completos do usuário com clanTag validado
        const fullProfile = await this.usersService.getFullProfile(req.user.id);
        
        // Retornar apenas os campos necessários para o frontend
        return {
          id: fullProfile.id,
          nickname: fullProfile.nickname,
          username: fullProfile.username,
          email: fullProfile.email,
          winsGeral: fullProfile.winsGeral,
          lossesGeral: fullProfile.lossesGeral,
          winsSeason: fullProfile.winsSeason,
          lossesSeason: fullProfile.lossesSeason,
          credits: fullProfile.credits || 0,
          cash: fullProfile.cash || 0,
          profileImage: (fullProfile.profileImage && !fullProfile.profileImage.includes('/images/default') && !fullProfile.profileImage.includes('/avatars/default')) 
            ? fullProfile.profileImage 
            : null,
          role: fullProfile.role,
          clanTag: fullProfile.clanTag || null,
          level: fullProfile.level || 1,
          experience: fullProfile.experience || 0,
          totalScore: fullProfile.totalScore != null ? Number(fullProfile.totalScore) : 0,
          playerClass: fullProfile.playerClass || 'Novato',
          group: fullProfile.group || null,
          seasonRank: fullProfile.seasonRank || null,
          generalRank: fullProfile.generalRank || null,
          globalRank: fullProfile.globalRank || fullProfile.generalRank || null,
          seasonScore: fullProfile.seasonRanking?.seasonScore || 0,
          division: fullProfile.division || null, // Divisão dinâmica do usuário
          equippedPlaymatId: fullProfile.equippedPlaymatId || null,
          equippedPlaymatImage: fullProfile.equippedPlaymatImage || null,
          equippedSkinId: fullProfile.equippedSkinId || null,
          equippedSkinImage: fullProfile.equippedSkinImage || null,
          adminAllowedTabs: fullProfile.adminAllowedTabs ?? null,
        };
      })(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]).catch(() => {
      // Retornar dados básicos em caso de timeout
      return {
        id: req.user.id,
        nickname: req.user.nickname || 'Usuário',
        username: req.user.username || 'user',
        email: req.user.email || '',
        winsGeral: 0,
        lossesGeral: 0,
        winsSeason: 0,
        lossesSeason: 0,
        credits: 0,
        cash: 0,
        profileImage: null,
        role: req.user.role || 'USER',
        clanTag: null,
        level: 1,
        experience: 0,
        totalScore: 0,
        playerClass: 'Novato',
        seasonRank: null,
        generalRank: null,
        globalRank: null,
        seasonScore: 0,
        division: 'Bronze',
      };
    });
  }

  @Get(':id/profile')
  async getFullProfile(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }
    return this.usersService.getFullProfile(userId);
  }

  @Get(':id/achievements')
  async getUserAchievements(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }
    return this.achievementsService.getUserAchievements(userId);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }
    return this.usersService.findById(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/profile-image')
  @UseInterceptors(FileInterceptor('profileImage'))
  async uploadProfileImage(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Request() req: any,
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }

    // Verifica se o usuário está atualizando a própria imagem
    // Busca o usuário autenticado do banco para garantir que temos o ID correto
    if (!req.user || !req.user.id) {
      console.log('❌ ERRO: req.user ou req.user.id não existe');
      throw new BadRequestException('Usuário não autenticado');
    }
    
    console.log('🔍 DEBUG uploadProfileImage:');
    console.log('  - req.user.id:', req.user.id, 'tipo:', typeof req.user.id);
    console.log('  - userId (do param):', userId, 'tipo:', typeof userId);
    
    // Converte o ID do usuário autenticado para número
    let authenticatedUserId: number;
    if (typeof req.user.id === 'string') {
      authenticatedUserId = parseInt(req.user.id, 10);
      console.log('  - Convertendo string para number:', authenticatedUserId);
    } else {
      authenticatedUserId = Number(req.user.id);
      console.log('  - ID já é number ou convertido:', authenticatedUserId);
    }
    
    if (isNaN(authenticatedUserId)) {
      console.log('  - ❌ ERRO: authenticatedUserId é NaN após conversão');
      throw new BadRequestException('ID de usuário inválido no token');
    }
    
    console.log('  - authenticatedUserId:', authenticatedUserId);
    console.log('  - userId (solicitado):', userId);
    console.log('  - Comparação:', authenticatedUserId, '===', userId, '?', authenticatedUserId === userId);
    
    // Compara os IDs (converte ambos para número para garantir comparação correta)
    // Usa comparação com == ao invés de === para permitir coerção de tipo
    if (Number(authenticatedUserId) != Number(userId)) {
      console.log('  - ❌ ERRO: IDs não coincidem!');
      console.log('    Seu ID no token:', authenticatedUserId, 'tipo:', typeof authenticatedUserId);
      console.log('    ID solicitado:', userId, 'tipo:', typeof userId);
      console.log('    Comparação numérica:', Number(authenticatedUserId), '!=', Number(userId));
      throw new BadRequestException(`Você só pode atualizar sua própria imagem de perfil. Seu ID: ${authenticatedUserId}, ID solicitado: ${userId}`);
    }
    
    console.log('  - ✅ IDs coincidem! Prosseguindo com upload...');

    if (!file) {
      throw new BadRequestException('Nenhuma imagem foi enviada');
    }

    try {
      // Busca o usuário para pegar a imagem antiga
      const user = await this.usersService.findById(userId);
      
      // Se tem imagem antiga e não é a padrão, deleta
      if (user.profileImage && !user.profileImage.includes('/images/default')) {
        await this.uploadService.deleteAvatar(user.profileImage);
      }

      // Faz upload da nova imagem
      const imageUrl = await this.uploadService.uploadAvatar(file, userId.toString());

      // Atualiza no banco de dados
      return this.usersService.updateProfileImage(userId, imageUrl);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao fazer upload da imagem');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/biography')
  async updateBiography(
    @Param('id') id: string,
    @Body() body: { biography: string },
    @Request() req: any,
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }

    // Verificar se o usuário está atualizando a própria biografia
    const authenticatedUserId = typeof req.user.id === 'string' 
      ? parseInt(req.user.id, 10) 
      : Number(req.user.id);
    
    if (Number(authenticatedUserId) !== Number(userId)) {
      throw new BadRequestException('Você só pode atualizar sua própria biografia');
    }

    return this.usersService.updateBiography(userId, body.biography);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/clan-tag')
  async updateClanTag(
    @Param('id') id: string,
    @Body() body: { clanTag: string },
    @Request() req: any,
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }

    // Verificar se o usuário está atualizando a própria tag
    const authenticatedUserId = typeof req.user.id === 'string' 
      ? parseInt(req.user.id, 10) 
      : Number(req.user.id);
    
    if (Number(authenticatedUserId) !== Number(userId)) {
      throw new BadRequestException('Você só pode atualizar sua própria tag de clã');
    }

    return this.usersService.updateClanTag(userId, body.clanTag);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/nickname')
  async updateNickname(
    @Param('id') id: string,
    @Body() body: { nickname: string },
    @Request() req: any,
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }

    // Verificar se o usuário está atualizando o próprio nickname
    const authenticatedUserId = typeof req.user.id === 'string' 
      ? parseInt(req.user.id, 10) 
      : Number(req.user.id);
    
    if (Number(authenticatedUserId) !== Number(userId)) {
      throw new BadRequestException('Você só pode atualizar seu próprio nickname');
    }

    return this.usersService.updateNickname(userId, body.nickname);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request-email-change')
  async requestEmailChange(@Request() req: any, @Body() body: { newEmail: string }) {
    const userId = typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : Number(req.user.id);
    return this.usersService.requestEmailChange(userId, body.newEmail || '');
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/email')
  async updateEmail(
    @Param('id') id: string,
    @Body() body: { email: string },
    @Request() req: any,
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }

    const authenticatedUserId = typeof req.user.id === 'string'
      ? parseInt(req.user.id, 10)
      : Number(req.user.id);

    if (Number(authenticatedUserId) !== Number(userId)) {
      throw new BadRequestException('Você só pode atualizar seu próprio email');
    }

    return this.usersService.updateEmail(userId, body.email);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/password')
  async updatePassword(
    @Param('id') id: string,
    @Body() body: { currentPassword: string; newPassword: string },
    @Request() req: any,
  ) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('ID inválido');
    }

    // Verificar se o usuário está atualizando a própria senha
    const authenticatedUserId = typeof req.user.id === 'string' 
      ? parseInt(req.user.id, 10) 
      : Number(req.user.id);
    
    if (Number(authenticatedUserId) !== Number(userId)) {
      throw new BadRequestException('Você só pode atualizar sua própria senha');
    }

    return this.usersService.updatePassword(userId, body.currentPassword, body.newPassword);
  }

}
