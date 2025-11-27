import { Controller, Post, Get, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('verify-email/:token')
  async verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
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

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    return this.authService.login(req.user);
  }
}
