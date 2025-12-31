import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { SeasonsService } from '../seasons/seasons.service';
import { InitialDecksService } from '../initial-decks/initial-decks.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private seasonsService: SeasonsService,
    private initialDecksService: InitialDecksService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);
    
    if (!user) {
      return null;
    }

    // Verificação de email desabilitada temporariamente
    // if (!user.emailVerified) {
    //   throw new UnauthorizedException('Por favor, confirme seu email antes de fazer login');
    // }

    if (await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
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
    
    // Criar usuário com valores padrão
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
      credits: 50,
      cash: 50000,
      profileImage: undefined,
      clanTag: undefined,
      biography: undefined,
      playerClass: 'Novato',
      division: 'Bronze', // Todos começam na divisão Bronze
      isOnline: false,
      isBanned: false,
      banReason: undefined,
      isEmailVerified: true,
    });

    // Criar SeasonRanking para o usuário na season ativa
    try {
      await this.seasonsService.createUserRanking(user.id);
    } catch (error) {
      console.error('Erro ao criar ranking da season para o usuário:', error);
      // Não falha o registro se não houver season ativa
    }

    // Atribuir deck inicial aleatório ao usuário
    try {
      await this.initialDecksService.assignDeckToUser(user.id);
    } catch (error) {
      console.error('Erro ao atribuir deck inicial ao usuário:', error);
      // Não falha o registro se não houver deck inicial disponível
    }

    // Envio de email desabilitado temporariamente
    // try {
    //   await this.mailService.sendVerificationEmail(user.email, user.nickname, verificationToken);
    // } catch (error) {
    //   console.error('Erro ao enviar email, mas usuário foi criado:', error);
    //   console.log(`\n🔗 Link de verificação: http://localhost:5173/verify-email/${verificationToken}\n`);
    // }

    return {
      message: 'Registro realizado com sucesso! Você já pode fazer login.',
      email: user.email,
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

  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
