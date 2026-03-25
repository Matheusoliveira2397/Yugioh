import { ConfigService } from '@nestjs/config';

/**
 * Secret único para assinar/verificar JWT (AuthModule, JwtStrategy, gateways que usam JwtService).
 * - Faz trim (evita falha por newline em Docker / .env).
 * - Em produção, exige JWT_SECRET definido.
 */
export function getJwtSecret(configService: ConfigService): string {
  const raw = configService.get<string>('JWT_SECRET');
  const trimmed = (raw ?? '').trim();
  if (trimmed) {
    return trimmed;
  }
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    return 'dev-only-jwt-secret-not-for-production';
  }
  throw new Error(
    'JWT_SECRET está ausente ou vazio. Defina uma variável forte no ambiente (Docker, Render, Railway, etc.).',
  );
}
