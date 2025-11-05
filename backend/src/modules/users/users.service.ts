import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from './entities/user.entity';
import { SeasonRanking } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(SeasonRanking)
    private seasonRankingRepository: Repository<SeasonRanking>,
    @InjectRepository(Season)
    private seasonRepository: Repository<Season>,
    @InjectRepository(GroupMember)
    private groupMemberRepository: Repository<GroupMember>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByNickname(nickname: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { nickname } });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { verificationToken: token } });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      emailVerified: true,
      verificationToken: undefined,
    });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'username', 'wins', 'losses', 'rating'],
      order: { rating: 'DESC' },
    });
  }

  async updateStats(userId: string, stats: Partial<User>): Promise<User> {
    await this.usersRepository.update(userId, stats);
    return this.findById(userId);
  }

  async updateProfileImage(userId: string, profileImage: string): Promise<User> {
    await this.usersRepository.update(userId, { profileImage });
    return this.findById(userId);
  }

  async getSeasonRanking(): Promise<any[]> {
    // Busca a season ativa
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
    });

    if (!activeSeason) {
      return [];
    }

    // Busca os rankings da season ativa
    const rankings = await this.seasonRankingRepository.find({
      where: { seasonId: activeSeason.id },
      relations: ['user'],
      order: { seasonScore: 'DESC' },
      take: 100,
    });

    // Busca os grupos dos usuários
    const userIds = rankings.map(r => r.userId);
    const groupMembers = userIds.length > 0 
      ? await this.groupMemberRepository.find({
          where: { userId: In(userIds) },
          relations: ['group'],
        })
      : [];

    const groupMap = new Map(groupMembers.map(gm => [gm.userId, gm.group]));

    // Formata os dados para o frontend
    return rankings.map(ranking => ({
      id: ranking.user.id,
      nickname: ranking.user.nickname,
      profileImage: ranking.user.profileImage,
      seasonScore: ranking.seasonScore,
      totalScore: ranking.user.totalScore,
      wins: ranking.wins,
      losses: ranking.losses,
      division: ranking.division,
      seasonRank: ranking.rank,
      group: groupMap.get(ranking.userId) || null,
    }));
  }

  async getGeneralRanking(): Promise<any[]> {
    const users = await this.usersRepository.find({
      order: { totalScore: 'DESC' },
      take: 100,
    });

    // Busca os dados da season ativa para cada usuário
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
    });

    // Busca os grupos dos usuários
    const userIds = users.map(u => u.id);
    const groupMembers = userIds.length > 0
      ? await this.groupMemberRepository.find({
          where: { userId: In(userIds) },
          relations: ['group'],
        })
      : [];

    const groupMap = new Map(groupMembers.map(gm => [gm.userId, gm.group]));

    if (!activeSeason) {
      return users.map(user => ({
        id: user.id,
        nickname: user.nickname,
        profileImage: user.profileImage,
        seasonScore: 0,
        totalScore: user.totalScore,
        wins: user.wins,
        losses: user.losses,
        division: 'Bronze',
        group: groupMap.get(user.id) || null,
      }));
    }

    const rankings = await this.seasonRankingRepository.find({
      where: { seasonId: activeSeason.id },
      relations: ['user'],
    });

    const rankingMap = new Map(rankings.map(r => [r.userId, r]));

    return users.map(user => {
      const seasonRanking = rankingMap.get(user.id);
      return {
        id: user.id,
        nickname: user.nickname,
        profileImage: user.profileImage,
        seasonScore: seasonRanking?.seasonScore || 0,
        totalScore: user.totalScore,
        wins: seasonRanking?.wins || user.wins,
        losses: seasonRanking?.losses || user.losses,
        division: seasonRanking?.division || 'Bronze',
        globalRank: 0, // Será calculado no frontend baseado na posição
        group: groupMap.get(user.id) || null,
      };
    });
  }

  async updateCoins(userId: string, amount: number): Promise<User> {
    const user = await this.findById(userId);
    user.coins = (user.coins || 0) + amount;
    return this.usersRepository.save(user);
  }

  async getTop5Players(): Promise<any[]> {
    // Busca a season ativa
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
    });

    if (!activeSeason) {
      // Se não há season ativa, retorna top 5 por rating geral
      const users = await this.usersRepository.find({
        order: { rating: 'DESC' },
        take: 5,
        select: ['id', 'nickname', 'profileImage', 'rating', 'wins', 'losses', 'totalScore'],
      });

      return users.map((user, index) => ({
        rank: index + 1,
        id: user.id,
        nickname: user.nickname,
        profileImage: user.profileImage,
        rating: user.rating,
        wins: user.wins,
        losses: user.losses,
        score: user.totalScore,
      }));
    }

    // Busca top 5 da season ativa
    const rankings = await this.seasonRankingRepository.find({
      where: { seasonId: activeSeason.id },
      relations: ['user'],
      order: { seasonScore: 'DESC' },
      take: 5,
    });

    return rankings.map((ranking, index) => ({
      rank: index + 1,
      id: ranking.user.id,
      nickname: ranking.user.nickname,
      profileImage: ranking.user.profileImage,
      rating: ranking.user.rating,
      wins: ranking.wins,
      losses: ranking.losses,
      score: ranking.seasonScore,
      division: ranking.division,
    }));
  }
}
