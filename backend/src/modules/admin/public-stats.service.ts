import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Season } from '../seasons/entities/season.entity';
import { User } from '../users/entities/user.entity';
import { Duel, DuelStatus } from '../duels/entities/duel.entity';
import { Tournament, TournamentStatus } from '../tournaments/entities/tournament.entity';
import { Card } from '../cards/entities/card.entity';

export interface PublicStatsDto {
  /** Número da season atual (ex: 3) */
  currentSeasonNumber: number;
  /** Data de término da season (ISO) */
  seasonEndsAt: string | null;
  /** Dias até terminar a season (null se não houver season ativa) */
  seasonEndsInDays: number | null;
  /** Total de duelistas (usuários) */
  totalDuelists: number;
  /** Total de duelos realizados (finalizados) */
  totalDuels: number;
  /** Torneios finalizados */
  tournamentsFinished: number;
  /** Cartas ativas cadastradas no jogo */
  cardsRegistered: number;
  /** Jogadores online agora */
  playersOnline: number;
  /** Máximo de jogadores online hoje (opcional, pode ser 0 se não rastreado) */
  maxOnlineToday: number;
  /** Máximo de jogadores online ontem (opcional) */
  maxOnlineYesterday: number;
}

@Injectable()
export class PublicStatsService {
  constructor(
    @InjectRepository(Season)
    private seasonRepo: Repository<Season>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Duel)
    private duelRepo: Repository<Duel>,
    @InjectRepository(Tournament)
    private tournamentRepo: Repository<Tournament>,
    @InjectRepository(Card)
    private cardRepo: Repository<Card>,
  ) {}

  async getStats(): Promise<PublicStatsDto> {
    const [
      activeSeason,
      totalDuelists,
      totalDuels,
      tournamentsFinished,
      cardsRegistered,
      playersOnline,
    ] = await Promise.all([
      this.seasonRepo.findOne({ where: { isActive: true }, order: { seasonNumber: 'DESC' } }),
      this.userRepo.count(),
      this.duelRepo.count({ where: { status: DuelStatus.FINISHED } }),
      this.tournamentRepo.count({ where: { status: TournamentStatus.FINISHED } }),
      this.cardRepo.count({ where: { isActive: true } }).catch(() => 0),
      this.userRepo.count({ where: { isOnline: true } }),
    ]);

    let seasonEndsAt: string | null = null;
    let seasonEndsInDays: number | null = null;
    const currentSeasonNumber = activeSeason?.seasonNumber ?? 0;

    if (activeSeason?.endDate) {
      seasonEndsAt = new Date(activeSeason.endDate).toISOString();
      const now = new Date();
      const end = new Date(activeSeason.endDate);
      const diffMs = end.getTime() - now.getTime();
      seasonEndsInDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      currentSeasonNumber,
      seasonEndsAt,
      seasonEndsInDays,
      totalDuelists,
      totalDuels,
      tournamentsFinished,
      cardsRegistered,
      playersOnline,
      maxOnlineToday: 0,
      maxOnlineYesterday: 0,
    };
  }
}
