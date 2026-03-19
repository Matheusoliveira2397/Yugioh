import { Controller, Get, Post, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { FeedbackType } from './entities/user-feedback.entity';

@Controller('feedback')
export class FeedbackController {
  constructor(private feedbackService: FeedbackService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Request() req: any,
    @Body() body: { type: FeedbackType; message: string },
  ) {
    const { type, message } = body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestException('Mensagem é obrigatória');
    }
    const validTypes: FeedbackType[] = ['doubt', 'opinion', 'bug', 'suggestion', 'other'];
    const t = (validTypes.includes(type) ? type : 'other') as FeedbackType;
    return this.feedbackService.create(req.user.id, t, message.trim());
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async findMy(@Request() req: any) {
    return this.feedbackService.findMy(req.user.id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/all')
  async findAllForAdmin() {
    return this.feedbackService.findAllForAdmin();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/:id/read')
  async markAsRead(@Param('id') id: string) {
    return this.feedbackService.markAsRead(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/:id/reply')
  async reply(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { message: string },
  ) {
    const message = body?.message;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestException('Mensagem da resposta é obrigatória');
    }
    return this.feedbackService.reply(id, req.user.id, message.trim());
  }
}
