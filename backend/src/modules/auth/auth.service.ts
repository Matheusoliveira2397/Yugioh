import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { SeasonsService } from '../seasons/seasons.service';
import { InitialDecksService } from '../initial-decks/initial-decks.service';
import { NewAccountSettingsService } from '../new-account-settings/new-account-settings.service';
import { DivisionsService } from '../divisions/divisions.service';
import { CosmeticsService } from '../cosmetics/cosmetics.service';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    private seasonsService: SeasonsService,
    private initialDecksService: InitialDecksService,
    private newAccountSettingsService: NewAccountSettingsService,
    private divisionsService: DivisionsService,
    private cosmeticsService: CosmeticsService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Valida usuário para login normal (/login).
   * Contas MASTER não podem logar aqui — devem usar /loginMaster.
   */
  async validateUser(login: string, password: string): Promise<any> {
    const user = await this.validateUserInternal(login, password);
    if (!user) return null;
    if (user.role === 'MASTER') {
      return null; // Força "credenciais inválidas" para não expor que a conta existe
    }
    return user;
  }

  /**
   * Valida usuário apenas para login Master (/login-master).
   * Só aceita contas com role MASTER.
   */
  async validateUserMaster(login: string, password: string): Promise<any> {
    const user = await this.validateUserInternal(login, password);
    if (!user) return null;
    if (user.role !== 'MASTER') {
      return null; // Só Master pode logar por esta rota
    }
    return user;
  }

  private async validateUserInternal(login: string, password: string): Promise<any> {
    const trimmed = login?.trim() ?? '';
    const isEmail = trimmed.includes('@');
    const user = isEmail
      ? await this.usersService.findByEmail(trimmed.toLowerCase())
      : await this.usersService.findByUsername(trimmed);

    if (!user) {
      return null;
    }

    // Verificar se o email foi confirmado
    if (!user.isEmailVerified) {
      const error: any = new UnauthorizedException('Por favor, confirme seu email antes de fazer login');
      error.code = 'EMAIL_NOT_VERIFIED';
      error.email = user.email;
      throw error;
    }

    // Banimento: limpar se expirado e bloquear login se ainda banido
    await this.usersService.clearExpiredBan(user.id);
    const forAuth = await this.usersService.findByIdForAuth(user.id);
    if (forAuth && this.usersService.isCurrentlyBanned(forAuth)) {
      const until = forAuth.bannedUntil;
      const reason = (forAuth as any).banReason || 'Violação dos termos de uso';
      const msg = until
        ? `Conta suspensa até ${new Date(until).toLocaleDateString('pt-BR')}. Motivo: ${reason}`
        : `Conta banida. Motivo: ${reason}`;
      throw new UnauthorizedException(msg);
    }

    if (await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }

    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: Number(user.id), role: user.role };
    const fullProfile = await this.usersService.getFullProfile(user.id);
    const refreshToken = await this.createRefreshToken(user.id);

    return {
        access_token: this.jwtService.sign(payload),
        refresh_token: refreshToken,
        expires_in: this.getAccessTokenExpiresInSeconds(),
        user: {
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
          totalScore: fullProfile.totalScore != null ? Number(fullProfile.totalScore) : 0,
          equippedDeckId: (fullProfile as any).equippedDeckId || null,
          equippedDeckName: (fullProfile as any).equippedDeckName || null,
          group: fullProfile.group || null,
          division: fullProfile.division || null, // Divisão dinâmica do usuário
          seasonScore: fullProfile.seasonRanking?.seasonScore || 0,
          seasonRank: fullProfile.seasonRank || null,
          generalRank: fullProfile.generalRank || null,
          globalRank: fullProfile.globalRank || fullProfile.generalRank || null,
          adminAllowedTabs: fullProfile.adminAllowedTabs ?? null,
        },
      };
  }

  /** Invalida todos os refresh tokens do usuário (ex.: ao banir). */
  async invalidateRefreshTokensForUser(userId: number): Promise<void> {
    await this.refreshTokenRepository.delete({ userId });
  }

  private getAccessTokenExpiresInSeconds(): number {
    const fallback = this.configService.get<string>('JWT_EXPIRES_IN') ?? '1h';
    const exp = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? fallback;
    if (typeof exp === 'number') return exp;
    const match = String(exp).match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60;
    const n = parseInt(match[1], 10);
    const u = match[2];
    if (u === 's') return n;
    if (u === 'm') return n * 60;
    if (u === 'h') return n * 3600;
    if (u === 'd') return n * 86400;
    return 15 * 60;
  }

  private async createRefreshToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const refreshDays = this.configService.get<string>('REFRESH_TOKEN_DAYS') ?? '7';
    const days = parseInt(String(refreshDays), 10) || 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const lastUsedAt = new Date();
    await this.refreshTokenRepository.save({
      userId,
      tokenHash,
      expiresAt,
      lastUsedAt,
    });
    return token;
  }

  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const tokenHash = crypto.createHash('sha256').update(refreshToken.trim()).digest('hex');
    const row = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      order: { id: 'DESC' },
    });
    if (!row) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }
    const now = new Date();
    if (row.expiresAt < now) {
      await this.refreshTokenRepository.delete({ id: row.id });
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }
    const inactivityDays = this.configService.get<string>('REFRESH_INACTIVITY_DAYS') ?? '7';
    const inactivityMs = (parseInt(String(inactivityDays), 10) || 7) * 24 * 60 * 60 * 1000;
    if (row.lastUsedAt.getTime() < now.getTime() - inactivityMs) {
      await this.refreshTokenRepository.delete({ id: row.id });
      throw new UnauthorizedException('Sessão encerrada por inatividade. Faça login novamente.');
    }
    row.lastUsedAt = now;
    await this.refreshTokenRepository.save(row);
    const user = await this.usersService.findById(row.userId);
    if (!user) {
      await this.refreshTokenRepository.delete({ id: row.id });
      throw new UnauthorizedException('Usuário não encontrado.');
    }
    await this.usersService.clearExpiredBan(user.id);
    const forAuth = await this.usersService.findByIdForAuth(user.id);
    if (forAuth && this.usersService.isCurrentlyBanned(forAuth)) {
      await this.refreshTokenRepository.delete({ id: row.id });
      throw new UnauthorizedException('Conta suspensa ou banida. Não é possível renovar o acesso.');
    }
    const payload = { username: user.username, sub: Number(user.id), role: user.role };
    const access_token = this.jwtService.sign(payload);
    return { access_token, expires_in: this.getAccessTokenExpiresInSeconds() };
  }

  async checkNickname(nickname: string) {
    if (!nickname || nickname.trim().length === 0) {
      return { available: false, message: 'Nickname não pode estar vazio' };
    }
    const existing = await this.usersService.findByNickname(nickname);
    return {
      available: !existing,
      message: existing ? 'Este nickname já está em uso' : 'Nickname disponível',
    };
  }

  async checkUsername(username: string) {
    if (!username || username.trim().length === 0) {
      return { available: false, message: 'Username não pode estar vazio' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { available: false, message: 'Username deve conter apenas letras, números e underscore' };
    }
    const existing = await this.usersService.findByUsername(username);
    return {
      available: !existing,
      message: existing ? 'Este username já está em uso' : 'Username disponível',
    };
  }

  async checkEmail(email: string) {
    if (!email || email.trim().length === 0) {
      return { available: false, message: 'Email não pode estar vazio' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { available: false, message: 'Email inválido' };
    }
    const existing = await this.usersService.findByEmail(email);
    return {
      available: !existing,
      message: existing ? 'Este email já está cadastrado' : 'Email disponível',
    };
  }

  async register(registerDto: RegisterDto) {
    // Verificar se nickname já existe
    const existingNickname = await this.usersService.findByNickname(registerDto.nickname);
    if (existingNickname) {
      throw new BadRequestException('Este nickname já está em uso');
    }

    // Verificar se username já existe
    const existingUsername = await this.usersService.findByUsername(registerDto.username);
    if (existingUsername) {
      throw new BadRequestException('Este nome de usuário já está em uso');
    }

    // Verificar se email já existe
    const existingEmail = await this.usersService.findByEmail(registerDto.email);
    if (existingEmail) {
      throw new BadRequestException('Este email já está cadastrado');
    }

    // Verificar se email e confirmEmail coincidem
    if (registerDto.email !== registerDto.confirmEmail) {
      throw new BadRequestException('Os emails não coincidem');
    }

    // Verificar se senha e confirmPassword coincidem
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('As senhas não coincidem');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    
    // Gerar token de verificação de email
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Buscar configurações de contas novas
    const newAccountSettings = await this.newAccountSettingsService.getSettings();
    
    // Buscar a divisão mais baixa disponível
    const lowestDivision = await this.divisionsService.getLowestAvailableDivision();
    
    // Criar usuário com valores das configurações (novas contas: sem playmat, sleeve Default)
    const user = await this.usersService.create({
      nickname: registerDto.nickname,
      username: registerDto.username,
      email: registerDto.email,
      password: hashedPassword,
      level: 1,
      totalScore: 0,
      winsGeral: 0,
      lossesGeral: 0,
      winsSeason: 0,
      lossesSeason: 0,
      credits: newAccountSettings.initialCredits,
      cash: newAccountSettings.initialCash,
      profileImage: undefined,
      clanTag: undefined,
      biography: undefined,
      playerClass: 'Novato',
      division: lowestDivision, // Divisão mais baixa disponível
      isOnline: false,
      isBanned: false,
      banReason: undefined,
      isEmailVerified: false, // Email não verificado inicialmente
      emailVerificationToken: verificationToken,
      equippedPlaymatId: null,
      equippedPlaymatImage: null,
      equippedSkinId: null,
      equippedSkinImage: null,
    });

    // Aplicar playmat e sleeve padrão conforme "Contas Novas" no admin
    const cosmeticsUpdate: { equippedPlaymatId?: string; equippedPlaymatImage?: string; equippedSkinId?: string; equippedSkinImage?: string } = {};
    const playmatId = newAccountSettings.defaultPlaymatId?.trim() || null;
    const skinId = newAccountSettings.defaultSkinId?.trim() || null;

    if (playmatId) {
      try {
        const playmat = await this.cosmeticsService.findOnePlaymat(playmatId);
        if (playmat?.image) {
          cosmeticsUpdate.equippedPlaymatId = playmat.id;
          cosmeticsUpdate.equippedPlaymatImage = playmat.image;
        }
      } catch (err: any) {
        console.warn(`⚠️ [AuthService] Playmat padrão não aplicado (ID ${playmatId}):`, err?.message || err);
      }
    }
    if (skinId) {
      try {
        const sleeve = await this.cosmeticsService.findOneSleeve(skinId);
        if (sleeve?.image) {
          cosmeticsUpdate.equippedSkinId = sleeve.id;
          cosmeticsUpdate.equippedSkinImage = sleeve.image;
        }
      } catch (err: any) {
        console.warn(`⚠️ [AuthService] Sleeve padrão não aplicada (ID ${skinId}):`, err?.message || err);
      }
    }
    if (Object.keys(cosmeticsUpdate).length > 0) {
      await this.usersService.updateCosmetics(user.id, cosmeticsUpdate);
      if (cosmeticsUpdate.equippedPlaymatId) {
        await this.usersService.addOwnedPlaymatIfNotPresent(user.id, cosmeticsUpdate.equippedPlaymatId);
      }
      if (cosmeticsUpdate.equippedSkinId) {
        await this.usersService.addOwnedSleeveIfNotPresent(user.id, cosmeticsUpdate.equippedSkinId);
      }
    }

    // Criar SeasonRanking para o usuário na season ativa
    try {
      await this.seasonsService.createUserRanking(user.id);
    } catch (error) {
      console.error('Erro ao criar ranking da season para o usuário:', error);
      // Não falha o registro se não houver season ativa
    }

    // Atribuir deck inicial aleatório ao usuário
    try {
      console.log(`🎴 [AuthService] Tentando atribuir deck inicial ao usuário ${user.id}...`);
      console.log(`🎴 [AuthService] Decks disponíveis configurados: ${newAccountSettings.availableInitialDeckIds?.length || 0}`);
      
      // Sempre tentar atribuir um deck inicial
      // Se houver IDs específicos configurados, usar apenas esses
      // Caso contrário, usar qualquer deck ativo disponível
      const deckIds = (newAccountSettings.availableInitialDeckIds && newAccountSettings.availableInitialDeckIds.length > 0) 
        ? newAccountSettings.availableInitialDeckIds 
        : undefined;
      
      if (deckIds) {
        console.log(`🎴 [AuthService] Usando decks configurados: ${JSON.stringify(deckIds)}`);
      } else {
        console.log(`🎴 [AuthService] Nenhum deck específico configurado, buscando qualquer deck ativo disponível...`);
      }
      
      await this.initialDecksService.assignDeckToUser(user.id, deckIds);
      console.log(`✅ [AuthService] Deck inicial atribuído com sucesso ao usuário ${user.id}`);
    } catch (error: any) {
      console.error('❌ [AuthService] Erro ao atribuir deck inicial ao usuário:', error);
      console.error(`   Mensagem: ${error?.message || 'Erro desconhecido'}`);
      console.error(`   Stack: ${error?.stack || 'N/A'}`);
      // Não falha o registro se não houver deck inicial disponível, mas avisa
      console.warn('⚠️ [AuthService] Usuário criado sem deck inicial. Configure decks iniciais no painel admin.');
    }

    // Enviar email de verificação
    let emailSent = false;
    try {
      console.log(`📧 [AuthService] Enviando email de verificação para: ${user.email}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📧 [AuthService] Token gerado: ${verificationToken.substring(0, 8)}...`);
      }
      const emailResult = await this.mailService.sendVerificationEmail(user.email, user.nickname, verificationToken);
      emailSent = emailResult === true; // Se retornar true, email foi enviado
      if (emailSent) {
        console.log(`✅ [AuthService] Email de verificação enviado com sucesso para: ${user.email}`);
      } else {
        console.warn(`⚠️ [AuthService] Email não foi enviado, mas usuário foi criado`);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`\n🔗 [AuthService] Link (dev): ${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/***\n`);
        }
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Erro ao enviar email, mas usuário foi criado:', error?.message || error);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`\n🔗 [AuthService] Link (dev): ${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/***\n`);
      }
      emailSent = false;
    }

    return {
      message: emailSent
        ? 'Registro realizado com sucesso! Verifique seu email para confirmar sua conta.'
        : 'Registro realizado com sucesso! Verifique seu email para confirmar sua conta. Se não recebeu o email, verifique a pasta de spam.',
      email: user.email,
      emailSent: emailSent,
    };
  }

  /**
   * Cria uma conta normal (PLAYER) pelo Admin/Master. Email já fica verificado; sem envio de email.
   */
  async createUserByAdmin(
    body: { username: string; nickname: string; email: string; password: string },
  ): Promise<{ id: number; username: string; nickname: string; email: string }> {
    const username = (body.username || '').trim();
    const nickname = (body.nickname || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password;

    if (!username || username.length < 3) {
      throw new BadRequestException('Username deve ter pelo menos 3 caracteres.');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new BadRequestException('Username deve conter apenas letras, números e underscore.');
    }
    if (!nickname || nickname.length < 3) {
      throw new BadRequestException('Nickname deve ter pelo menos 3 caracteres.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email inválido.');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException('Senha deve ter pelo menos 6 caracteres.');
    }

    const existingNick = await this.usersService.findByNickname(nickname);
    if (existingNick) {
      throw new BadRequestException('Este nickname já está em uso.');
    }
    const existingUser = await this.usersService.findByUsername(username);
    if (existingUser) {
      throw new BadRequestException('Este username já está em uso.');
    }
    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) {
      throw new BadRequestException('Este email já está cadastrado.');
    }

    const newAccountSettings = await this.newAccountSettingsService.getSettings();
    const lowestDivision = await this.divisionsService.getLowestAvailableDivision();
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.usersService.create({
      nickname,
      username,
      email,
      password: hashedPassword,
      level: 1,
      totalScore: 0,
      winsGeral: 0,
      lossesGeral: 0,
      winsSeason: 0,
      lossesSeason: 0,
      credits: newAccountSettings.initialCredits,
      cash: newAccountSettings.initialCash,
      profileImage: undefined,
      clanTag: undefined,
      biography: undefined,
      playerClass: 'Novato',
      division: lowestDivision,
      isOnline: false,
      isBanned: false,
      isEmailVerified: true,
      emailVerificationToken: undefined,
      equippedPlaymatId: null,
      equippedPlaymatImage: null,
      equippedSkinId: null,
      equippedSkinImage: null,
    });

    const cosmeticsUpdate: { equippedPlaymatId?: string; equippedPlaymatImage?: string; equippedSkinId?: string; equippedSkinImage?: string } = {};
    const playmatId = newAccountSettings.defaultPlaymatId?.trim() || null;
    const skinId = newAccountSettings.defaultSkinId?.trim() || null;
    if (playmatId) {
      try {
        const playmat = await this.cosmeticsService.findOnePlaymat(playmatId);
        if (playmat?.image) {
          cosmeticsUpdate.equippedPlaymatId = playmat.id;
          cosmeticsUpdate.equippedPlaymatImage = playmat.image;
        }
      } catch (_) {}
    }
    if (skinId) {
      try {
        const sleeve = await this.cosmeticsService.findOneSleeve(skinId);
        if (sleeve?.image) {
          cosmeticsUpdate.equippedSkinId = sleeve.id;
          cosmeticsUpdate.equippedSkinImage = sleeve.image;
        }
      } catch (_) {}
    }
    if (Object.keys(cosmeticsUpdate).length > 0) {
      await this.usersService.updateCosmetics(user.id, cosmeticsUpdate);
      if (cosmeticsUpdate.equippedPlaymatId) {
        await this.usersService.addOwnedPlaymatIfNotPresent(user.id, cosmeticsUpdate.equippedPlaymatId);
      }
      if (cosmeticsUpdate.equippedSkinId) {
        await this.usersService.addOwnedSleeveIfNotPresent(user.id, cosmeticsUpdate.equippedSkinId);
      }
    }

    try {
      await this.seasonsService.createUserRanking(user.id);
    } catch (_) {}

    try {
      const deckIds = (newAccountSettings.availableInitialDeckIds && newAccountSettings.availableInitialDeckIds.length > 0)
        ? newAccountSettings.availableInitialDeckIds
        : undefined;
      await this.initialDecksService.assignDeckToUser(user.id, deckIds);
    } catch (_) {}

    return { id: user.id, username: user.username, nickname: user.nickname, email: user.email };
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.findByVerificationToken(token);
    
    if (!user) {
      throw new BadRequestException('Token de verificação inválido');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email já foi verificado');
    }

    await this.usersService.verifyEmail(user.id);

    // Limpar token de verificação após verificação bem-sucedida
    await this.usersService.clearVerificationToken(user.id);

    // Enviar email de boas-vindas
    try {
      await this.mailService.sendWelcomeEmail(user.email, user.nickname);
    } catch (error) {
      console.error('Erro ao enviar email de boas-vindas:', error);
    }

    return {
      message: 'Email verificado com sucesso! Você já pode fazer login.',
    };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new BadRequestException('Email não encontrado');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email já foi verificado');
    }

    // Gerar novo token de verificação
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Atualizar token no banco
    await this.usersService.updateVerificationToken(user.id, verificationToken);

    // Enviar email de verificação
    try {
      await this.mailService.sendVerificationEmail(user.email, user.nickname, verificationToken);
      return {
        message: 'Email de verificação reenviado com sucesso! Verifique sua caixa de entrada.',
      };
    } catch (error) {
      console.error('Erro ao reenviar email:', error);
      throw new BadRequestException('Erro ao enviar email de verificação');
    }
  }

  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email.trim().toLowerCase());
    if (!user) {
      return { message: 'Se esse email estiver cadastrado, você receberá um link para redefinir a senha.' };
    }
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.usersService.setPasswordResetToken(user.id, token, expiresAt);
    const sent = await this.mailService.sendPasswordResetEmail(user.email, user.nickname, token);
    return {
      message: sent
        ? 'Enviamos um link para redefinir sua senha no seu email. Verifique a caixa de entrada e o spam.'
        : 'Se esse email estiver cadastrado, você receberá um link para redefinir a senha.',
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersService.findByPasswordResetToken(token);
    if (!user) {
      throw new BadRequestException('Link inválido ou expirado.');
    }
    const expiresAt = (user as any).passwordResetExpiresAt;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      await this.usersService.clearPasswordResetToken(user.id);
      throw new BadRequestException('Link expirado. Solicite uma nova redefinição de senha.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('A senha deve ter pelo menos 6 caracteres.');
    }
    await this.usersService.setPasswordByResetToken(user.id, newPassword);
    return { message: 'Senha alterada com sucesso. Faça login com a nova senha.' };
  }
}
