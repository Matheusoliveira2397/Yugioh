import { Controller, Post, Get, Body, UseGuards, Request, Param, Query, Ip } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { LocalMasterAuthGuard } from './guards/local-master-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('verify-email/:token')
  async verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification-email')
  async resendVerificationEmail(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  @Get('check-nickname')
  async checkNickname(@Query('nickname') nickname: string) {
    return this.authService.checkNickname(nickname);
  }

  @Get('check-username')
  async checkUsername(@Query('username') username: string) {
    return this.authService.checkUsername(username);
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    return this.authService.checkEmail(email);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email || '');
  }

  @Post('reset-password/:token')
  async resetPassword(@Param('token') token: string, @Body() body: { newPassword: string }) {
    return this.authService.resetPassword(token, body.newPassword || '');
  }

  @Get('confirm-email-change/:token')
  async confirmEmailChange(@Param('token') token: string) {
    return this.usersService.confirmEmailChange(token);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Request() req: any, @Ip() ip: string) {
    const result = await this.authService.login(req.user);
    
    // Capturar IP real (considerando proxies)
    const realIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.headers['x-real-ip'] || 
                   ip || 
                   req.ip || 
                   req.connection?.remoteAddress || 
                   'unknown';
    
    console.log(`🌐 [login] Capturando IP para usuário ${req.user.id}: ${realIp}`);
    
    // Atualizar último login, IP e marcar como online
    try {
      await this.usersService.updateLastLogin(req.user.id, realIp);
      // updateLastLogin já marca como online, não precisa fazer novamente
      console.log(`✅ [login] IP, último login atualizados e usuário ${req.user.id} marcado como online`);
    } catch (error) {
      console.error(`❌ [login] Erro ao atualizar IP para usuário ${req.user.id}:`, error);
    }
    
    return result;
  }

  /** Login exclusivo para conta Master. Contas normais não podem usar esta rota. */
  @UseGuards(LocalMasterAuthGuard)
  @Post('login-master')
  async loginMaster(@Body() loginDto: LoginDto, @Request() req: any, @Ip() ip: string) {
    const result = await this.authService.login(req.user);

    const realIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] || ip || req.ip || req.connection?.remoteAddress || 'unknown';

    try {
      await this.usersService.updateLastLogin(req.user.id, realIp);
    } catch (error) {
      console.error(`[login-master] Erro ao atualizar IP para usuário ${req.user.id}:`, error);
    }

    return result;
  }
}
