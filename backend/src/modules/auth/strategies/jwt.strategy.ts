import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { getJwtSecret } from '../jwt-secret.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
  }

  async validate(payload: any) {
    console.log('🔍 JWT Strategy validate - payload.sub:', payload.sub, 'tipo:', typeof payload.sub);
    // Converter payload.sub para number (pode ser string de JWT antigo ou number novo)
    const userId = typeof payload.sub === 'string' ? parseInt(payload.sub, 10) : Number(payload.sub);
    console.log('🔍 JWT Strategy validate - userId convertido:', userId, 'tipo:', typeof userId);
    if (isNaN(userId)) {
      console.log('❌ JWT Strategy - userId é NaN!');
      throw new UnauthorizedException('Invalid user ID');
    }
    const user = await this.usersService.findByIdForAuth(userId);
    if (!user) {
      console.log('❌ JWT Strategy - usuário não encontrado com ID:', userId);
      throw new UnauthorizedException();
    }
    await this.usersService.clearExpiredBan(userId);
    const fresh = await this.usersService.findByIdForAuth(userId);
    if (fresh && this.usersService.isCurrentlyBanned(fresh)) {
      const until = fresh.bannedUntil;
      const reason = (fresh as any).banReason || 'Violação dos termos de uso';
      const msg = until
        ? `Conta suspensa até ${new Date(until).toLocaleDateString('pt-BR')}. Motivo: ${reason}`
        : `Conta banida. Motivo: ${reason}`;
      throw new UnauthorizedException(msg);
    }
    const userObj = { id: Number(user.id), username: user.username, email: user.email, role: user.role };
    console.log('🔍 JWT Strategy validate - retornando user:', userObj);
    return userObj;
  }
}
