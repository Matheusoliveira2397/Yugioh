import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Season } from './entities/season.entity';
import { SeasonRanking, Division } from './entities/season-ranking.entity';
import { User } from '../users/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SeasonsService implements OnModuleInit {
  constructor(
    @InjectRepository(Season)
    private seasonRepository: Repository<Season>,
    @InjectRepository(SeasonRanking)
    private rankingRepository: Repository<SeasonRanking>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    try {
      console.log('🔧 [SeasonsService] Verificando coluna divisionPrizes...');
      const divisionPrizesExists = await this.seasonRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'seasons' AND column_name = 'divisionPrizes'
      `);
      
      if (divisionPrizesExists.length === 0) {
        console.log('🔧 [SeasonsService] Adicionando coluna divisionPrizes...');
        await this.seasonRepository.query(`
          ALTER TABLE seasons 
          ADD COLUMN "divisionPrizes" JSONB NULL
        `);
        await this.seasonRepository.query(`
          COMMENT ON COLUMN seasons."divisionPrizes" IS 'Prêmios configuráveis para top 3 de cada divisão. Formato: { "Bronze": { "first": { "trophy": "...", "credits": 100 }, ... }, ... }'
        `);
        console.log('✅ [SeasonsService] Coluna divisionPrizes adicionada com sucesso');
      } else {
        console.log('✅ [SeasonsService] Coluna divisionPrizes já existe');
      }
    } catch (error: any) {
      console.error('⚠️ [SeasonsService] Erro ao verificar/criar coluna divisionPrizes:', error.message);
    }

    // Verificar e criar coluna division na tabela users se não existir
    try {
      console.log('🔧 [SeasonsService] Verificando coluna division na tabela users...');
      const divisionExists = await this.userRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'division'
      `);
      
      if (divisionExists.length === 0) {
        console.log('🔧 [SeasonsService] Adicionando coluna division na tabela users...');
        await this.userRepository.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'Bronze'
        `);
        await this.userRepository.query(`
          UPDATE users 
          SET division = 'Bronze' 
          WHERE division IS NULL OR division = ''
        `);
        await this.userRepository.query(`
          CREATE INDEX IF NOT EXISTS idx_users_division ON users(division)
        `);
        console.log('✅ [SeasonsService] Coluna division adicionada na tabela users com sucesso');
      } else {
        console.log('✅ [SeasonsService] Coluna division já existe na tabela users');
      }
    } catch (error: any) {
      console.error('⚠️ [SeasonsService] Erro ao verificar/criar coluna division na tabela users:', error.message);
    }
  }

  // Criar nova season
  async createSeason(durationInDays: number = 30): Promise<Season> {
    // Desativa season anterior
    await this.seasonRepository.update(
      { isActive: true },
      { isActive: false }
    );

    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    const lastSeasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.seasonNumber', 'seasonNumber')
      .orderBy('s.seasonNumber', 'DESC')
      .limit(1)
      .getRawOne()
      .catch(() => null);
    
    const lastSeason = lastSeasonRaw ? { seasonNumber: lastSeasonRaw.seasonNumber } : null;

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
      },
      divisionPrizes: undefined,
    } as unknown as Season) as Season;

    return this.seasonRepository.save(season);
  }

  // Buscar season ativa
  async getActiveSeason(): Promise<Season> {
    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    try {
      const seasonRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.name', 'name')
        .addSelect('s.seasonNumber', 'seasonNumber')
        .addSelect('s.startDate', 'startDate')
        .addSelect('s.endDate', 'endDate')
        .addSelect('s.isActive', 'isActive')
        .addSelect('s.prizes', 'prizes')
        .addSelect('s.divisionPrizes', 'divisionPrizes')
        .where('s.isActive = :isActive', { isActive: true })
        .getRawOne();
      
      if (!seasonRaw) {
        // Cria primeira season automaticamente
        return this.createSeason();
      }

      // Converter raw result para entidade Season
      const season = (this.seasonRepository.create({
        id: seasonRaw.id,
        name: seasonRaw.name,
        seasonNumber: seasonRaw.seasonNumber,
        startDate: seasonRaw.startDate,
        endDate: seasonRaw.endDate,
        isActive: seasonRaw.isActive,
        prizes: seasonRaw.prizes,
        divisionPrizes: seasonRaw.divisionPrizes || undefined,
      }) as unknown as Season) as Season;

      return season;
    } catch (error: any) {
      // Se divisionPrizes não existir, buscar sem essa coluna
      if (error.message?.includes('divisionPrizes')) {
        const seasonRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .addSelect('s.seasonNumber', 'seasonNumber')
          .addSelect('s.startDate', 'startDate')
          .addSelect('s.endDate', 'endDate')
          .addSelect('s.isActive', 'isActive')
          .addSelect('s.prizes', 'prizes')
          .where('s.isActive = :isActive', { isActive: true })
          .getRawOne();
        
        if (!seasonRaw) {
          return this.createSeason();
        }

        const season = (this.seasonRepository.create({
          id: seasonRaw.id,
          name: seasonRaw.name,
          seasonNumber: seasonRaw.seasonNumber,
          startDate: seasonRaw.startDate,
          endDate: seasonRaw.endDate,
          isActive: seasonRaw.isActive,
          prizes: seasonRaw.prizes,
          divisionPrizes: undefined,
        }) as unknown as Season) as Season;

        return season;
      }
      throw error;
    }
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

      // Criar novo ranking com valores iniciais - sempre começa no Bronze
      const ranking = this.rankingRepository.create({
        seasonId: season.id,
        userId,
        seasonScore: 0,
        wins: 0,
        losses: 0,
        division: Division.BRONZE, // Todo jogador começa no Bronze
        divisionPoints: 0,
        rank: 0
      });

      const savedRanking = await this.rankingRepository.save(ranking);
      console.log(`✅ [createUserRanking] Ranking criado para usuário ${userId} - divisão: ${savedRanking.division}`);
      
      // Garantir que o usuário tenha divisão 'Bronze' na tabela users
      try {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (user) {
          // Verificar se a coluna division existe antes de tentar acessá-la
          try {
            if (!user.division || user.division === '') {
              await this.userRepository.update(userId, { division: 'Bronze' });
              console.log(`✅ [createUserRanking] Divisão 'Bronze' definida para usuário ${userId} na tabela users`);
            }
          } catch (error: any) {
            // Se o erro for sobre coluna não existir, tentar criar a coluna
            if (error.message && error.message.includes('division') && error.message.includes('does not exist')) {
              console.warn(`⚠️ [createUserRanking] Coluna division não existe, será criada no próximo restart`);
            } else {
              console.error(`❌ [createUserRanking] Erro ao atualizar divisão do usuário ${userId}:`, error.message);
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ [createUserRanking] Erro ao buscar/atualizar usuário ${userId}:`, error.message);
      }
      
      return savedRanking;
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
      // Se não existe ranking, criar um novo - sempre começa no Bronze
      ranking = this.rankingRepository.create({
        seasonId: season.id,
        userId,
        seasonScore: 0,
        wins: 0,
        losses: 0,
        division: Division.BRONZE, // Todo jogador começa no Bronze
        divisionPoints: 0,
        rank: 0
      });
      console.log(`✅ [updateUserRanking] Ranking criado para usuário ${userId} - divisão: ${ranking.division}`);
    }

    ranking.seasonScore += scoreToAdd;
    
    if (win) {
      ranking.wins++;
    } else {
      ranking.losses++;
    }

    // Por enquanto, manter todos no Bronze
    // Futuramente, atualizar divisão baseado no score quando implementar sistema de promoção/rebaixamento
    // ranking.division = this.calculateDivision(ranking.seasonScore);
    // Por enquanto, garantir que está em Bronze
    if (ranking.division !== Division.BRONZE) {
      ranking.division = Division.BRONZE;
    }
    
    await this.rankingRepository.save(ranking);

    // Atualizar divisão do usuário na tabela users
    try {
      const userDivision = ranking.division === Division.BRONZE ? 'Bronze' :
                          ranking.division === Division.SILVER ? 'Silver' :
                          ranking.division === Division.GOLD ? 'Gold' :
                          ranking.division === Division.PLATINUM ? 'Platinum' :
                          ranking.division === Division.DIAMOND ? 'Diamond' :
                          ranking.division === Division.MASTER ? 'Master' :
                          ranking.division === Division.LEGENDARY ? 'Legendary' : 'Bronze';
      
      // Verificar se a coluna division existe antes de tentar atualizar
      const divisionExists = await this.rankingRepository.manager.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'division'
      `);
      
      if (divisionExists.length > 0) {
        // Usar query direta para atualizar a divisão do usuário
        await this.rankingRepository.manager.query(
          `UPDATE users SET division = $1 WHERE id = $2`,
          [userDivision, userId]
        );
      } else {
        console.warn(`⚠️ [updateUserRanking] Coluna division não existe na tabela users, será criada no próximo restart`);
      }
    } catch (error: any) {
      // Se o erro for sobre coluna não existir, apenas logar aviso
      if (error.message && error.message.includes('division') && error.message.includes('does not exist')) {
        console.warn(`⚠️ [updateUserRanking] Coluna division não existe, será criada no próximo restart`);
      } else {
        console.error(`❌ [updateUserRanking] Erro ao atualizar divisão do usuário ${userId}:`, error.message);
      }
    }

    // Recalcula ranks
    await this.recalculateRanks(season.id);

    return ranking;
  }

  // Calcular divisão baseada no score
  // Por enquanto, todos começam e permanecem no Bronze até implementar sistema de promoção/rebaixamento
  private calculateDivision(score: number): Division {
    // Por enquanto, todos ficam no Bronze
    return Division.BRONZE;
    // Código futuro para calcular divisão baseado no score:
    // if (score >= 5000) return Division.LEGENDARY;
    // if (score >= 4000) return Division.MASTER;
    // if (score >= 3000) return Division.DIAMOND;
    // if (score >= 2000) return Division.PLATINUM;
    // if (score >= 1000) return Division.GOLD;
    // if (score >= 500) return Division.SILVER;
    // return Division.BRONZE;
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
    let season: Season;
    if (seasonId) {
      // Usar QueryBuilder para evitar erro se divisionPrizes não existir
      const seasonRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .where('s.id = :id', { id: seasonId })
        .getRawOne();
      
      if (!seasonRaw) {
        throw new NotFoundException('Season não encontrada');
      }
      
      season = (this.seasonRepository.create({
        id: seasonRaw.id,
      }) as unknown as Season) as Season;
    } else {
      season = await this.getActiveSeason();
    }

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

  // Buscar ranking por divisão
  async getDivisionRanking(division: Division, seasonId?: string, limit: number = 100): Promise<SeasonRanking[]> {
    let season: Season;
    if (seasonId) {
      // Usar QueryBuilder para evitar erro se divisionPrizes não existir
      const seasonRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .where('s.id = :id', { id: seasonId })
        .getRawOne();
      
      if (!seasonRaw) {
        throw new NotFoundException('Season não encontrada');
      }
      
      season = (this.seasonRepository.create({
        id: seasonRaw.id,
      }) as unknown as Season) as Season;
    } else {
      season = await this.getActiveSeason();
    }

    if (!season) {
      throw new NotFoundException('Season não encontrada');
    }

    return this.rankingRepository.find({
      where: { seasonId: season.id, division },
      relations: ['user'],
      order: { seasonScore: 'DESC' },
      take: limit
    });
  }

  // Finalizar season e distribuir prêmios
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAndEndSeasons(): Promise<void> {
    const now = new Date();
    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    const seasonsToEndRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.endDate', 'endDate')
      .where('s.isActive = :isActive', { isActive: true })
      .getRawMany()
      .catch(() => {
        return this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.endDate', 'endDate')
          .where('s.isActive = :isActive', { isActive: true })
          .getRawMany();
      });

    for (const seasonRaw of seasonsToEndRaw) {
      const endDate = new Date(seasonRaw.endDate);
      if (endDate <= now) {
        await this.endSeason(seasonRaw.id);
      }
    }
  }

  async endSeason(seasonId: string): Promise<void> {
    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    let season: Season;
    try {
      const seasonRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.name', 'name')
        .addSelect('s.isActive', 'isActive')
        .addSelect('s.prizes', 'prizes')
        .addSelect('s.divisionPrizes', 'divisionPrizes')
        .where('s.id = :id', { id: seasonId })
        .getRawOne();
      
      if (!seasonRaw) {
        throw new NotFoundException('Season não encontrada');
      }

      season = (this.seasonRepository.create({
        id: seasonRaw.id,
        name: seasonRaw.name,
        isActive: seasonRaw.isActive,
        prizes: seasonRaw.prizes,
        divisionPrizes: seasonRaw.divisionPrizes || undefined,
      }) as unknown as Season) as Season;
    } catch (error: any) {
      // Se divisionPrizes não existir, buscar sem essa coluna
      if (error.message?.includes('divisionPrizes')) {
        const seasonRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .addSelect('s.isActive', 'isActive')
          .addSelect('s.prizes', 'prizes')
          .where('s.id = :id', { id: seasonId })
          .getRawOne();
        
        if (!seasonRaw) {
          throw new NotFoundException('Season não encontrada');
        }

        season = (this.seasonRepository.create({
          id: seasonRaw.id,
          name: seasonRaw.name,
          isActive: seasonRaw.isActive,
          prizes: seasonRaw.prizes,
          divisionPrizes: undefined,
        }) as unknown as Season) as Season;
      } else {
        throw error;
      }
    }

    if (!season) {
      throw new NotFoundException('Season não encontrada');
    }

    // Distribuir prêmios gerais (top 3 geral)
    const topRankings = await this.rankingRepository.find({
      where: { seasonId: season.id },
      order: { rank: 'ASC' },
      take: 3,
      relations: ['user']
    });

    if (season.prizes) {
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
    }

    // Distribuir prêmios por divisão (top 3 de cada divisão)
    if (season.divisionPrizes) {
      const divisions = Object.values(Division);
      
      for (const division of divisions) {
        const divisionPrizes = season.divisionPrizes[division];
        if (!divisionPrizes) continue;

        // Buscar top 3 da divisão
        const topDivisionRankings = await this.rankingRepository.find({
          where: { seasonId: season.id, division },
          order: { seasonScore: 'DESC' },
          take: 3,
          relations: ['user']
        });

        const divPrizes = [divisionPrizes.first, divisionPrizes.second, divisionPrizes.third];
        
        for (let i = 0; i < topDivisionRankings.length; i++) {
          const ranking = topDivisionRankings[i];
          const prize = divPrizes[i];

          // Adiciona troféu da divisão (concatena com troféu geral se existir)
          const divisionTrophy = `${division} ${prize.trophy}`;
          ranking.trophy = ranking.trophy 
            ? `${ranking.trophy} + ${divisionTrophy}` 
            : divisionTrophy;
          await this.rankingRepository.save(ranking);

          // Adiciona créditos ao usuário
          await this.userRepository.update(ranking.userId, {
            credits: () => `"credits" + ${prize.credits}`
          });
        }

        console.log(`✅ Prêmios da divisão ${division} distribuídos (${topDivisionRankings.length} jogadores)`);
      }
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
    let season: Season;
    if (seasonId) {
      // Usar QueryBuilder para evitar erro se divisionPrizes não existir
      const seasonRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .where('s.id = :id', { id: seasonId })
        .getRawOne();
      
      if (!seasonRaw) {
        throw new NotFoundException('Season não encontrada');
      }
      
      season = (this.seasonRepository.create({
        id: seasonRaw.id,
      }) as unknown as Season) as Season;
    } else {
      season = await this.getActiveSeason();
    }

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
    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    try {
      const seasonsRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.name', 'name')
        .addSelect('s.seasonNumber', 'seasonNumber')
        .addSelect('s.startDate', 'startDate')
        .addSelect('s.endDate', 'endDate')
        .addSelect('s.isActive', 'isActive')
        .addSelect('s.prizes', 'prizes')
        .addSelect('s.divisionPrizes', 'divisionPrizes')
        .addSelect('s.createdAt', 'createdAt')
        .addSelect('s.updatedAt', 'updatedAt')
        .orderBy('s.seasonNumber', 'DESC')
        .getRawMany();
      
      return seasonsRaw.map(raw => (this.seasonRepository.create({
        id: raw.id,
        name: raw.name,
        seasonNumber: raw.seasonNumber,
        startDate: raw.startDate,
        endDate: raw.endDate,
        isActive: raw.isActive,
        prizes: raw.prizes,
        divisionPrizes: raw.divisionPrizes || undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      }) as unknown as Season) as Season);
    } catch (error: any) {
      // Se divisionPrizes não existir, buscar sem essa coluna
      if (error.message?.includes('divisionPrizes')) {
        const seasonsRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .addSelect('s.seasonNumber', 'seasonNumber')
          .addSelect('s.startDate', 'startDate')
          .addSelect('s.endDate', 'endDate')
          .addSelect('s.isActive', 'isActive')
          .addSelect('s.prizes', 'prizes')
          .addSelect('s.createdAt', 'createdAt')
          .addSelect('s.updatedAt', 'updatedAt')
          .orderBy('s.seasonNumber', 'DESC')
          .getRawMany();
        
        return seasonsRaw.map(raw => (this.seasonRepository.create({
          id: raw.id,
          name: raw.name,
          seasonNumber: raw.seasonNumber,
          startDate: raw.startDate,
          endDate: raw.endDate,
          isActive: raw.isActive,
          prizes: raw.prizes,
          divisionPrizes: undefined,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        }) as unknown as Season) as Season);
      }
      throw error;
    }
  }

  // Buscar season por ID
  async getSeasonById(id: string): Promise<Season> {
    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    try {
      const seasonRaw = await this.seasonRepository
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.name', 'name')
        .addSelect('s.seasonNumber', 'seasonNumber')
        .addSelect('s.startDate', 'startDate')
        .addSelect('s.endDate', 'endDate')
        .addSelect('s.isActive', 'isActive')
        .addSelect('s.prizes', 'prizes')
        .addSelect('s.divisionPrizes', 'divisionPrizes')
        .addSelect('s.createdAt', 'createdAt')
        .addSelect('s.updatedAt', 'updatedAt')
        .where('s.id = :id', { id })
        .getRawOne();
      
      if (!seasonRaw) {
        throw new NotFoundException('Season não encontrada');
      }

      return (this.seasonRepository.create({
        id: seasonRaw.id,
        name: seasonRaw.name,
        seasonNumber: seasonRaw.seasonNumber,
        startDate: seasonRaw.startDate,
        endDate: seasonRaw.endDate,
        isActive: seasonRaw.isActive,
        prizes: seasonRaw.prizes,
        divisionPrizes: seasonRaw.divisionPrizes || undefined,
        createdAt: seasonRaw.createdAt,
        updatedAt: seasonRaw.updatedAt,
      }) as unknown as Season) as Season;
    } catch (error: any) {
      // Se divisionPrizes não existir, buscar sem essa coluna
      if (error.message?.includes('divisionPrizes')) {
        const seasonRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .addSelect('s.seasonNumber', 'seasonNumber')
          .addSelect('s.startDate', 'startDate')
          .addSelect('s.endDate', 'endDate')
          .addSelect('s.isActive', 'isActive')
          .addSelect('s.prizes', 'prizes')
          .addSelect('s.createdAt', 'createdAt')
          .addSelect('s.updatedAt', 'updatedAt')
          .where('s.id = :id', { id })
          .getRawOne();
        
        if (!seasonRaw) {
          throw new NotFoundException('Season não encontrada');
        }

        return (this.seasonRepository.create({
          id: seasonRaw.id,
          name: seasonRaw.name,
          seasonNumber: seasonRaw.seasonNumber,
          startDate: seasonRaw.startDate,
          endDate: seasonRaw.endDate,
          isActive: seasonRaw.isActive,
          prizes: seasonRaw.prizes,
          divisionPrizes: undefined,
          createdAt: seasonRaw.createdAt,
          updatedAt: seasonRaw.updatedAt,
        }) as unknown as Season) as Season;
      }
      throw error;
    }
  }

  // Criar season (admin)
  async createSeasonAdmin(createDto: {
    name: string;
    startDate: Date;
    endDate: Date;
    prizes?: {
      first: { trophy: string; credits: number };
      second: { trophy: string; credits: number };
      third: { trophy: string; credits: number };
    };
    divisionPrizes?: {
      [key: string]: {
        first: { trophy: string; credits: number };
        second: { trophy: string; credits: number };
        third: { trophy: string; credits: number };
      };
    };
  }): Promise<Season> {
    // Desativa season anterior se estiver ativa
    await this.seasonRepository.update(
      { isActive: true },
      { isActive: false }
    );

    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    const lastSeasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.seasonNumber', 'seasonNumber')
      .orderBy('s.seasonNumber', 'DESC')
      .limit(1)
      .getRawOne()
      .catch(() => null);
    
    const lastSeason = lastSeasonRaw ? { seasonNumber: lastSeasonRaw.seasonNumber } : null;

    const seasonNumber = lastSeason ? lastSeason.seasonNumber + 1 : 1;

    const season = (this.seasonRepository.create({
      name: createDto.name,
      seasonNumber,
      startDate: new Date(createDto.startDate),
      endDate: new Date(createDto.endDate),
      isActive: true,
      prizes: createDto.prizes || {
        first: { trophy: '🥇 Troféu Ouro', credits: 500 },
        second: { trophy: '🥈 Troféu Prata', credits: 250 },
        third: { trophy: '🥉 Troféu Bronze', credits: 100 },
      },
      divisionPrizes: createDto.divisionPrizes || undefined,
    }) as unknown as Season) as Season;

    return this.seasonRepository.save(season);
  }

  // Atualizar season (admin)
  async updateSeason(id: string, updateDto: {
    name?: string;
    startDate?: Date;
    endDate?: Date;
    isActive?: boolean;
    prizes?: {
      first: { trophy: string; credits: number };
      second: { trophy: string; credits: number };
      third: { trophy: string; credits: number };
    };
    divisionPrizes?: {
      [key: string]: {
        first: { trophy: string; credits: number };
        second: { trophy: string; credits: number };
        third: { trophy: string; credits: number };
      };
    };
  }): Promise<Season> {
    // Buscar season usando QueryBuilder para evitar erro se divisionPrizes não existir
    const seasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.name', 'name')
      .addSelect('s.seasonNumber', 'seasonNumber')
      .addSelect('s.startDate', 'startDate')
      .addSelect('s.endDate', 'endDate')
      .addSelect('s.isActive', 'isActive')
      .addSelect('s.prizes', 'prizes')
      .addSelect('s.divisionPrizes', 'divisionPrizes')
      .where('s.id = :id', { id })
      .getRawOne()
      .catch(() => {
        // Se divisionPrizes não existir, buscar sem essa coluna
        return this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .addSelect('s.seasonNumber', 'seasonNumber')
          .addSelect('s.startDate', 'startDate')
          .addSelect('s.endDate', 'endDate')
          .addSelect('s.isActive', 'isActive')
          .addSelect('s.prizes', 'prizes')
          .where('s.id = :id', { id })
          .getRawOne();
      });

    if (!seasonRaw) {
      throw new NotFoundException('Season não encontrada');
    }

    const season = (this.seasonRepository.create({
      id: seasonRaw.id,
      name: updateDto.name ?? seasonRaw.name,
      seasonNumber: seasonRaw.seasonNumber,
      startDate: updateDto.startDate ? new Date(updateDto.startDate) : seasonRaw.startDate,
      endDate: updateDto.endDate ? new Date(updateDto.endDate) : seasonRaw.endDate,
      isActive: updateDto.isActive !== undefined ? updateDto.isActive : seasonRaw.isActive,
      prizes: updateDto.prizes ?? seasonRaw.prizes,
      divisionPrizes: updateDto.divisionPrizes !== undefined ? updateDto.divisionPrizes : (seasonRaw.divisionPrizes || undefined),
    }) as unknown as Season) as Season;

    return this.seasonRepository.save(season);
  }

  // Deletar season (admin)
  async deleteSeason(id: string): Promise<void> {
    // Usar QueryBuilder para evitar erro se divisionPrizes não existir
    const seasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.isActive', 'isActive')
      .where('s.id = :id', { id })
      .getRawOne()
      .catch(() => {
        return this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.isActive', 'isActive')
          .where('s.id = :id', { id })
          .getRawOne();
      });

    if (!seasonRaw) {
      throw new NotFoundException('Season não encontrada');
    }

    // Não permitir deletar season ativa
    if (seasonRaw.isActive) {
      throw new Error('Não é possível deletar uma season ativa. Finalize-a primeiro.');
    }

    await this.seasonRepository.delete(id);
  }
}
