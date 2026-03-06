import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { User } from './entities/user.entity';

@Injectable()
export class AchievementsService {
  constructor(
    @InjectRepository(Achievement)
    private achievementsRepository: Repository<Achievement>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // Obter todas as conquistas de um usuário
  async getUserAchievements(userId: number): Promise<Achievement[]> {
    return this.achievementsRepository.find({
      where: { userId },
      order: { unlockedAt: 'DESC' },
    });
  }

  // Verificar e conceder conquistas baseadas em vitórias
  async checkVictoryAchievements(userId: number, totalWins: number): Promise<void> {
    const achievements = [
      { type: AchievementType.VICTORIES, threshold: 1, title: 'Primeira Vitória', description: 'Ganhe seu primeiro duelo' },
      { type: AchievementType.VICTORIES, threshold: 10, title: 'Dez Vitórias', description: 'Ganhe 10 duelos' },
      { type: AchievementType.VICTORIES, threshold: 50, title: 'Cinquenta Vitórias', description: 'Ganhe 50 duelos' },
      { type: AchievementType.VICTORIES, threshold: 100, title: 'Centenário', description: 'Ganhe 100 duelos' },
      { type: AchievementType.VICTORIES, threshold: 500, title: 'Lendário', description: 'Ganhe 500 duelos' },
    ];

    for (const achievement of achievements) {
      if (totalWins >= achievement.threshold) {
        // Verificar se já existe esta conquista específica
        const existing = await this.achievementsRepository.find({
          where: { userId, type: achievement.type },
        });
        
        const exists = existing.some(a => 
          a.metadata && (a.metadata as any).threshold === achievement.threshold
        );

        if (!exists) {
          await this.achievementsRepository.save({
            userId,
            type: achievement.type,
            title: achievement.title,
            description: achievement.description,
            metadata: { threshold: achievement.threshold },
          });
        }
      }
    }
  }
}

