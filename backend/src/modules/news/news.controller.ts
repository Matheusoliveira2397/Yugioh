import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query, ForbiddenException } from '@nestjs/common';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/entities/user.entity';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createNewsDto: CreateNewsDto, @Request() req: any) {
    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.MASTER;
    if (!isAdmin) {
      throw new ForbiddenException('Apenas administradores podem criar notícias');
    }
    const userId = Number(req.user.id);
    return this.newsService.create(createNewsDto, userId);
  }

  @Get()
  findAll() {
    return this.newsService.findAll();
  }

  @Get('latest')
  getLatest(@Query('limit') limit?: string) {
    const limitNumber = limit ? parseInt(limit) : 10;
    return this.newsService.getLatest(limitNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNewsDto: UpdateNewsDto,
    @Request() req: any,
  ) {
    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.MASTER;
    const userId = Number(req.user.id);
    return this.newsService.update(id, updateNewsDto, userId, isAdmin);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.MASTER;
    const userId = Number(req.user.id);
    return this.newsService.remove(id, userId, isAdmin);
  }
}
