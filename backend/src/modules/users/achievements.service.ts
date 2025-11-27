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

  // Verificar e conceder conquistas baseadas em rating
  async checkRatingAchievements(userId: number, rating: number): Promise<void> {
    const achievements = [
      { threshold: 1500, title: 'Aprendiz', description: 'Alcance rating de 1500' },
      { threshold: 2000, title: 'Veterano', description: 'Alcance rating de 2000' },
      { threshold: 2500, title: 'Mestre', description: 'Alcance rating de 2500' },
      { threshold: 3000, title: 'Lendário', description: 'Alcance rating de 3000' },
    ];

    for (const achievement of achievements) {
      if (rating >= achievement.threshold) {
        // Verificar se já existe esta conquista específica
        const existing = await this.achievementsRepository.find({
          where: { userId, type: AchievementType.RATING },
        });
        
        const exists = existing.some(a => 
          a.metadata && (a.metadata as any).threshold === achievement.threshold
        );

        if (!exists) {
          await this.achievementsRepository.save({
            userId,
            type: AchievementType.RATING,
            title: achievement.title,
            description: achievement.description,
            metadata: { threshold: achievement.threshold },
          });
        }
      }
    }
  }
}

