import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from './news.entity';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private newsRepository: Repository<News>,
  ) {}

  async create(createNewsDto: CreateNewsDto, userId: number): Promise<News> {
    const news = this.newsRepository.create({
      ...createNewsDto,
      authorId: userId,
    });
    return await this.newsRepository.save(news);
  }

  async findAll(): Promise<News[]> {
    return await this.newsRepository.find({
      where: { isActive: true },
      order: {
        isPinned: 'DESC',
        createdAt: 'DESC',
      },
      relations: ['author'],
      select: {
        id: true,
        title: true,
        content: true,
        image: true,
        isActive: true,
        isPinned: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          nickname: true,
          username: true,
          email: true,
          role: true,
          winsGeral: true,
          lossesGeral: true,
          winsSeason: true,
          lossesSeason: true,
          rating: true,
          credits: true,
          cash: true,
          level: true,
          experience: true,
          totalScore: true,
          profileImage: true,
          isOnline: true,
          isBanned: true,
          banReason: true,
          lastLogin: true,
          lastIpAddress: true,
          avatar: true,
          isEmailVerified: true,
          clanTag: true,
          biography: true,
          playerClass: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      take: 50,
    });
  }

  async findOne(id: string): Promise<News> {
    const news = await this.newsRepository.findOne({
      where: { id },
      relations: ['author'],
      select: {
        id: true,
        title: true,
        content: true,
        image: true,
        isActive: true,
        isPinned: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          nickname: true,
          username: true,
          email: true,
          role: true,
          winsGeral: true,
          lossesGeral: true,
          winsSeason: true,
          lossesSeason: true,
          rating: true,
          credits: true,
          cash: true,
          level: true,
          experience: true,
          totalScore: true,
          profileImage: true,
          isOnline: true,
          isBanned: true,
          banReason: true,
          lastLogin: true,
          lastIpAddress: true,
          avatar: true,
          isEmailVerified: true,
          clanTag: true,
          biography: true,
          playerClass: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    });

    if (!news) {
      throw new NotFoundException('Notícia não encontrada');
    }

    return news;
  }

  async update(id: string, updateNewsDto: UpdateNewsDto, userId: number, isAdmin: boolean): Promise<News> {
    const news = await this.findOne(id);

    if (!isAdmin && news.authorId !== userId) {
      throw new ForbiddenException('Você não tem permissão para editar esta notícia');
    }

    Object.assign(news, updateNewsDto);
    return await this.newsRepository.save(news);
  }

  async remove(id: string, userId: number, isAdmin: boolean): Promise<void> {
    const news = await this.findOne(id);

    if (!isAdmin && news.authorId !== userId) {
      throw new ForbiddenException('Você não tem permissão para remover esta notícia');
    }

    await this.newsRepository.remove(news);
  }

  async getLatest(limit: number = 10): Promise<News[]> {
    return await this.newsRepository.find({
      where: { isActive: true },
      order: {
        isPinned: 'DESC',
        createdAt: 'DESC',
      },
      relations: ['author'],
      select: {
        id: true,
        title: true,
        content: true,
        image: true,
        isActive: true,
        isPinned: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          nickname: true,
          username: true,
          email: true,
          role: true,
          winsGeral: true,
          lossesGeral: true,
          winsSeason: true,
          lossesSeason: true,
          rating: true,
          credits: true,
          cash: true,
          level: true,
          experience: true,
          totalScore: true,
          profileImage: true,
          isOnline: true,
          isBanned: true,
          banReason: true,
          lastLogin: true,
          lastIpAddress: true,
          avatar: true,
          isEmailVerified: true,
          clanTag: true,
          biography: true,
          playerClass: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      take: limit,
    });
  }
}
