import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
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
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
        email: user.email,
        wins: user.wins,
        losses: user.losses,
        rating: user.rating,
        gems: user.gems,
        profileImage: user.profileImage || '/avatars/default.png',
        role: user.role,
      },
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

    // Gerar token de verificação
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
      verificationToken,
      emailVerified: true, // Email já considerado verificado para testes
    });

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

    if (user.emailVerified) {
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
