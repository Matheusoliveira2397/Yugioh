import {
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  constructor(private readonly configService: ConfigService) {
    super({
      session: false,
      prompt: 'select_account',
    });
  }

  canActivate(context: ExecutionContext) {
    if (!this.isGoogleConfigured()) {
      throw new ServiceUnavailableException(
        'Login com Google não está configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
      );
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const req = context.switchToHttp().getRequest();
      const res = context.switchToHttp().getResponse();
      const frontend = this.getFrontendBase();

      const queryError =
        typeof req?.query?.error === 'string' ? req.query.error : null;
      const queryDesc =
        typeof req?.query?.error_description === 'string'
          ? req.query.error_description
          : null;

      const detail =
        err?.message ||
        err?.oauthError?.data ||
        err?.oauthError?.message ||
        info?.message ||
        (typeof info === 'string' ? info : null) ||
        queryDesc ||
        queryError ||
        'Falha na autenticação com Google. Tente novamente.';

      this.logger.warn(
        `Google OAuth falhou: ${detail}` +
          (queryError ? ` (query.error=${queryError})` : '') +
          (err ? ` | err=${err?.name || typeof err}` : '') +
          (info ? ` | info=${typeof info === 'object' ? JSON.stringify(info) : info}` : ''),
      );

      if (!res.headersSent) {
        res.redirect(
          `${frontend}/auth/google/callback?error=${encodeURIComponent(String(detail))}`,
        );
      }
      return null;
    }
    return user;
  }

  private isGoogleConfigured(): boolean {
    const id = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const secret = this.configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    return Boolean(id && secret && id !== 'not-configured' && secret !== 'not-configured');
  }

  private getFrontendBase(): string {
    return (
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      this.configService.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ||
      'http://localhost:5173'
    );
  }
}
