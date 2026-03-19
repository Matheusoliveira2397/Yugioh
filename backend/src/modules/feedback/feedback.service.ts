import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { UserFeedback, FeedbackType } from './entities/user-feedback.entity';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(UserFeedback)
    private feedbackRepository: Repository<UserFeedback>,
  ) {}

  async create(userId: number, type: FeedbackType, message: string): Promise<UserFeedback> {
    const feedback = this.feedbackRepository.create({
      userId,
      type,
      message: message.trim(),
    });
    return this.feedbackRepository.save(feedback);
  }

  async findMy(userId: number): Promise<UserFeedback[]> {
    return this.feedbackRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllForAdmin(): Promise<(UserFeedback & { userNickname?: string; userUsername?: string })[]> {
    const list = await this.feedbackRepository
      .createQueryBuilder('f')
      .orderBy('f.createdAt', 'DESC')
      .getMany();

    const userIds = [...new Set(list.map((f) => f.userId))];
    if (userIds.length === 0) return list;

    const users = await this.feedbackRepository.manager.query(
      `SELECT id, nickname, username FROM users WHERE id = ANY($1)`,
      [userIds],
    ) as { id: number; nickname: string | null; username: string }[];
    const userMap = new Map<number, { nickname: string | null; username: string }>(
      users.map((u) => [u.id, { nickname: u.nickname, username: u.username }])
    );

    return list.map((f) => {
      const u = userMap.get(f.userId);
      return {
        ...f,
        userNickname: u?.nickname ?? undefined,
        userUsername: u?.username ?? undefined,
      };
    });
  }

  async markAsRead(id: string): Promise<UserFeedback> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback não encontrado');
    feedback.readAt = new Date();
    return this.feedbackRepository.save(feedback);
  }

  async reply(id: string, repliedByUserId: number, message: string): Promise<UserFeedback> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback não encontrado');
    const trimmed = message?.trim();
    if (!trimmed) throw new BadRequestException('Resposta não pode estar vazia');
    feedback.replyMessage = trimmed;
    feedback.repliedAt = new Date();
    feedback.repliedByUserId = repliedByUserId;
    if (!feedback.readAt) feedback.readAt = new Date();
    return this.feedbackRepository.save(feedback);
  }
}
