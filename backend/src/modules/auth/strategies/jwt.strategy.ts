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
    const userId = typeof payload.sub === 'string' ? parseInt(payload.sub, 10) : Number(payload.sub);
    if (!Number.isFinite(userId) || isNaN(userId)) {
      throw new UnauthorizedException('Invalid user ID');
    }

    // Uma única consulta — sem console.log no hot path (cada request autenticado)
    const user = await this.usersService.findByIdForAuth(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    // Ban expirado: UPDATE direto (sem 2º/3º SELECT)
    if (user.isBanned && user.bannedUntil != null && new Date(user.bannedUntil) <= new Date()) {
      await this.usersService.clearExpiredBan(userId, {
        isBanned: user.isBanned,
        bannedUntil: user.bannedUntil,
      });
      user.isBanned = false;
    } else if (this.usersService.isCurrentlyBanned(user)) {
      const until = user.bannedUntil;
      const reason = user.banReason || 'Violação dos termos de uso';
      const msg = until
        ? `Conta suspensa até ${new Date(until).toLocaleDateString('pt-BR')}. Motivo: ${reason}`
        : `Conta banida. Motivo: ${reason}`;
      throw new UnauthorizedException(msg);
    }

    return {
      id: Number(user.id),
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }
}
