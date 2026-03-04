import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { SeasonsService } from '../seasons/seasons.service';
import { InitialDecksService } from '../initial-decks/initial-decks.service';
import { NewAccountSettingsService } from '../new-account-settings/new-account-settings.service';
import { DivisionsService } from '../divisions/divisions.service';
import { CosmeticsService } from '../cosmetics/cosmetics.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private seasonsService: SeasonsService,
    private initialDecksService: InitialDecksService,
    private newAccountSettingsService: NewAccountSettingsService,
    private divisionsService: DivisionsService,
    private cosmeticsService: CosmeticsService,
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

    if (await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }

    return null;
  }

  async login(user: any) {
    // Garantir que sub seja number
    const payload = { username: user.username, sub: Number(user.id), role: user.role };
    
    // Buscar dados completos do usuário incluindo grupo atualizado
    const fullProfile = await this.usersService.getFullProfile(user.id);
    
      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: fullProfile.id,
          nickname: fullProfile.nickname,
          username: fullProfile.username,
          email: fullProfile.email,
          winsGeral: fullProfile.winsGeral,
          lossesGeral: fullProfile.lossesGeral,
          winsSeason: fullProfile.winsSeason,
          lossesSeason: fullProfile.lossesSeason,
          rating: fullProfile.rating,
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
    
    // Criar usuário com valores das configurações (novas contas: sem playmat, skin Default)
    const user = await this.usersService.create({
      nickname: registerDto.nickname,
      username: registerDto.username,
      email: registerDto.email,
      password: hashedPassword,
      level: 1,
      experience: 0,
      totalScore: 0,
      winsGeral: 0,
      lossesGeral: 0,
      winsSeason: 0,
      lossesSeason: 0,
      rating: 1000,
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

    // Aplicar playmat e skin padrão se configurados
    const cosmeticsUpdate: { equippedPlaymatId?: string; equippedPlaymatImage?: string; equippedSkinId?: string; equippedSkinImage?: string } = {};
    if (newAccountSettings.defaultPlaymatId) {
      try {
        const playmat = await this.cosmeticsService.findOnePlaymat(newAccountSettings.defaultPlaymatId);
        if (playmat?.image) {
          cosmeticsUpdate.equippedPlaymatId = playmat.id;
          cosmeticsUpdate.equippedPlaymatImage = playmat.image;
        }
      } catch (_) {
        // Playmat não encontrado ou inativo, ignorar
      }
    }
    if (newAccountSettings.defaultSkinId) {
      try {
        const sleeve = await this.cosmeticsService.findOneSleeve(newAccountSettings.defaultSkinId);
        if (sleeve?.image) {
          cosmeticsUpdate.equippedSkinId = sleeve.id;
          cosmeticsUpdate.equippedSkinImage = sleeve.image;
        }
      } catch (_) {
        // Skin não encontrada ou inativa, ignorar
      }
    }
    if (Object.keys(cosmeticsUpdate).length > 0) {
      await this.usersService.updateCosmetics(user.id, cosmeticsUpdate);
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
      console.log(`📧 [AuthService] Token gerado: ${verificationToken.substring(0, 10)}...`);
      const emailResult = await this.mailService.sendVerificationEmail(user.email, user.nickname, verificationToken);
      emailSent = emailResult === true; // Se retornar true, email foi enviado
      if (emailSent) {
        console.log(`✅ [AuthService] Email de verificação enviado com sucesso para: ${user.email}`);
      } else {
        console.warn(`⚠️ [AuthService] Email não foi enviado, mas usuário foi criado`);
        console.log(`\n🔗 [AuthService] Link de verificação (copie e cole no navegador):`);
        console.log(`   ${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}\n`);
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Erro ao enviar email, mas usuário foi criado:', error);
      console.error(`   Detalhes: ${error?.message || 'Erro desconhecido'}`);
      console.log(`\n🔗 [AuthService] Link de verificação (copie e cole no navegador):`);
      console.log(`   ${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}\n`);
      emailSent = false;
    }

    return {
      message: emailSent 
        ? 'Registro realizado com sucesso! Verifique seu email para confirmar sua conta.'
        : 'Registro realizado com sucesso! Verifique seu email para confirmar sua conta. Se não recebeu o email, verifique a pasta de spam ou use o link abaixo.',
      email: user.email,
      emailSent: emailSent,
      verificationLink: emailSent ? undefined : `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`,
    };
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
