import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TournamentClass } from './entities/tournament-class.entity';
import { User } from '../users/entities/user.entity';
import { normalizeProfileImageForClient } from '../users/profile-image.util';

export interface TournamentRankingEntry {
  rank: number;
  userId: number;
  nickname: string;
  profileImage: string | null;
  clanTag: string | null;
  tournamentPoints: number;
  className: string;
  classOrder: number;
}

@Injectable()
export class TournamentRankingService {
  constructor(
    @InjectRepository(TournamentClass)
    private readonly classRepository: Repository<TournamentClass>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Retorna as classes configuradas (Obelisco, Rá, Slifer) ordenadas por order (1 = topo).
   */
  async getClasses(): Promise<TournamentClass[]> {
    return this.classRepository.find({
      order: { order: 'ASC' },
    });
  }

  /**
   * Ranking: todos os usuários com tournamentPoints, ordenados por pontos DESC.
   * Atribui a classe de cada um: Obelisco (limite 50), Rá (limite 100), Slifer (resto com minPoints).
   * Quem tem pontos para Obelisco mas está além do 50º só entra se passar o 50º colocado.
   */
  async getRanking(limit?: number): Promise<{ classes: TournamentClass[]; ranking: TournamentRankingEntry[] }> {
    const classes = await this.getClasses();
    const users = await this.userRepository.find({
      where: {},
      select: ['id', 'nickname', 'profileImage', 'clanTag', 'tournamentPoints'],
      order: { tournamentPoints: 'DESC' },
      take: limit ?? 500,
    });

    const withPoints = users
      .map((u) => ({
        userId: u.id,
        nickname: u.nickname,
        profileImage: normalizeProfileImageForClient(u.profileImage ?? null),
        clanTag: u.clanTag ?? null,
        tournamentPoints: (u as any).tournamentPoints ?? 0,
      }))
      .filter((u) => u.tournamentPoints > 0);

    const sorted = withPoints.slice().sort((a, b) => b.tournamentPoints - a.tournamentPoints);
    const ranking: TournamentRankingEntry[] = [];
    const classOrderAsc = classes.slice().sort((a, b) => a.order - b.order);

    let index = 0;
    for (const cls of classOrderAsc) {
      const minPoints = cls.minPoints ?? 0;
      const maxPlayers = cls.maxPlayers ?? null;
      let count = 0;
      while (index < sorted.length) {
        const u = sorted[index];
        if (u.tournamentPoints < minPoints) break;
        if (maxPlayers != null && count >= maxPlayers) break;
        ranking.push({
          rank: ranking.length + 1,
          userId: u.userId,
          nickname: u.nickname,
          profileImage: normalizeProfileImageForClient(u.profileImage),
          clanTag: u.clanTag,
          tournamentPoints: u.tournamentPoints,
          className: cls.name,
          classOrder: cls.order,
        });
        count++;
        index++;
      }
    }

    return { classes, ranking };
  }
}
