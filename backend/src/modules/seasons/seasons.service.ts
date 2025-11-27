import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Season } from './entities/season.entity';
import { SeasonRanking, Division } from './entities/season-ranking.entity';
import { User } from '../users/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SeasonsService {
  constructor(
    @InjectRepository(Season)
    private seasonRepository: Repository<Season>,
    @InjectRepository(SeasonRanking)
    private rankingRepository: Repository<SeasonRanking>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Criar nova season
  async createSeason(durationInDays: number = 30): Promise<Season> {
    // Desativa season anterior
    await this.seasonRepository.update(
      { isActive: true },
      { isActive: false }
    );

    const lastSeason = await this.seasonRepository.findOne({
      where: {},
      order: { seasonNumber: 'DESC' }
    });

    const seasonNumber = lastSeason ? lastSeason.seasonNumber + 1 : 1;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationInDays);

    const season = this.seasonRepository.create({
      name: `Season ${seasonNumber}`,
      seasonNumber,
      startDate,
      endDate,
      isActive: true,
      prizes: {
        first: { trophy: '🥇 Troféu Ouro', credits: 500 },
        second: { trophy: '🥈 Troféu Prata', credits: 250 },
        third: { trophy: '🥉 Troféu Bronze', credits: 100 },
      }
    });

    return this.seasonRepository.save(season);
  }

  // Buscar season ativa
  async getActiveSeason(): Promise<Season> {
    const season = await this.seasonRepository.findOne({
      where: { isActive: true },
      relations: ['rankings', 'rankings.user']
    });

    if (!season) {
      // Cria primeira season automaticamente
      return this.createSeason();
    }

    return season;
  }

  // Criar ranking inicial para um novo usuário
  async createUserRanking(userId: number): Promise<SeasonRanking | null> {
    try {
      const season = await this.getActiveSeason();
      
      // Verificar se já existe ranking para este usuário nesta season
      const existing = await this.rankingRepository.findOne({
        where: { seasonId: season.id, userId }
      });

      if (existing) {
        return existing;
      }

      // Criar novo ranking com valores iniciais
      const ranking = this.rankingRepository.create({
        seasonId: season.id,
        userId,
        seasonScore: 0,
        wins: 0,
        losses: 0,
        division: Division.BRONZE,
        divisionPoints: 0,
        rank: 0
      });

      return await this.rankingRepository.save(ranking);
    } catch (error) {
      // Se não houver season ativa, retorna null (não é erro crítico)
      console.warn('Não foi possível criar ranking da season para o usuário:', error.message);
      return null;
    }
  }

  // Atualizar ranking de um usuário
  async updateUserRanking(userId: number, scoreToAdd: number, win: boolean): Promise<SeasonRanking> {
    const season = await this.getActiveSeason();
    
    let ranking = await this.rankingRepository.findOne({
      where: { seasonId: season.id, userId }
    });

    if (!ranking) {
      ranking = this.rankingRepository.create({
        seasonId: season.id,
        userId,
        seasonScore: 0,
        wins: 0,
        losses: 0,
        division: Division.BRONZE,
        divisionPoints: 0,
        rank: 0
      });
    }

    ranking.seasonScore += scoreToAdd;
    
    if (win) {
      ranking.wins++;
    } else {
      ranking.losses++;
    }

    // Atualiza divisão baseado no score
    ranking.division = this.calculateDivision(ranking.seasonScore);
    
    await this.rankingRepository.save(ranking);

    // Atualiza score geral do usuário
    await this.userRepository.update(userId, {
      totalScore: () => `"totalScore" + ${scoreToAdd}`
    });

    // Recalcula ranks
    await this.recalculateRanks(season.id);

    return ranking;
  }

  // Calcular divisão baseada no score
  private calculateDivision(score: number): Division {
    if (score >= 5000) return Division.LEGENDARY;
    if (score >= 4000) return Division.MASTER;
    if (score >= 3000) return Division.DIAMOND;
    if (score >= 2000) return Division.PLATINUM;
    if (score >= 1000) return Division.GOLD;
    if (score >= 500) return Division.SILVER;
    return Division.BRONZE;
  }

  // Recalcular ranks de todos os usuários
  private async recalculateRanks(seasonId: string): Promise<void> {
    const rankings = await this.rankingRepository.find({
      where: { seasonId },
      order: { seasonScore: 'DESC' }
    });

    for (let i = 0; i < rankings.length; i++) {
      rankings[i].rank = i + 1;
    }

    await this.rankingRepository.save(rankings);
  }

  // Buscar ranking da season
  async getSeasonRanking(seasonId?: string, limit: number = 100): Promise<SeasonRanking[]> {
    const season = seasonId 
      ? await this.seasonRepository.findOne({ where: { id: seasonId } })
      : await this.getActiveSeason();

    if (!season) {
      throw new NotFoundException('Season não encontrada');
    }

    return this.rankingRepository.find({
      where: { seasonId: season.id },
      relations: ['user'],
      order: { rank: 'ASC' },
      take: limit
    });
  }

  // Finalizar season e distribuir prêmios
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAndEndSeasons(): Promise<void> {
    const now = new Date();
    const seasonsToEnd = await this.seasonRepository.find({
      where: { isActive: true }
    });

    for (const season of seasonsToEnd) {
      if (season.endDate <= now) {
        await this.endSeason(season.id);
      }
    }
  }

  async endSeason(seasonId: string): Promise<void> {
    const season = await this.seasonRepository.findOne({
      where: { id: seasonId },
      relations: ['rankings', 'rankings.user']
    });

    if (!season) {
      throw new NotFoundException('Season não encontrada');
    }

    // Busca top 3
    const topRankings = await this.rankingRepository.find({
      where: { seasonId: season.id },
      order: { rank: 'ASC' },
      take: 3,
      relations: ['user']
    });

    // Distribui prêmios
    const prizes = [season.prizes.first, season.prizes.second, season.prizes.third];
    
    for (let i = 0; i < topRankings.length; i++) {
      const ranking = topRankings[i];
      const prize = prizes[i];

      ranking.trophy = prize.trophy;
      await this.rankingRepository.save(ranking);

      // Adiciona créditos ao usuário
      await this.userRepository.update(ranking.userId, {
        credits: () => `"credits" + ${prize.credits}`
      });
    }

    // Desativa season
    season.isActive = false;
    await this.seasonRepository.save(season);

    console.log(`✅ Season ${season.name} finalizada! Prêmios distribuídos.`);

    // Cria nova season automaticamente
    await this.createSeason();
  }

  // Buscar ranking de um usuário específico
  async getUserRanking(userId: number, seasonId?: string): Promise<SeasonRanking> {
    const season = seasonId 
      ? await this.seasonRepository.findOne({ where: { id: seasonId } })
      : await this.getActiveSeason();

    if (!season) {
      throw new NotFoundException('Season não encontrada');
    }

    const ranking = await this.rankingRepository.findOne({
      where: { seasonId: season.id, userId },
      relations: ['user', 'season']
    });

    if (!ranking) {
      throw new NotFoundException('Ranking não encontrado');
    }

    return ranking;
  }

  // Listar todas as seasons
  async getAllSeasons(): Promise<Season[]> {
    return this.seasonRepository.find({
      order: { seasonNumber: 'DESC' }
    });
  }
}
