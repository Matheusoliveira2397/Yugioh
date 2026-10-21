import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID')?.trim() || 'not-configured';
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim() || 'not-configured';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
      'http://localhost:3000/auth/google/callback';

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  /**
   * Retorna o usuário (Promise). Não misturar com callback `done` —
   * no Nest isso faz o Passport receber `undefined` e falhar sem mensagem útil.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Conta Google sem email disponível.');
    }

    return this.authService.findOrCreateFromGoogle({
      googleId: profile.id,
      email,
      displayName: profile.displayName || email.split('@')[0],
      // Foto do Google intencionalmente ignorada — avatar padrão do jogo
      picture: null,
    });
  }
}
