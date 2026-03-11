import { Injectable, ConflictException, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { SeasonRanking, Division } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Group } from '../groups/entities/group.entity';
import { LevelsService } from '../levels/levels.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(SeasonRanking)
    private seasonRankingRepository: Repository<SeasonRanking>,
    @InjectRepository(Season)
    private seasonRepository: Repository<Season>,
    @InjectRepository(GroupMember)
    private groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(Group)
    private groupRepository: Repository<Group>,
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(DeckCard)
    private deckCardsRepository: Repository<DeckCard>,
    private levelsService: LevelsService,
    private mailService: MailService,
    private redisService: RedisService,
  ) {}

  async onModuleInit() {
    // Verificar e adicionar coluna emailVerificationToken se não existir
    try {
      console.log('🔧 [UsersService] Verificando coluna emailVerificationToken...');
      const tokenColumnExists = await this.usersRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'emailVerificationToken'
      `);
      
      if (tokenColumnExists.length === 0) {
        console.log('🔧 [UsersService] Adicionando coluna emailVerificationToken...');
        await this.usersRepository.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS "emailVerificationToken" VARCHAR(255) NULL
        `);
        console.log('✅ [UsersService] Coluna emailVerificationToken adicionada com sucesso');
      } else {
        console.log('✅ [UsersService] Coluna emailVerificationToken já existe');
      }

      // Marcar todos os usuários existentes como verificados (migração para usuários antigos)
      // Isso é necessário porque usuários criados antes da implementação de verificação de email
      // não têm email verificado, mas já estavam usando o sistema
      try {
        const unverifiedCount = await this.usersRepository.count({
          where: { isEmailVerified: false },
        });
        
        if (unverifiedCount > 0) {
          console.log(`🔧 [UsersService] Marcando ${unverifiedCount} usuários antigos como verificados...`);
          await this.usersRepository.update(
            { isEmailVerified: false },
            { isEmailVerified: true }
          );
          console.log(`✅ [UsersService] ${unverifiedCount} usuários antigos marcados como verificados`);
        }
      } catch (migrationError: any) {
        console.error('⚠️ [UsersService] Erro ao marcar usuários antigos como verificados:', migrationError.message);
      }
    } catch (error: any) {
      console.error('❌ [UsersService] Erro ao verificar/adicionar coluna emailVerificationToken:', error);
      // Não lançar erro para não impedir a inicialização do módulo
    }

    // Colunas de recuperação de senha
    try {
      const resetTokenExists = await this.usersRepository.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'passwordResetToken'
      `);
      if (resetTokenExists.length === 0) {
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordResetToken" VARCHAR(255) NULL`);
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMP NULL`);
        console.log('✅ [UsersService] Colunas de recuperação de senha adicionadas');
      }
    } catch (e: any) {
      console.warn('⚠️ [UsersService] Colunas passwordReset:', e?.message);
    }

    // Colunas de troca de email (confirmação no email atual)
    try {
      const colExists = await this.usersRepository.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'emailChangeToken'
      `);
      if (colExists.length === 0) {
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "pendingNewEmail" VARCHAR(255) NULL`);
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailChangeToken" VARCHAR(255) NULL`);
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailChangeExpiresAt" TIMESTAMP NULL`);
        console.log('✅ [UsersService] Colunas de troca de email adicionadas');
      }
    } catch (e: any) {
      console.warn('⚠️ [UsersService] Colunas emailChange:', e?.message);
    }

    // Coluna de abas permitidas para ADMIN (criados pelo Master)
    try {
      const colExists = await this.usersRepository.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'adminAllowedTabs'
      `);
      if (colExists.length === 0) {
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminAllowedTabs" JSONB NULL`);
        console.log('✅ [UsersService] Coluna adminAllowedTabs adicionada');
      }
    } catch (e: any) {
      console.warn('⚠️ [UsersService] Coluna adminAllowedTabs:', e?.message);
    }
  }

  // Helper para normalizar profileImage (retorna null se for imagem padrão inexistente)
  private normalizeProfileImage(profileImage: string | null | undefined): string | null {
    if (!profileImage) return null;
    if (profileImage.includes('/images/default') || profileImage.includes('/avatars/default')) {
      return null;
    }
    return profileImage;
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  /** Consulta mínima para validação JWT (evita timeout em carga alta). */
  async findByIdForAuth(id: number): Promise<(Pick<User, 'id' | 'username' | 'email' | 'role' | 'isBanned'> & { bannedUntil?: Date | null; banReason?: string | null }) | null> {
    return this.usersRepository.findOne({
      where: { id },
      select: ['id', 'username', 'email', 'role', 'isBanned', 'bannedUntil', 'banReason'],
    });
  }

  /** Verifica se o usuário está banido (considera bannedUntil: null = permanente, data passada = ban expirado). */
  isCurrentlyBanned(user: { isBanned: boolean; bannedUntil?: Date | null }): boolean {
    if (!user.isBanned) return false;
    const until = user.bannedUntil;
    if (until == null) return true;
    return new Date(until) > new Date();
  }

  /** Se o ban expirou (bannedUntil no passado), limpa isBanned/banReason/bannedUntil. */
  async clearExpiredBan(userId: number): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: ['id', 'isBanned', 'bannedUntil'] });
    if (!user || !user.isBanned) return;
    const until = user.bannedUntil;
    if (until != null && new Date(until) <= new Date()) {
      await this.usersRepository.update(userId, { isBanned: false, banReason: null, bannedUntil: null });
    }
  }

  async findById(id: number): Promise<User> {
    try {
      const user = await this.usersRepository.findOne({ 
        where: { id },
        select: [
          'id',
          'nickname',
          'username',
          'email',
          'password',
          'role',
          'winsGeral',
          'lossesGeral',
          'winsSeason',
          'lossesSeason',
          'credits',
          'cash',
          'level',
          'totalScore',
          'tournamentPoints',
          'profileImage',
          'isOnline',
          'isBanned',
          'banReason',
          'lastLogin',
          'lastIpAddress',
          'isEmailVerified',
          'clanTag',
          'biography',
          'playerClass',
          'division', // Divisão da tabela users
          'equippedPlaymatId',
          'equippedPlaymatImage',
          'equippedSkinId',
          'equippedSkinImage',
          'equippedDeckName',
          'createdAt',
          'updatedAt',
          'adminAllowedTabs',
        ]
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error: any) {
      // Se o erro for sobre coluna total_score não existir, tentar sem ela
      if (error.message && error.message.includes('total_score')) {
        console.warn(`⚠️ [findById] Coluna total_score não existe, buscando sem ela...`);
        const user = await this.usersRepository.findOne({ 
          where: { id },
        });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        // Adicionar totalScore como 0 se não existir
        (user as any).totalScore = 0;
        return user;
      }
      throw error;
    }
  }

  /** Retorna apenas campos seguros para exibir perfil de outro usuário (sem username, email, password, IP, etc.) */
  toPublicProfile(user: any): Record<string, unknown> {
    if (!user) return {};
    return {
      id: user.id,
      nickname: user.nickname,
      clanTag: user.clanTag ?? null,
      profileImage: this.normalizeProfileImage(user.profileImage),
      level: user.level ?? 1,
      winsGeral: user.winsGeral ?? 0,
      lossesGeral: user.lossesGeral ?? 0,
      winsSeason: user.winsSeason ?? 0,
      lossesSeason: user.lossesSeason ?? 0,
      totalScore: user.totalScore != null ? Number(user.totalScore) : 0,
      playerClass: user.playerClass ?? null,
      division: user.division ?? null,
      biography: user.biography ?? null,
      isOnline: user.isOnline ?? false,
      equippedPlaymatId: user.equippedPlaymatId ?? null,
      equippedPlaymatImage: user.equippedPlaymatImage ?? null,
      equippedSkinId: user.equippedSkinId ?? null,
      equippedSkinImage: user.equippedSkinImage ?? null,
    };
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { username },
      select: [
        'id',
        'nickname',
        'username',
        'email',
        'password',
        'role',
        'winsGeral',
        'lossesGeral',
        'winsSeason',
        'lossesSeason',
        'credits',
        'cash',
        'level',
        'totalScore',
        'profileImage',
        'isOnline',
        'isBanned',
        'banReason',
        'lastLogin',
        'lastIpAddress',
        'isEmailVerified',
        'clanTag',
        'biography',
        'playerClass',
        'division', // Divisão da tabela users
        'equippedPlaymatId',
        'equippedPlaymatImage',
        'equippedSkinId',
        'equippedSkinImage',
        'equippedDeckName',
        'createdAt',
        'updatedAt',
      ]
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { email },
      select: [
        'id',
        'nickname',
        'username',
        'email',
        'password',
        'role',
        'winsGeral',
        'lossesGeral',
        'winsSeason',
        'lossesSeason',
        'credits',
        'cash',
        'level',
        'totalScore',
        'profileImage',
        'isOnline',
        'isBanned',
        'banReason',
        'lastLogin',
        'lastIpAddress',
        'isEmailVerified',
        'clanTag',
        'biography',
        'playerClass',
        'division', // Divisão da tabela users
        'equippedPlaymatId',
        'equippedPlaymatImage',
        'equippedSkinId',
        'equippedSkinImage',
        'equippedDeckName',
        'createdAt',
        'updatedAt',
      ]
    });
  }

  async findByNickname(nickname: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { nickname },
      select: [
        'id',
        'nickname',
        'username',
        'email',
        'password',
        'role',
        'winsGeral',
        'lossesGeral',
        'winsSeason',
        'lossesSeason',
        'credits',
        'cash',
        'level',
        'totalScore',
        'profileImage',
        'isOnline',
        'isBanned',
        'banReason',
        'lastLogin',
        'lastIpAddress',
        'isEmailVerified',
        'clanTag',
        'biography',
        'playerClass',
        'division', // Divisão da tabela users
        'equippedPlaymatId',
        'equippedPlaymatImage',
        'equippedSkinId',
        'equippedSkinImage',
        'createdAt',
        'updatedAt',
      ]
    });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { emailVerificationToken: token },
    });
  }

  async verifyEmail(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      isEmailVerified: true,
    });
  }

  async updateVerificationToken(userId: number, token: string): Promise<void> {
    await this.usersRepository.update(userId, {
      emailVerificationToken: token,
    });
  }

  async clearVerificationToken(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      emailVerificationToken: null,
    });
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { passwordResetToken: token },
    });
  }

  async setPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await this.usersRepository.update(userId, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    });
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    });
  }

  async setPasswordByResetToken(userId: number, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(userId, {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'nickname', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'totalScore', 'level'],
      order: { totalScore: 'DESC', level: 'DESC' },
    });
  }

  async update(userId: number, stats: Partial<User>): Promise<void> {
    await this.usersRepository.update(userId, stats);
    
    // Se totalScore foi atualizado, recalcular nível
    if (stats.totalScore !== undefined) {
      await this.updateUserLevel(userId, stats.totalScore);
    }
  }

  /**
   * Atualiza o nível do usuário baseado no totalScore
   */
  async updateUserLevel(userId: number, totalScore?: number): Promise<void> {
    try {
      // Se totalScore não foi fornecido, buscar do banco
      if (totalScore === undefined) {
        const user = await this.usersRepository.findOne({
          where: { id: userId },
          select: ['id', 'totalScore', 'level'],
        });
        if (!user) {
          console.warn(`⚠️ [updateUserLevel] Usuário ${userId} não encontrado`);
          return;
        }
        totalScore = parseFloat(String(user.totalScore || 0));
      }

      console.log(`🔍 [updateUserLevel] Calculando nível para usuário ${userId} com totalScore: ${totalScore}`);

      // Calcular novo nível baseado no totalScore
      const newLevel = await this.levelsService.calculateLevel(totalScore);
      
      console.log(`🔍 [updateUserLevel] Nível calculado: ${newLevel} para totalScore: ${totalScore}`);
      
      // Buscar nível atual do usuário
      const user = await this.usersRepository.findOne({
        where: { id: userId },
        select: ['id', 'level'],
      });

      if (!user) {
        console.warn(`⚠️ [updateUserLevel] Usuário ${userId} não encontrado após calcular nível`);
        return;
      }

      const currentLevel = user.level || 1;
      console.log(`🔍 [updateUserLevel] Nível atual do usuário: ${currentLevel}, novo nível: ${newLevel}`);

      // Se o nível mudou, atualizar
      if (currentLevel !== newLevel) {
        // Usar SQL direto para garantir que a atualização funcione
        try {
          const updateResult = await this.usersRepository.query(
            `UPDATE users SET level = $1 WHERE id = $2 RETURNING id, level`,
            [newLevel, userId]
          );
          
          if (updateResult && updateResult.length > 0) {
            const updatedLevel = updateResult[0].level;
            console.log(`📈 [updateUserLevel] ✅ Usuário ${userId} atualizado via SQL: nível ${currentLevel} -> ${updatedLevel} (totalScore: ${totalScore})`);
            
            // Verificar se realmente foi atualizado
            const verifyUser = await this.usersRepository.findOne({
              where: { id: userId },
              select: ['id', 'level'],
            });
            
            if (verifyUser && verifyUser.level === newLevel) {
              console.log(`✅ [updateUserLevel] Verificação confirmada: nível ${newLevel} salvo no banco`);
            } else {
              console.error(`❌ [updateUserLevel] ERRO: Nível não foi salvo corretamente! Esperado: ${newLevel}, Encontrado: ${verifyUser?.level}`);
            }
          } else {
            console.error(`❌ [updateUserLevel] Nenhuma linha foi atualizada para o usuário ${userId}`);
            // Tentar método alternativo
            await this.usersRepository.update(userId, { level: newLevel });
          }
        } catch (sqlError: any) {
          console.error(`❌ [updateUserLevel] Erro ao atualizar via SQL:`, sqlError.message);
          // Fallback para método TypeORM
          try {
            await this.usersRepository.update(userId, { level: newLevel });
            console.log(`📈 [updateUserLevel] ✅ Atualizado via TypeORM fallback: nível ${currentLevel} -> ${newLevel}`);
          } catch (ormError: any) {
            console.error(`❌ [updateUserLevel] Erro ao atualizar via TypeORM:`, ormError.message);
          }
        }
      } else {
        console.log(`📊 [updateUserLevel] Nível do usuário ${userId} já está correto: ${currentLevel}`);
      }
    } catch (error: any) {
      console.error(`❌ [updateUserLevel] Erro ao atualizar nível do usuário ${userId}:`, error.message);
      console.error(`❌ [updateUserLevel] Stack:`, error.stack);
      // Não falhar se houver erro na atualização de nível
    }
  }

  async getUserById(userId: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id: userId } });
  }

  /**
   * Recalcula o nível de todos os usuários baseado no totalScore
   * Útil para migração ou correção de dados
   */
  async recalculateAllUsersLevels(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      console.log('🔄 [recalculateAllUsersLevels] Iniciando recálculo de níveis para todos os usuários...');
      
      // Buscar todos os usuários com totalScore
      const users = await this.usersRepository.find({
        select: ['id', 'totalScore', 'level'],
      });

      console.log(`📊 [recalculateAllUsersLevels] Encontrados ${users.length} usuários para processar`);

      for (const user of users) {
        try {
          const totalScore = parseFloat(String(user.totalScore || 0));
          const currentLevel = user.level || 1;
          
          // Calcular novo nível
          const newLevel = await this.levelsService.calculateLevel(totalScore);
          
          // Se o nível mudou, atualizar
          if (currentLevel !== newLevel) {
            await this.usersRepository.query(
              `UPDATE users SET level = $1 WHERE id = $2`,
              [newLevel, user.id]
            );
            updated++;
            console.log(`✅ [recalculateAllUsersLevels] Usuário ${user.id}: nível ${currentLevel} -> ${newLevel} (totalScore: ${totalScore})`);
          }
        } catch (error: any) {
          errors++;
          console.error(`❌ [recalculateAllUsersLevels] Erro ao processar usuário ${user.id}:`, error.message);
        }
      }

      console.log(`✅ [recalculateAllUsersLevels] Concluído: ${updated} atualizados, ${errors} erros`);
      return { updated, errors };
    } catch (error: any) {
      console.error(`❌ [recalculateAllUsersLevels] Erro geral:`, error.message);
      throw error;
    }
  }

  async updateStats(userId: number, stats: Partial<User>): Promise<User> {
    await this.usersRepository.update(userId, stats);
    return this.findById(userId);
  }

  async updateProfileImage(userId: number, profileImage: string): Promise<User> {
    await this.usersRepository.update(userId, { profileImage });
    return this.findById(userId);
  }

  // Método auxiliar para processar rankings de uma season
  private async processSeasonRankings(seasonId: string): Promise<any[]> {
    console.log(`🔍 [processSeasonRankings] Processando rankings para season ${seasonId}`);
    
    // Buscar TODOS os usuários primeiro
    const allUsers = await this.usersRepository
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.nickname', 'nickname')
      .addSelect('u.clanTag', 'clanTag')
      .addSelect('u.profileImage', 'profileImage')
      .addSelect('u.totalScore', 'totalScore')
      .addSelect('u.winsSeason', 'winsSeason')
      .addSelect('u.lossesSeason', 'lossesSeason')
      .addSelect('u.level', 'level')
      .getRawMany();

    console.log(`📊 [processSeasonRankings] Total de usuários encontrados: ${allUsers.length}`);

    if (allUsers.length === 0) {
      console.warn('⚠️ [processSeasonRankings] Nenhum usuário encontrado no sistema!');
      return [];
    }

    // Buscar rankings existentes da season
    const existingRankings = await this.seasonRankingRepository
      .createQueryBuilder('sr')
      .select('sr.userId', 'userId')
      .addSelect('sr.seasonScore', 'seasonScore')
      .addSelect('sr.wins', 'wins')
      .addSelect('sr.losses', 'losses')
      .addSelect('sr.division', 'division')
      .addSelect('sr.rank', 'rank')
      .where('sr.seasonId = :seasonId', { seasonId })
      .getRawMany();

    // Criar mapa de rankings existentes
    const rankingsMap = new Map(existingRankings.map(r => [r.userId, r]));

    // Criar rankings para usuários que não têm
    const usersWithoutRanking = allUsers.filter(u => !rankingsMap.has(u.id));
    if (usersWithoutRanking.length > 0) {
      console.log(`🔧 [processSeasonRankings] Criando rankings para ${usersWithoutRanking.length} usuários sem ranking...`);
      
      for (const user of usersWithoutRanking) {
        try {
          const newRanking = this.seasonRankingRepository.create({
            seasonId: seasonId,
            userId: user.id,
            seasonScore: 0,
            wins: 0,
            losses: 0,
            division: Division.BRONZE, // Todos começam no Bronze
            divisionPoints: 0,
            rank: 0
          });
          const savedRanking = await this.seasonRankingRepository.save(newRanking);
          console.log(`✅ [processSeasonRankings] Ranking criado para usuário ${user.id} (${user.nickname}) - divisão: ${savedRanking.division}`);
          
          // Adicionar ao mapa
          rankingsMap.set(user.id, {
            userId: user.id,
            seasonScore: 0,
            wins: 0,
            losses: 0,
            division: Division.BRONZE,
            rank: 0
          });
        } catch (error: any) {
          console.error(`❌ [processSeasonRankings] Erro ao criar ranking para usuário ${user.id}:`, error.message);
          console.error('❌ [processSeasonRankings] Stack trace:', error.stack);
        }
      }
    } else {
      console.log('✅ [processSeasonRankings] Todos os usuários já têm ranking');
    }

    // Buscar rankings atualizados (incluindo os recém-criados)
    const seasonRankings = await this.seasonRankingRepository
      .createQueryBuilder('sr')
      .select('sr.userId', 'userId')
      .addSelect('sr.seasonScore', 'seasonScore')
      .addSelect('sr.wins', 'wins')
      .addSelect('sr.losses', 'losses')
      .addSelect('sr.division', 'division')
      .addSelect('sr.rank', 'rank')
      .where('sr.seasonId = :seasonId', { seasonId })
      .orderBy('sr.seasonScore', 'DESC')
      .addOrderBy('sr.wins', 'DESC')
      .getRawMany();
    
    console.log(`📊 [processSeasonRankings] Rankings encontrados após criação: ${seasonRankings.length}`);
    if (seasonRankings.length > 0) {
      const sampleRankings = seasonRankings.slice(0, 5).map(sr => ({
        userId: sr.userId,
        division: sr.division,
        seasonScore: sr.seasonScore
      }));
      console.log(`📊 [processSeasonRankings] Amostra de rankings:`, sampleRankings);
    }

    // Buscar dados dos usuários que têm ranking
    const seasonUserIds = seasonRankings.map(sr => sr.userId);
    console.log(`📊 [processSeasonRankings] Buscando dados de ${seasonUserIds.length} usuários com ranking...`);
    
    if (seasonUserIds.length === 0) {
      console.warn('⚠️ [processSeasonRankings] Nenhum userId encontrado nos rankings!');
      return [];
    }
    
    const users = await this.usersRepository
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.nickname', 'nickname')
      .addSelect('u.clanTag', 'clanTag')
      .addSelect('u.profileImage', 'profileImage')
      .addSelect('u.totalScore', 'totalScore')
      .addSelect('u.winsSeason', 'winsSeason')
      .addSelect('u.lossesSeason', 'lossesSeason')
      .addSelect('u.level', 'level')
      .addSelect('u.division', 'division') // Incluir division da tabela users
      .where('u.id IN (:...userIds)', { userIds: seasonUserIds })
      .getRawMany();

    console.log(`📊 [processSeasonRankings] Dados de ${users.length} usuários encontrados`);
    
    if (users.length === 0) {
      console.warn('⚠️ [processSeasonRankings] Nenhum usuário encontrado para os rankings!');
      return [];
    }

    // Mapear usuários (query builder com alias retorna campos pelo nome do alias)
    const userMap = new Map(users.map(u => [u.id, {
      id: u.id,
      nickname: u.nickname,
      clanTag: u.clanTag,
      profileImage: u.profileImage,
      totalScore: u.totalScore || 0,
      winsSeason: u.winsSeason || 0,
      lossesSeason: u.lossesSeason || 0,
      level: u.level || 1,
      division: u.division || 'Bronze', // Division da tabela users
    }]));
    
    // Função auxiliar para calcular divisão baseada no score
    const calculateDivision = (score: number): string => {
      // Por enquanto, todos começam no Bronze
      // Futuramente, pode ser calculado baseado no score
      return 'Bronze';
      // Código futuro para calcular divisão:
      // if (score >= 5000) return 'Legendary';
      // if (score >= 4000) return 'Master';
      // if (score >= 3000) return 'Diamond';
      // if (score >= 2000) return 'Platinum';
      // if (score >= 1000) return 'Gold';
      // if (score >= 500) return 'Silver';
      // return 'Bronze';
    };
    
    const combinedRankings = seasonRankings.map((sr) => {
      const user = userMap.get(sr.userId);
      if (!user) return null;
      
      // Usar divisão da tabela users (user.division) - igual ao ranking geral
      const division = user.division || null;
      
      return {
        userId: sr.userId,
        user: {
          id: user.id,
          nickname: user.nickname,
          clanTag: user.clanTag,
          profileImage: this.normalizeProfileImage(user.profileImage),
          totalScore: user.totalScore,
          level: user.level,
        },
        seasonScore: sr.seasonScore || 0,
        wins: sr.wins || 0,
        losses: sr.losses || 0,
        division: division, // Usar divisão do usuário diretamente, igual ao ranking geral
        rank: sr.rank || 0,
      };
    }).filter(r => r !== null);

    // Recalcular ranks
    let currentRank = 1;
    let previousScore = -1;
    combinedRankings.forEach((ranking) => {
      if (ranking.seasonScore !== previousScore) {
        currentRank = combinedRankings.filter(r => r.seasonScore > ranking.seasonScore).length + 1;
        previousScore = ranking.seasonScore;
      }
      ranking.rank = currentRank;
    });

    // Buscar grupos
    const rankingUserIds = combinedRankings.map(r => r.userId);
    let groupMap = new Map();
    if (rankingUserIds.length > 0) {
      try {
        const groupMembers = await this.groupMemberRepository
          .createQueryBuilder('gm')
          .select('gm.userId', 'userId')
          .addSelect('gm.groupId', 'groupId')
          .where('gm.userId IN (:...userIds)', { userIds: rankingUserIds })
          .andWhere('gm.isActive = :isActive', { isActive: true })
          .getRawMany();
        
        const groupIds = [...new Set(groupMembers.map(gm => gm.groupId))];
        if (groupIds.length > 0) {
          const groups = await this.groupRepository
            .createQueryBuilder('g')
            .select('g.id', 'id')
            .addSelect('g.name', 'name')
            .addSelect('g.tag', 'tag')
            .addSelect('g.logo', 'logo')
            .addSelect('g.isActive', 'isActive')
            .where('g.id IN (:...groupIds)', { groupIds })
            .andWhere('g.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, logo: g.logo, isActive: g.isActive }]));
          groupMembers.forEach(gm => {
            const group = groupsMap.get(gm.groupId);
            if (group) {
              groupMap.set(gm.userId, group);
            }
          });
        }
      } catch (error) {
        console.error('❌ [processSeasonRankings] Erro ao carregar grupos:', error);
      }
    }

    // Formatar resultado - igual ao ranking geral
    const result = combinedRankings.map((ranking) => {
      const group = groupMap.get(ranking.userId);
      const clanTag = ranking.user.clanTag || (group && group.isActive ? group.tag : null);
      
      // Usar divisão do usuário diretamente, igual ao ranking geral
      const division = ranking.division;
      
      console.log(`🔍 [processSeasonRankings] Jogador ${ranking.user.nickname}: division=${division}, seasonScore=${ranking.seasonScore}`);
      
      return {
        id: String(ranking.user.id),
        nickname: ranking.user.nickname,
        clanTag: clanTag,
        profileImage: this.normalizeProfileImage(ranking.user.profileImage),
        seasonScore: ranking.seasonScore,
        totalScore: ranking.user.totalScore,
        wins: ranking.wins,
        losses: ranking.losses,
        division: division, // Usar divisão do usuário diretamente, igual ao ranking geral
        seasonRank: ranking.rank,
        level: ranking.user.level,
        group: group || null,
      };
    });
    
    console.log(`✅ [processSeasonRankings] Retornando ${result.length} rankings com divisões`);
    if (result.length > 0) {
      const divisions = result.map(r => r.division).filter((d, i, arr) => arr.indexOf(d) === i);
      console.log(`📊 [processSeasonRankings] Divisões únicas encontradas:`, divisions);
      
      // Contar por divisão
      const divisionCounts: { [key: string]: number } = {};
      result.forEach(r => {
        const div = r.division || 'Bronze';
        divisionCounts[div] = (divisionCounts[div] || 0) + 1;
      });
      console.log(`📊 [processSeasonRankings] Contagem por divisão:`, divisionCounts);
      
      // Mostrar primeiros 5 jogadores
      console.log(`📊 [processSeasonRankings] Primeiros 5 jogadores:`, result.slice(0, 5).map(r => ({
        nickname: r.nickname,
        division: r.division,
        seasonScore: r.seasonScore
      })));
    } else {
      console.warn('⚠️ [processSeasonRankings] NENHUM resultado retornado!');
    }
    
    return result;
  }

  async getSeasonRanking(seasonId?: string): Promise<any[]> {
    try {
      console.log('🔍 [getSeasonRanking] Iniciando busca de ranking da season...', seasonId ? `seasonId=${seasonId}` : '');
      
      let seasonToUse: { id: string; name: string; isActive?: boolean } | null = null;

      // Se seasonId foi informado, buscar essa season
      if (seasonId && seasonId.trim()) {
        const byIdRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .addSelect('s.isActive', 'isActive')
          .where('s.id = :id', { id: seasonId.trim() })
          .getRawOne();
        if (byIdRaw) {
          seasonToUse = { id: byIdRaw.id, name: byIdRaw.name, isActive: byIdRaw.isActive };
          console.log('🔍 [getSeasonRanking] Usando season informada:', seasonToUse);
        }
      }

      // Se não tem season por id, usar season ativa
      if (!seasonToUse) {
        const activeSeasonRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .select('s.name', 'name')
          .select('s.isActive', 'isActive')
          .where('s.isActive = :isActive', { isActive: true })
          .getRawOne();
        
        const activeSeason = activeSeasonRaw ? { id: activeSeasonRaw.id, name: activeSeasonRaw.name, isActive: activeSeasonRaw.isActive } : null;
        console.log('🔍 [getSeasonRanking] Season ativa encontrada:', activeSeason);
        seasonToUse = activeSeason;
      }

      // Se não há season ativa, buscar a mais recente
      if (!seasonToUse || !seasonToUse.id) {
        console.warn('⚠️ [getSeasonRanking] Nenhuma season ativa encontrada. Buscando season mais recente...');
        
        const latestSeasonRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .select('s.name', 'name')
          .select('s.isActive', 'isActive')
          .orderBy('s.createdAt', 'DESC')
          .limit(1)
          .getRawOne();
        
        if (latestSeasonRaw) {
          seasonToUse = { id: latestSeasonRaw.id, name: latestSeasonRaw.name, isActive: latestSeasonRaw.isActive };
          console.log('🔍 [getSeasonRanking] Usando season mais recente:', seasonToUse);
        } else {
          console.warn('⚠️ [getSeasonRanking] Nenhuma season encontrada no banco. Criando season temporária...');
          
          try {
            const newSeason = this.seasonRepository.create({
              name: 'Season Temporária',
              isActive: true,
              startDate: new Date(),
              endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 dias
            });
            const savedSeason = await this.seasonRepository.save(newSeason);
            seasonToUse = { id: savedSeason.id, name: savedSeason.name, isActive: savedSeason.isActive };
            console.log('✅ [getSeasonRanking] Season temporária criada:', seasonToUse);
          } catch (error: any) {
            console.error('❌ [getSeasonRanking] Erro ao criar season temporária:', error.message);
            console.warn('⚠️ [getSeasonRanking] Tentando retornar usuários sem season...');
            return await this.getUsersWithoutSeason();
          }
        }
      }

      if (!seasonToUse || !seasonToUse.id) {
        console.warn('⚠️ [getSeasonRanking] Nenhuma season disponível. Retornando usuários sem season...');
        return await this.getUsersWithoutSeason();
      }

      // Processar rankings da season (cria rankings para usuários que não têm)
      let result = await this.processSeasonRankings(seasonToUse.id);
      console.log(`✅ [getSeasonRanking] Retornando ${result.length} jogadores no ranking da season ${seasonToUse.id}`);
      
      // Se não retornou nenhum resultado, verificar se há usuários e retornar fallback
      if (result.length === 0) {
        console.warn('⚠️ [getSeasonRanking] Nenhum jogador retornado. Verificando se há usuários no sistema...');
        const userCount = await this.usersRepository.count();
        console.log(`📊 [getSeasonRanking] Total de usuários no sistema: ${userCount}`);
        
        if (userCount > 0) {
          console.warn('⚠️ [getSeasonRanking] Há usuários no sistema mas nenhum ranking retornado. Retornando usuários básicos...');
          result = await this.getUsersWithoutSeason();
          console.log(`✅ [getSeasonRanking] Fallback retornou ${result.length} jogadores`);
        }
      }

      // Incluir seasonId e seasonName em cada item para a coluna Season no frontend
      result = result.map((r: any) => ({
        ...r,
        seasonId: seasonToUse?.id ?? null,
        seasonName: seasonToUse?.name ?? '-',
      }));

      console.log(`✅ [getSeasonRanking] Retornando ${result.length} jogadores para o frontend`);
      return result;
    } catch (error) {
      console.error('❌ [getSeasonRanking] Erro ao buscar ranking da season:', error);
      console.error('❌ [getSeasonRanking] Stack:', error.stack);
      // Em caso de erro, tentar retornar usuários básicos
      try {
        return await this.getUsersWithoutSeason();
      } catch (fallbackError) {
        console.error('❌ [getSeasonRanking] Erro no fallback:', fallbackError);
        return [];
      }
    }
  }

  // Método auxiliar para retornar usuários mesmo sem season
  private async getUsersWithoutSeason(): Promise<any[]> {
    console.log('🔍 [getUsersWithoutSeason] Buscando usuários sem season...');
    
    const users = await this.usersRepository
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.nickname', 'nickname')
      .addSelect('u.clanTag', 'clanTag')
      .addSelect('u.profileImage', 'profileImage')
      .addSelect('u.totalScore', 'totalScore')
      .addSelect('u.winsSeason', 'winsSeason')
      .addSelect('u.lossesSeason', 'lossesSeason')
      .addSelect('u.level', 'level')
      .addSelect('u.division', 'division')
      .orderBy('u.totalScore', 'DESC')
      .addOrderBy('u.level', 'DESC')
      .getRawMany();

    if (users.length === 0) {
      console.warn('⚠️ [getUsersWithoutSeason] Nenhum usuário encontrado');
      return [];
    }

    // Buscar grupos
    const userIds = users.map(u => u.id);
    let groupMap = new Map();
    
    if (userIds.length > 0) {
      try {
        const groupMembers = await this.groupMemberRepository
          .createQueryBuilder('gm')
          .select('gm.userId', 'userId')
          .addSelect('gm.groupId', 'groupId')
          .where('gm.userId IN (:...userIds)', { userIds })
          .andWhere('gm.isActive = :isActive', { isActive: true })
          .getRawMany();
        
        const groupIds = [...new Set(groupMembers.map(gm => gm.groupId))];
        if (groupIds.length > 0) {
          const groups = await this.groupRepository
            .createQueryBuilder('g')
            .select('g.id', 'id')
            .addSelect('g.name', 'name')
            .addSelect('g.tag', 'tag')
            .addSelect('g.logo', 'logo')
            .addSelect('g.isActive', 'isActive')
            .where('g.id IN (:...groupIds)', { groupIds })
            .andWhere('g.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, logo: g.logo, isActive: g.isActive }]));
          groupMembers.forEach(gm => {
            const group = groupsMap.get(gm.groupId);
            if (group) {
              groupMap.set(gm.userId, group);
            }
          });
        }
      } catch (error) {
        console.error('❌ [getUsersWithoutSeason] Erro ao carregar grupos:', error);
      }
    }

    // Formatar resultado similar ao ranking da season
    const result = users.map((user, index) => {
      const group = groupMap.get(user.id);
      const clanTag = user.clanTag || (group && group.isActive ? group.tag : null);
      
      return {
        id: String(user.id),
        nickname: user.nickname,
        clanTag: clanTag,
        profileImage: this.normalizeProfileImage(user.profileImage),
        seasonScore: 0,
        totalScore: user.totalScore || 0,
        wins: user.winsSeason || 0,
        losses: user.lossesSeason || 0,
        division: user.division || 'Bronze',
        seasonRank: index + 1,
        level: user.level || 1,
        group: group || null,
        seasonId: null,
        seasonName: '-',
      };
    });

    console.log(`✅ [getUsersWithoutSeason] Retornando ${result.length} usuários`);
    return result;
  }

  // Buscar ranking de season por divisão (usando division da tabela users)
  async getSeasonRankingByDivision(division: string, seasonId?: string): Promise<any[]> {
    try {
      console.log(`🔍 [getSeasonRankingByDivision] Buscando ranking da season para divisão: ${division}`, seasonId ? `seasonId=${seasonId}` : '');
      
      // Normalizar divisão
      const divisionUpper = division.trim().toUpperCase();
      let normalizedDivision = 'Bronze';
      
      if (divisionUpper === 'BRONZE') normalizedDivision = 'Bronze';
      else if (divisionUpper === 'SILVER' || divisionUpper === 'PRATA') normalizedDivision = 'Silver';
      else if (divisionUpper === 'GOLD' || divisionUpper === 'OURO') normalizedDivision = 'Gold';
      else if (divisionUpper === 'PLATINUM') normalizedDivision = 'Platinum';
      else if (divisionUpper === 'DIAMOND' || divisionUpper === 'DIAMANTE') normalizedDivision = 'Diamond';
      else if (divisionUpper === 'MASTER' || divisionUpper === 'MESTRE') normalizedDivision = 'Master';
      else if (divisionUpper === 'LEGENDARY' || divisionUpper === 'DESAFIANTE') normalizedDivision = 'Legendary';
      
      console.log(`🔍 [getSeasonRankingByDivision] Divisão normalizada: ${normalizedDivision}`);
      
      let seasonToUse: { id: string; name: string } | null = null;

      // Se seasonId foi informado, buscar essa season
      if (seasonId && seasonId.trim()) {
        const byIdRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .where('s.id = :id', { id: seasonId.trim() })
          .getRawOne();
        if (byIdRaw) seasonToUse = { id: byIdRaw.id, name: byIdRaw.name };
      }

      // Se não tem season por id, usar season ativa
      if (!seasonToUse) {
        const activeSeasonRaw = await this.seasonRepository
          .createQueryBuilder('s')
          .select('s.id', 'id')
          .addSelect('s.name', 'name')
          .where('s.isActive = :isActive', { isActive: true })
          .getRawOne();
        if (activeSeasonRaw) seasonToUse = { id: activeSeasonRaw.id, name: activeSeasonRaw.name };
      }
      
      if (!seasonToUse || !seasonToUse.id) {
        console.warn('⚠️ [getSeasonRankingByDivision] Nenhuma season ativa encontrada');
        return [];
      }
      
      // Criar lista de possíveis valores da divisão para comparação
      const possibleDivisionValues: string[] = [normalizedDivision];
      if (normalizedDivision === 'Silver') possibleDivisionValues.push('Prata', 'PRATA', 'SILVER');
      if (normalizedDivision === 'Gold') possibleDivisionValues.push('Ouro', 'OURO', 'GOLD');
      if (normalizedDivision === 'Diamond') possibleDivisionValues.push('Diamante', 'DIAMANTE', 'DIAMOND');
      if (normalizedDivision === 'Master') possibleDivisionValues.push('Mestre', 'MESTRE', 'MASTER');
      if (normalizedDivision === 'Legendary') possibleDivisionValues.push('Desafiante', 'DESAFIANTE', 'LEGENDARY');
      
      console.log(`🔍 [getSeasonRankingByDivision] Valores possíveis para divisão ${normalizedDivision}:`, possibleDivisionValues);
      
      // Debug: Verificar quais divisões existem no banco
      const allDivisions = await this.usersRepository
        .createQueryBuilder('u')
        .select('DISTINCT UPPER(TRIM(COALESCE(u.division, \'Bronze\')))', 'division')
        .getRawMany();
      console.log(`🔍 [getSeasonRankingByDivision] Divisões encontradas no banco:`, allDivisions.map(d => d.division));
      
      // Buscar rankings da season com join em users para filtrar por division
      // Buscar todos os rankings primeiro e filtrar depois (mais simples e confiável)
      const allRankings = await this.seasonRankingRepository
        .createQueryBuilder('sr')
        .innerJoin('sr.user', 'u')
        .select('sr.userId', 'userId')
        .addSelect('sr.seasonScore', 'seasonScore')
        .addSelect('sr.wins', 'wins')
        .addSelect('sr.losses', 'losses')
        .addSelect('sr.rank', 'rank')
        .addSelect('u.id', 'user_id')
        .addSelect('u.nickname', 'user_nickname')
        .addSelect('u.clanTag', 'user_clanTag')
        .addSelect('u.profileImage', 'user_profileImage')
        .addSelect('u.totalScore', 'user_totalScore')
        .addSelect('u.level', 'user_level')
        .addSelect('u.division', 'user_division')
        .where('sr.seasonId = :seasonId', { seasonId: seasonToUse.id })
        .orderBy('sr.seasonScore', 'DESC')
        .addOrderBy('sr.wins', 'DESC')
        .getRawMany();
      
      // Filtrar por divisão em memória - usar mesma lógica do ranking geral
      const rankings = allRankings.filter(r => {
        // Pegar divisão do usuário (pode ser null, undefined, ou string)
        const userDivisionRaw = r.user_division;
        
        // Se for null/undefined, tratar como Bronze (igual ao ranking geral)
        if (!userDivisionRaw || userDivisionRaw === null || userDivisionRaw === undefined || userDivisionRaw === '') {
          // Se o filtro é Bronze, incluir usuários sem divisão
          return normalizedDivision === 'Bronze';
        }
        
        // Normalizar divisão do usuário (igual ao ranking geral)
        let userDivision = String(userDivisionRaw).trim();
        const userDivisionUpper = userDivision.toUpperCase();
        
        // Normalizar para formato padrão (igual ao ranking geral)
        if (userDivisionUpper === 'BRONZE' || userDivisionUpper === '') userDivision = 'Bronze';
        else if (userDivisionUpper === 'SILVER' || userDivisionUpper === 'PRATA') userDivision = 'Silver';
        else if (userDivisionUpper === 'GOLD' || userDivisionUpper === 'OURO') userDivision = 'Gold';
        else if (userDivisionUpper === 'PLATINUM') userDivision = 'Platinum';
        else if (userDivisionUpper === 'DIAMOND' || userDivisionUpper === 'DIAMANTE') userDivision = 'Diamond';
        else if (userDivisionUpper === 'MASTER' || userDivisionUpper === 'MESTRE') userDivision = 'Master';
        else if (userDivisionUpper === 'LEGENDARY' || userDivisionUpper === 'DESAFIANTE') userDivision = 'Legendary';
        else userDivision = 'Bronze'; // Fallback
        
        // Comparar divisões normalizadas (igual ao ranking geral)
        return userDivision === normalizedDivision;
      });
      
      console.log(`📊 [getSeasonRankingByDivision] Encontrados ${rankings.length} rankings para divisão ${normalizedDivision}`);
      if (rankings.length > 0) {
        const sampleDivisions = [...new Set(rankings.slice(0, 5).map(r => r.user_division))];
        console.log(`📊 [getSeasonRankingByDivision] Amostra de divisões encontradas:`, sampleDivisions);
      }
      
      if (rankings.length === 0) {
        return [];
      }
      
      // Buscar grupos
      const userIds = rankings.map(r => r.userId);
      let groupMap = new Map();
      
      if (userIds.length > 0) {
        try {
          const groupMembers = await this.groupMemberRepository
            .createQueryBuilder('gm')
            .select('gm.userId', 'userId')
            .addSelect('gm.groupId', 'groupId')
            .where('gm.userId IN (:...userIds)', { userIds })
            .andWhere('gm.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupIds = [...new Set(groupMembers.map(gm => gm.groupId))];
          if (groupIds.length > 0) {
            const groups = await this.groupRepository
              .createQueryBuilder('g')
              .select('g.id', 'id')
              .addSelect('g.name', 'name')
              .addSelect('g.tag', 'tag')
              .addSelect('g.logo', 'logo')
              .addSelect('g.isActive', 'isActive')
              .where('g.id IN (:...groupIds)', { groupIds })
              .andWhere('g.isActive = :isActive', { isActive: true })
              .getRawMany();
            
            const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, logo: g.logo, isActive: g.isActive }]));
            groupMembers.forEach(gm => {
              const group = groupsMap.get(gm.groupId);
              if (group) {
                groupMap.set(gm.userId, group);
              }
            });
          }
        } catch (error) {
          console.error('❌ [getSeasonRankingByDivision] Erro ao carregar grupos:', error);
        }
      }
      
      // Formatar resultado - igual ao ranking geral, com seasonId e seasonName
      const result = rankings.map((r, index) => {
        const group = groupMap.get(r.userId);
        const clanTag = r.user_clanTag || (group && group.isActive ? group.tag : null);
        
        // Usar divisão do usuário diretamente, igual ao ranking geral
        const division = r.user_division;
        
        return {
          id: String(r.userId),
          nickname: r.user_nickname,
          clanTag: clanTag,
          profileImage: this.normalizeProfileImage(r.user_profileImage),
          seasonScore: r.seasonScore || 0,
          totalScore: r.user_totalScore || 0,
          wins: r.wins || 0,
          losses: r.losses || 0,
          division: division,
          seasonRank: index + 1,
          level: r.user_level || 1,
          group: group || null,
          seasonId: seasonToUse.id,
          seasonName: seasonToUse.name,
        };
      });
      
      console.log(`✅ [getSeasonRankingByDivision] Retornando ${result.length} jogadores para divisão ${normalizedDivision}`);
      return result;
    } catch (error) {
      console.error('❌ [getSeasonRankingByDivision] Erro ao buscar ranking por divisão:', error);
      return [];
    }
  }

  async getGeneralRanking(): Promise<any[]> {
    const users = await this.usersRepository.find({
      select: ['id', 'nickname', 'clanTag', 'profileImage', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'totalScore', 'level', 'division'],
      order: { totalScore: 'DESC', level: 'DESC' }, // Ordenar primeiro por totalScore, depois por level
      take: 100,
    });

    // Busca os dados da season ativa para cada usuário (usar QueryBuilder para evitar erro se divisionPrizes não existir)
    const activeSeasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.isActive = :isActive', { isActive: true })
      .getRawOne();
    
    const activeSeason = activeSeasonRaw ? { id: activeSeasonRaw.id } : null;

    // Busca os grupos dos usuários - usar QueryBuilder para evitar problemas
    const userIds = users.map(u => u.id);
    let groupMap = new Map();
    
    if (userIds.length > 0) {
      try {
        const groupMembers = await this.groupMemberRepository
          .createQueryBuilder('gm')
          .select('gm.userId', 'userId')
          .addSelect('gm.groupId', 'groupId')
          .where('gm.userId IN (:...userIds)', { userIds })
          .getRawMany();
        
        const groupIds = [...new Set(groupMembers.map(gm => gm.groupId))];
        if (groupIds.length > 0) {
          const groups = await this.groupRepository
            .createQueryBuilder('g')
            .select('g.id', 'id')
            .addSelect('g.name', 'name')
            .addSelect('g.tag', 'tag')
            .addSelect('g.logo', 'logo')
            .addSelect('g.isActive', 'isActive')
            .where('g.id IN (:...groupIds)', { groupIds })
            .andWhere('g.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, logo: g.logo, isActive: g.isActive }]));
          groupMembers.forEach(gm => {
            const group = groupsMap.get(gm.groupId);
            if (group) {
              groupMap.set(gm.userId, group);
            }
          });
        }
      } catch (error) {
        console.error('❌ [getGeneralRanking] Erro ao carregar grupos:', error);
        groupMap = new Map();
      }
    }

    if (!activeSeason) {
      // Ordenar por totalScore (descendente), depois por level (descendente)
      const sortedUsers = [...users].sort((a, b) => {
        const scoreA = a.totalScore || 0;
        const scoreB = b.totalScore || 0;
        if (scoreB !== scoreA) {
          return scoreB - scoreA; // Ordenar por totalScore primeiro
        }
        return (b.level || 1) - (a.level || 1); // Se totalScore igual, ordenar por level
      });

      return sortedUsers.map((user, index) => {
        const group = groupMap.get(user.id);
        return {
          id: String(user.id),
          nickname: user.nickname,
          clanTag: user.clanTag || (group && group.isActive ? group.tag : null),
          profileImage: this.normalizeProfileImage(user.profileImage),
          seasonScore: 0,
          totalScore: user.totalScore || 0,
          wins: user.winsGeral ?? 0,
          losses: user.lossesGeral ?? 0,
          division: user.division || 'Bronze',
          globalRank: index + 1,
          group: group || null,
        };
      });
    }

    if (!activeSeason || !activeSeason.id) {
      return users.map(user => {
        const group = groupMap.get(user.id);
        return {
          id: String(user.id),
          nickname: user.nickname,
          clanTag: user.clanTag || (group && group.isActive ? group.tag : null),
          profileImage: this.normalizeProfileImage(user.profileImage),
          seasonScore: 0,
          totalScore: user.totalScore || 0,
          wins: user.winsGeral ?? 0,
          losses: user.lossesGeral ?? 0,
          division: user.division || 'Bronze',
          globalRank: 0,
          group: group || null,
        };
      });
    }

    const rankings = await this.seasonRankingRepository.find({
      where: { seasonId: activeSeason.id },
      relations: ['user'],
      select: {
        id: true,
        seasonId: true,
        userId: true,
        seasonScore: true,
        wins: true,
        losses: true,
        rank: true,
        division: true,
        user: {
          id: true,
          nickname: true,
          clanTag: true,
          profileImage: true,
          totalScore: true,
          level: true,
        },
      },
    });

    const rankingMap = new Map(rankings.map(r => [r.userId, r]));

    // Ordenar por totalScore (descendente), depois por level (descendente)
    const sortedUsers = [...users].sort((a, b) => {
      const scoreA = a.totalScore || 0;
      const scoreB = b.totalScore || 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA; // Ordenar por totalScore primeiro
      }
      return (b.level || 1) - (a.level || 1); // Se totalScore igual, ordenar por level
    });

    return sortedUsers.map((user, index) => {
      const seasonRanking = rankingMap.get(user.id);
      const group = groupMap.get(user.id);
      const clanTag = user.clanTag || (group && group.isActive ? group.tag : null);
      return {
        id: String(user.id),
        nickname: user.nickname,
        clanTag: clanTag,
        profileImage: user.profileImage,
        seasonScore: seasonRanking?.seasonScore || 0,
        totalScore: user.totalScore || 0,
        level: user.level || 1,
        wins: user.winsGeral ?? 0,
        losses: user.lossesGeral ?? 0,
        division: user.division || null,
        globalRank: index + 1,
        group: group || null,
      };
    });
  }

  // Método removido - sistema de coins foi desativado

  async getTop5Players(): Promise<any[]> {
    // Busca a season ativa (usar QueryBuilder para evitar erro se divisionPrizes não existir)
    const activeSeasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .select('s.name', 'name')
      .select('s.isActive', 'isActive')
      .where('s.isActive = :isActive', { isActive: true })
      .getRawOne();
    
    const activeSeason = activeSeasonRaw ? { id: activeSeasonRaw.id, name: activeSeasonRaw.name, isActive: activeSeasonRaw.isActive } : null;

    if (!activeSeason) {
      // Se não há season ativa, retorna top 5 por totalScore e level - usar QueryBuilder para evitar JOINs
      const users = await this.usersRepository
        .createQueryBuilder('u')
        .select('u.id', 'id')
        .addSelect('u.nickname', 'nickname')
        .addSelect('u.clanTag', 'clanTag')
        .addSelect('u.profileImage', 'profileImage')
        .addSelect('u.winsGeral', 'winsGeral')
        .addSelect('u.lossesGeral', 'lossesGeral')
        .addSelect('u.totalScore', 'totalScore')
        .addSelect('u.level', 'level')
        .orderBy('u.totalScore', 'DESC')
        .addOrderBy('u.level', 'DESC')
        .limit(5)
        .getRawMany();

      // Busca os grupos dos usuários - carregar separadamente para evitar problemas
      const userIds = users.map(u => u.id);
      let groupMap = new Map();
      
      if (userIds.length > 0) {
        try {
          // Otimizado: buscar apenas userId e groupId diretamente
          const groupMembers = await this.groupMemberRepository
            .createQueryBuilder('gm')
            .select('gm.userId', 'userId')
            .addSelect('gm.groupId', 'groupId')
            .where('gm.userId IN (:...userIds)', { userIds })
            .andWhere('gm.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          if (groupMembers.length > 0) {
            // Buscar os grupos separadamente - apenas se houver membros
            const groupIds = [...new Set(groupMembers.map(gm => gm.groupId))];
            const groups = await this.groupRepository
              .createQueryBuilder('g')
              .select('g.id', 'id')
              .addSelect('g.tag', 'tag')
              .addSelect('g.isActive', 'isActive')
              .where('g.id IN (:...groupIds)', { groupIds })
              .andWhere('g.isActive = :isActive', { isActive: true })
              .getRawMany();
            
            const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, tag: g.tag, isActive: g.isActive }]));
            
            // Criar mapa userId -> group
            groupMembers.forEach(gm => {
              const group = groupsMap.get(gm.groupId);
              if (group) {
                groupMap.set(gm.userId, group);
              }
            });
          }
        } catch (error) {
          console.error('❌ [getTop5Players] Erro ao carregar grupos (sem season):', error);
          // Continuar sem grupos se houver erro
          groupMap = new Map();
        }
      }

      return users.map((user, index) => {
        const group = groupMap.get(user.id);
        return {
          rank: index + 1,
          id: String(user.id),
          nickname: user.nickname,
          clanTag: user.clanTag || (group && group.isActive ? group.tag : null),
          profileImage: this.normalizeProfileImage(user.profileImage),
          wins: user.winsGeral,
          losses: user.lossesGeral,
          score: user.totalScore || 0,
          level: user.level || 1,
        };
      });
    }

    // Busca top 5 da season ativa - incluir usuários com e sem registro de season ranking
    // Primeiro, buscar todos os usuários ordenados por totalScore e level
    const allUsers = await this.usersRepository
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.nickname', 'nickname')
      .addSelect('u.clanTag', 'clanTag')
      .addSelect('u.profileImage', 'profileImage')
      .addSelect('u.totalScore', 'totalScore')
      .addSelect('u.winsGeral', 'winsGeral')
      .addSelect('u.lossesGeral', 'lossesGeral')
      .addSelect('u.level', 'level')
      .orderBy('u.totalScore', 'DESC')
      .addOrderBy('u.level', 'DESC')
      .limit(5)
      .getRawMany();

    // Buscar rankings da season para os usuários encontrados
    if (!activeSeason || !activeSeason.id) {
      // Se não há season ativa, retornar top 5 por totalScore e level
      return allUsers.map((user, index) => {
        return {
          rank: index + 1,
          id: String(user.id),
          nickname: user.nickname,
          clanTag: user.clanTag,
          profileImage: this.normalizeProfileImage(user.profileImage),
          wins: user.winsGeral,
          losses: user.lossesGeral,
          score: user.totalScore || 0,
          level: user.level || 1,
        };
      });
    }

    const allUserIds = allUsers.map(u => u.id);
    const seasonRankings = await this.seasonRankingRepository
      .createQueryBuilder('sr')
      .where('sr.seasonId = :seasonId', { seasonId: activeSeason.id })
      .andWhere('sr.userId IN (:...userIds)', { userIds: allUserIds })
      .getMany();

    // Criar mapa de userId -> seasonRanking
    const rankingMap = new Map(seasonRankings.map(sr => [sr.userId, sr]));

    // Combinar dados: usar season ranking se existir, senão usar dados gerais
    const rankings = allUsers.map((user) => {
      const seasonRanking = rankingMap.get(user.id);
      return {
        id: null,
        seasonId: activeSeason?.id || null,
        userId: user.id,
        seasonScore: seasonRanking ? seasonRanking.seasonScore : 0,
        wins: seasonRanking ? seasonRanking.wins : (user.winsGeral || 0),
        losses: seasonRanking ? seasonRanking.losses : (user.lossesGeral || 0),
        rank: 0,
        division: user.division || null, // Divisão da tabela users (verdadeira) - dinâmica
        user_id: user.id,
        user_nickname: user.nickname,
        user_clanTag: user.clanTag,
        user_profileImage: this.normalizeProfileImage(user.profileImage),
        user_totalScore: user.totalScore,
        user_level: user.level,
        user_winsGeral: user.winsGeral || 0,
        user_lossesGeral: user.lossesGeral || 0,
      };
    });

    // Ordenar por seasonScore (ou totalScore se não tiver season ranking)
    rankings.sort((a, b) => {
      const scoreA = a.seasonScore > 0 ? a.seasonScore : (a.user_totalScore || 0);
      const scoreB = b.seasonScore > 0 ? b.seasonScore : (b.user_totalScore || 0);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // Desempate por level
      return (b.user_level || 1) - (a.user_level || 1);
    });

    // Busca os grupos dos usuários - carregar separadamente para evitar problemas
    const userIds = rankings.map(r => r.userId);
    let groupMap = new Map();
    
    if (userIds.length > 0) {
      try {
        // Otimizado: buscar apenas userId e groupId diretamente
        const groupMembers = await this.groupMemberRepository
          .createQueryBuilder('gm')
          .select('gm.userId', 'userId')
          .addSelect('gm.groupId', 'groupId')
          .where('gm.userId IN (:...userIds)', { userIds })
          .andWhere('gm.isActive = :isActive', { isActive: true })
          .getRawMany();
        
        if (groupMembers.length > 0) {
          // Buscar os grupos separadamente - apenas se houver membros
          const groupIds = [...new Set(groupMembers.map(gm => gm.groupId))];
          const groups = await this.groupRepository
            .createQueryBuilder('g')
            .select('g.id', 'id')
            .addSelect('g.tag', 'tag')
            .addSelect('g.isActive', 'isActive')
            .where('g.id IN (:...groupIds)', { groupIds })
            .andWhere('g.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, tag: g.tag, isActive: g.isActive }]));
          
          // Criar mapa userId -> group
          groupMembers.forEach(gm => {
            const group = groupsMap.get(gm.groupId);
            if (group) {
              groupMap.set(gm.userId, group);
            }
          });
        }
      } catch (error) {
        console.error('❌ [getTop5Players] Erro ao carregar grupos:', error);
        // Continuar sem grupos se houver erro
        groupMap = new Map();
      }
    }

    return rankings.map((ranking, index) => {
      const group = groupMap.get(ranking.userId);
      const clanTag = ranking.user_clanTag || (group && group.isActive ? group.tag : null);
      
      console.log(`🔍 [getTop5Players] User ${ranking.user_id} (${ranking.user_nickname}): clanTag=${ranking.user_clanTag}, groupTag=${group?.tag}, finalClanTag=${clanTag}, seasonScore=${ranking.seasonScore}, wins=${ranking.wins}, losses=${ranking.losses}`);
      
      return {
        rank: index + 1,
        id: String(ranking.user_id),
        nickname: ranking.user_nickname,
        clanTag: clanTag,
        profileImage: this.normalizeProfileImage(ranking.user_profileImage),
        wins: ranking.wins,
        losses: ranking.losses,
        score: ranking.seasonScore > 0 ? ranking.seasonScore : (ranking.user_totalScore || 0),
        level: ranking.user_level || 1,
        division: ranking.division,
      };
    });
  }

  // Calcular classe do jogador baseada no score e nível
  calculatePlayerClass(totalScore: number, level: number): string {
    // Classe baseada em nível e score combinados
    const scoreLevel = (totalScore || 0) + (level || 1) * 100;
    
    if (scoreLevel >= 5000 || level >= 50) return 'Lendário';
    if (scoreLevel >= 3000 || level >= 30) return 'Mestre';
    if (scoreLevel >= 2000 || level >= 20) return 'Veterano';
    if (scoreLevel >= 1000 || level >= 10) return 'Aprendiz';
    if (scoreLevel >= 500 || level >= 5) return 'Novato';
    return 'Iniciante';
  }

  // Obter perfil completo do usuário com rankings
  // includePrivateFields: quando false (perfil de outro usuário), username/email não são retornados
  async getFullProfile(userId: number, options?: { includePrivateFields?: boolean }): Promise<any> {
    // Buscar usuário com division explicitamente
    const user = await this.usersRepository.findOne({ 
      where: { id: userId },
      select: [
        'id',
        'nickname',
        'username',
        'email',
        'password',
        'role',
        'winsGeral',
        'lossesGeral',
        'winsSeason',
        'lossesSeason',
        'credits',
        'cash',
        'level',
        'totalScore',
        'profileImage',
        'isOnline',
        'isBanned',
        'banReason',
        'lastLogin',
        'lastIpAddress',
        'isEmailVerified',
        'clanTag',
        'biography',
        'playerClass',
        'division', // Divisão da tabela users - CRÍTICO
        'equippedPlaymatId',
        'equippedPlaymatImage',
        'equippedSkinId',
        'equippedSkinImage',
        'equippedDeckName',
        'createdAt',
        'updatedAt',
        'adminAllowedTabs',
      ]
    });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // Log para debug - verificar se division está sendo retornado
    console.log(`🔍 [getFullProfile] User ${userId} - division do banco:`, user.division);
    
    // Buscar season ativa (usar QueryBuilder para evitar erro se divisionPrizes não existir)
    const activeSeasonRaw = await this.seasonRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.isActive = :isActive', { isActive: true })
      .getRawOne();
    
    const activeSeason = activeSeasonRaw ? { id: activeSeasonRaw.id } : null;

    let seasonRanking = null;
    let seasonRank: number | null = null;
    let generalRank: number | null = null;

    if (activeSeason && activeSeason.id) {
      seasonRanking = await this.seasonRankingRepository.findOne({
        where: { userId, seasonId: activeSeason.id },
      });

      if (seasonRanking && activeSeason.id) {
        // Usar o rank salvo se disponível, caso contrário calcular dinamicamente
        if (seasonRanking.rank && seasonRanking.rank > 0) {
          seasonRank = seasonRanking.rank;
          console.log(`📊 [getFullProfile] User ${userId} - seasonRank do banco: ${seasonRank}`);
        } else {
          // Calcular rank na season - contar usuários com score maior
          const countBetter = await this.seasonRankingRepository.count({
            where: {
              seasonId: activeSeason.id,
              seasonScore: MoreThan(seasonRanking.seasonScore),
            },
          });
          seasonRank = countBetter + 1;
          console.log(`📊 [getFullProfile] User ${userId} - seasonRank calculado: ${seasonRank} (${countBetter} melhores)`);
        }
      } else {
        // Se não tem season ranking, calcular posição baseado em todos os usuários com season ranking
        const totalWithRanking = await this.seasonRankingRepository.count({
          where: { seasonId: activeSeason.id }
        });
        seasonRank = totalWithRanking + 1; // Posição após todos que têm ranking
        console.log(`📊 [getFullProfile] User ${userId} - sem season ranking, posição: ${seasonRank} (total com ranking: ${totalWithRanking})`);
      }
    } else {
      console.log(`📊 [getFullProfile] User ${userId} - sem season ativa`);
    }

    // Calcular rank geral baseado em totalScore (depois level como desempate)
    const userTotalScore = parseFloat(String(user.totalScore || 0));
    
    // Recalcular e atualizar nível baseado no totalScore atual ANTES de calcular ranking
    await this.updateUserLevel(userId, userTotalScore);
    
    // Buscar nível atualizado após recálculo
    const updatedUser = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'level'],
    });
    const userLevel = updatedUser?.level || user.level || 1;
    
    // Atualizar o objeto user com o nível atualizado
    user.level = userLevel;
    
    // Contar usuários com totalScore maior OU (totalScore igual E level maior)
    // Excluir o próprio usuário da contagem
    try {
      const countBetterGeneral = await this.usersRepository
        .createQueryBuilder('u')
        .where('u.id != :userId', { userId })
        .andWhere(
          '(CAST(u.totalScore AS DECIMAL) > :totalScore OR (CAST(u.totalScore AS DECIMAL) = :totalScore AND u.level > :level))',
          { 
            totalScore: userTotalScore, 
            level: userLevel 
          }
        )
        .getCount();
      
      generalRank = countBetterGeneral + 1;
      
      // Log para debug
      console.log(`📊 [getFullProfile] User ${userId} - totalScore: ${userTotalScore}, level: ${userLevel}, generalRank: ${generalRank}`);
    } catch (error: any) {
      console.error('❌ [getFullProfile] Erro ao calcular ranking geral:', error.message);
      // Em caso de erro, calcular de forma mais simples
      const allUsers = await this.usersRepository.find({
        select: ['id', 'totalScore', 'level'],
        order: { totalScore: 'DESC', level: 'DESC' }
      });
      
      const userIndex = allUsers.findIndex(u => u.id === userId);
      generalRank = userIndex >= 0 ? userIndex + 1 : null;
    }

    // Calcular classe baseada em score e nível
    const playerClass = this.calculatePlayerClass(userTotalScore, userLevel);

    // Atualizar classe do usuário se necessário
    if (user.playerClass !== playerClass) {
      await this.usersRepository.update(userId, { playerClass });
      user.playerClass = playerClass;
    }

    // Buscar clã do usuário e validar se realmente está em um grupo ativo
    let clanTag = null;
    let userGroup = null;
    try {
      const groupMember = await this.groupMemberRepository
        .createQueryBuilder('gm')
        .select('gm.groupId', 'groupId')
        .where('gm.userId = :userId', { userId })
        .andWhere('gm.isActive = :isActive', { isActive: true })
        .getRawOne();
      
      if (groupMember) {
        const group = await this.groupRepository
          .createQueryBuilder('g')
          .select('g.id', 'id')
          .addSelect('g.name', 'name')
          .addSelect('g.tag', 'tag')
          .addSelect('g.logo', 'logo')
          .addSelect('g.isActive', 'isActive')
          .where('g.id = :groupId', { groupId: groupMember.groupId })
          .andWhere('g.isActive = :isActive', { isActive: true })
          .getRawOne();
        
        if (group && group.isActive) {
          clanTag = group.tag ?? null;
          userGroup = {
            id: group.id,
            name: group.name,
            tag: group.tag,
            logo: group.logo,
          };
          // Atualizar clanTag do usuário se estiver diferente
          if (user.clanTag !== clanTag) {
            await this.usersRepository.update(userId, { clanTag });
            user.clanTag = clanTag;
          }
        } else {
          // Usuário não está em um grupo ativo, limpar clanTag se existir
          if (user.clanTag) {
            await this.usersRepository.update(userId, { clanTag: null as any });
            user.clanTag = null;
          }
        }
      } else {
        // Usuário não está em um grupo ativo, limpar clanTag se existir
        if (user.clanTag) {
          await this.usersRepository.update(userId, { clanTag: null as any });
          user.clanTag = null;
        }
      }
    } catch (error) {
      console.error('❌ [getFullProfile] Erro ao carregar grupo:', error);
    }

    // Formatar nick com clã
    const displayNick = clanTag ? `|${clanTag}| ${user.nickname}` : user.nickname;

    // Usar divisão do próprio usuário (da tabela users) - sempre dinâmica, não fixa
    // Buscar division diretamente do banco se não vier no objeto
    let division = user.division;
    
    // Se division não veio no objeto, buscar diretamente do banco
    if (!division || division === undefined || division === null) {
      try {
        const userWithDivision = await this.usersRepository
          .createQueryBuilder('u')
          .select('u.division', 'division')
          .where('u.id = :id', { id: userId })
          .getRawOne();
        
        if (userWithDivision && userWithDivision.division) {
          division = userWithDivision.division;
          console.log(`🔍 [getFullProfile] Division buscada diretamente do banco:`, division);
        }
      } catch (error) {
        console.error(`❌ [getFullProfile] Erro ao buscar division do banco:`, error);
      }
    }
    
    // Normalizar divisão para sempre retornar em inglês (evitar mistura PT/EN na interface)
    if (division) {
      const divUpper = (division as string).trim().toUpperCase();
      if (divUpper === 'BRONZE') division = 'Bronze';
      else if (divUpper === 'SILVER' || divUpper === 'PRATA') division = 'Silver';
      else if (divUpper === 'GOLD' || divUpper === 'OURO') division = 'Gold';
      else if (divUpper === 'PLATINUM' || divUpper === 'PLATINA') division = 'Platinum';
      else if (divUpper === 'DIAMOND' || divUpper === 'DIAMANTE') division = 'Diamond';
      else if (divUpper === 'MASTER' || divUpper === 'MESTRE') division = 'Master';
      else if (divUpper === 'LEGENDARY' || divUpper === 'DESAFIANTE') division = 'Legendary';
      else division = 'Bronze'; // fallback
    }
    
    console.log(`✅ [getFullProfile] Division final para user ${userId}:`, division);

    const includePrivate = options?.includePrivateFields === true;
    const result: any = {
      ...user,
      level: userLevel,
      profileImage: this.normalizeProfileImage(user.profileImage),
      displayNick,
      playerClass,
      isOnline: user.isOnline ?? false,
      group: userGroup,
      division: division || null,
      seasonRanking: seasonRanking ? {
        seasonScore: seasonRanking.seasonScore,
        wins: seasonRanking.wins,
        losses: seasonRanking.losses,
        rank: seasonRank,
      } : {
        seasonScore: 0,
        wins: 0,
        losses: 0,
        rank: seasonRank,
      },
      seasonRank: seasonRank,
      generalRank: generalRank,
      globalRank: generalRank,
    };
    if (includePrivate) {
      result.lastIpAddress = user.lastIpAddress || null;
    }
    delete result.password;
    if (!includePrivate) {
      delete result.username;
      delete result.email;
      delete result.lastIpAddress;
      delete result.banReason;
      delete result.isBanned;
      delete result.isEmailVerified;
      delete result.lastLogin;
    }
    return result;
  }

  // Atualizar biografia
  async updateBiography(userId: number, biography: string): Promise<User> {
    if (biography && biography.length > 500) {
      throw new BadRequestException('Biografia muito longa. Máximo 500 caracteres.');
    }
    await this.usersRepository.update(userId, { biography });
    return this.findById(userId);
  }

  // Atualizar clanTag
  async updateClanTag(userId: number, clanTag: string): Promise<User> {
    if (clanTag && clanTag.length > 10) {
      throw new BadRequestException('Tag do clã muito longa. Máximo 10 caracteres.');
    }
    await this.usersRepository.update(userId, { clanTag });
    return this.findById(userId);
  }

  // Atualizar nickname
  async updateNickname(userId: number, nickname: string): Promise<User> {
    if (!nickname || nickname.trim().length === 0) {
      throw new BadRequestException('Nickname não pode estar vazio.');
    }
    if (nickname.length > 50) {
      throw new BadRequestException('Nickname muito longo. Máximo 50 caracteres.');
    }
    
    // Verificar se o nickname já está em uso por outro usuário
    const existingUser = await this.findByNickname(nickname);
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('Este nickname já está em uso.');
    }
    
    await this.usersRepository.update(userId, { nickname: nickname.trim() });
    return this.findById(userId);
  }

  // Atualizar username (nome de usuário para login)
  async updateUsername(userId: number, username: string): Promise<User> {
    const trimmed = (username || '').trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Nome de usuário não pode estar vazio.');
    }
    if (trimmed.length < 3) {
      throw new BadRequestException('Nome de usuário deve ter pelo menos 3 caracteres.');
    }
    if (trimmed.length > 30) {
      throw new BadRequestException('Nome de usuário muito longo. Máximo 30 caracteres.');
    }
    const existingUser = await this.findByUsername(trimmed);
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('Este nome de usuário já está em uso.');
    }
    await this.usersRepository.update(userId, { username: trimmed });
    return this.findById(userId);
  }

  // Atualizar email (após confirmação pelo link no email atual)
  async updateEmail(userId: number, email: string): Promise<User> {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Email inválido.');
    }
    const trimmed = email.trim().toLowerCase();
    const existingUser = await this.findByEmail(trimmed);
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('Este email já está em uso.');
    }
    await this.usersRepository.update(userId, {
      email: trimmed,
      pendingNewEmail: null,
      emailChangeToken: null,
      emailChangeExpiresAt: null,
    });
    return this.findById(userId);
  }

  // Solicitar troca de email: envia link de confirmação para o email ATUAL
  async requestEmailChange(userId: number, newEmail: string): Promise<{ message: string }> {
    if (!newEmail || !newEmail.includes('@')) {
      throw new BadRequestException('Email inválido.');
    }
    const newEmailTrimmed = newEmail.trim().toLowerCase();
    const user = await this.findById(userId);
    if (!user) {
      throw new BadRequestException('Usuário não encontrado.');
    }
    const currentEmail = (user.email || '').trim().toLowerCase();
    if (newEmailTrimmed === currentEmail) {
      throw new BadRequestException('O novo email é igual ao atual.');
    }
    const existingUser = await this.findByEmail(newEmailTrimmed);
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('Este email já está em uso.');
    }
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await this.usersRepository.update(userId, {
      pendingNewEmail: newEmailTrimmed,
      emailChangeToken: token,
      emailChangeExpiresAt: expiresAt,
    });
    const sent = await this.mailService.sendEmailChangeConfirmation(
      currentEmail,
      user.nickname,
      token,
      newEmailTrimmed,
    );
    return {
      message: sent
        ? 'Enviamos um link de confirmação para seu email atual. Acesse o link para concluir a troca.'
        : 'Solicitação registrada. Verifique seu email atual (e a pasta de spam) para o link de confirmação.',
    };
  }

  async findByEmailChangeToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { emailChangeToken: token },
    });
  }

  async confirmEmailChange(token: string): Promise<{ message: string }> {
    const user = await this.findByEmailChangeToken(token);
    if (!user) {
      throw new BadRequestException('Link inválido ou expirado.');
    }
    const raw = await this.usersRepository.findOne({ where: { id: user.id } });
    const expiresAt = (raw as any)?.emailChangeExpiresAt;
    const pendingNew = (raw as any)?.pendingNewEmail;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      await this.usersRepository.update(user.id, {
        pendingNewEmail: null,
        emailChangeToken: null,
        emailChangeExpiresAt: null,
      });
      throw new BadRequestException('Link expirado. Solicite a troca de email novamente no perfil.');
    }
    if (!pendingNew) {
      throw new BadRequestException('Solicitação de troca não encontrada.');
    }
    await this.updateEmail(user.id, pendingNew);
    return { message: 'Email alterado com sucesso. Use o novo email para fazer login.' };
  }

  // Atualizar senha
  async updatePassword(userId: number, currentPassword: string, newPassword: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new BadRequestException('Usuário não encontrado.');
    }
    
    // Verificar senha atual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    
    // Validar nova senha
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('A nova senha deve ter pelo menos 6 caracteres.');
    }
    
    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(userId, { password: hashedPassword });
    return this.findById(userId);
  }

  // Atualizar cosméticos equipados (playmat e sleeve)
  async updateCosmetics(
    userId: number,
    cosmetics: {
      equippedPlaymatId?: string | null;
      equippedPlaymatImage?: string | null;
      equippedSkinId?: string | null;
      equippedSkinImage?: string | null;
      equippedDeckName?: string | null;
    },
  ): Promise<User> {
    const updates: Partial<User> = {};

    if (cosmetics.equippedPlaymatId !== undefined) {
      updates.equippedPlaymatId = cosmetics.equippedPlaymatId;
      // Se playmatId foi limpo, também limpar imagem
      if (!cosmetics.equippedPlaymatId) {
        updates.equippedPlaymatImage = null;
      }
    }
    if (cosmetics.equippedPlaymatImage !== undefined) {
      updates.equippedPlaymatImage = cosmetics.equippedPlaymatImage;
    }

    if (cosmetics.equippedSkinId !== undefined) {
      updates.equippedSkinId = cosmetics.equippedSkinId;
      if (!cosmetics.equippedSkinId) {
        updates.equippedSkinImage = null;
      }
    }
    if (cosmetics.equippedSkinImage !== undefined) {
      updates.equippedSkinImage = cosmetics.equippedSkinImage;
    }

    if (cosmetics.equippedDeckName !== undefined) {
      const deckName = cosmetics.equippedDeckName?.trim() || null;
      if (deckName) {
        const deck = await this.decksRepository.findOne({
          where: { userId, name: deckName },
        });
        if (!deck) {
          throw new BadRequestException('Deck não encontrado.');
        }
        const mainDeckCount = await this.deckCardsRepository.count({
          where: { deckId: deck.id, isExtraDeck: false },
        });
        if (mainDeckCount < 40) {
          throw new BadRequestException(
            'Não é possível equipar um deck com menos de 40 cartas no deck principal. Adicione pelo menos ' +
              (40 - mainDeckCount) +
              ' carta(s) ao deck principal.',
          );
        }
      }
      console.log(`🔍 [updateCosmetics] Atualizando equippedDeckName para: "${cosmetics.equippedDeckName}"`);
      updates.equippedDeckName = cosmetics.equippedDeckName;
    }

    if (Object.keys(updates).length === 0) {
      return this.findById(userId);
    }

    console.log(`🔍 [updateCosmetics] Atualizando usuário ${userId} com:`, JSON.stringify(updates, null, 2));
    await this.usersRepository.update(userId, updates);
    const updatedUser = await this.findById(userId);
    console.log(`🔍 [updateCosmetics] Usuário atualizado. equippedDeckName agora é: "${(updatedUser as any).equippedDeckName || 'null/undefined'}"`);
    return updatedUser;
  }

  /**
   * Adiciona um playmat à lista de itens possuídos do usuário (para contas novas com playmat padrão).
   */
  async addOwnedPlaymatIfNotPresent(userId: number, playmatId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: ['id', 'ownedPlaymatIds'] });
    if (!user) return;
    const owned = Array.isArray(user.ownedPlaymatIds) ? user.ownedPlaymatIds : [];
    if (owned.includes(playmatId)) return;
    await this.usersRepository.update(userId, { ownedPlaymatIds: [...owned, playmatId] });
  }

  /**
   * Adiciona uma sleeve à lista de itens possuídos do usuário (para contas novas com sleeve padrão).
   */
  async addOwnedSleeveIfNotPresent(userId: number, sleeveId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: ['id', 'ownedSleeveIds'] });
    if (!user) return;
    const owned = Array.isArray(user.ownedSleeveIds) ? user.ownedSleeveIds : [];
    if (owned.includes(sleeveId)) return;
    await this.usersRepository.update(userId, { ownedSleeveIds: [...owned, sleeveId] });
  }

  async updateOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
    try {
      const result = await this.usersRepository.update(userId, { isOnline });
      if (result.affected === 0) {
        console.warn(`⚠️ [updateOnlineStatus] Nenhuma linha afetada ao atualizar status do usuário ${userId} para ${isOnline}. Usuário pode não existir.`);
      } else {
        console.log(`✅ [updateOnlineStatus] Status do usuário ${userId} atualizado para ${isOnline ? 'online' : 'offline'}`);
      }
    } catch (error) {
      console.error(`❌ [updateOnlineStatus] Erro ao atualizar status do usuário ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Limpa usuários que estão marcados como online mas não têm conexões ativas
   * Deve ser chamado periodicamente para manter consistência
   * @param activeUserIds - Array de IDs de usuários que realmente têm conexões ativas
   */
  async cleanupStaleOnlineUsers(activeUserIds: number[] = []): Promise<number> {
    try {
      // Primeiro, garantir que usuários banidos não fiquem online
      const bannedOnlineUsers = await this.usersRepository.find({
        where: { isOnline: true, isBanned: true },
        select: ['id'],
      });

      let cleanedCount = 0;

      if (bannedOnlineUsers.length > 0) {
        await this.usersRepository.update(
          { id: In(bannedOnlineUsers.map(u => u.id)) },
          { isOnline: false }
        );
        cleanedCount += bannedOnlineUsers.length;
      }

      // Se temos a lista de usuários ativos, marcar os outros como offline
      if (activeUserIds.length > 0) {
        const allOnlineUsers = await this.usersRepository.find({
          where: { isOnline: true, isBanned: false },
          select: ['id'],
        });

        const staleUsers = allOnlineUsers.filter(u => !activeUserIds.includes(u.id));
        
        if (staleUsers.length > 0) {
          await this.usersRepository.update(
            { id: In(staleUsers.map(u => u.id)) },
            { isOnline: false }
          );
          cleanedCount += staleUsers.length;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('❌ [cleanupStaleOnlineUsers] Erro ao limpar usuários online obsoletos:', error);
      return 0;
    }
  }

  async updateLastLogin(userId: number, ipAddress: string): Promise<void> {
    console.log(`🔄 [updateLastLogin] Atualizando último login do usuário ${userId} com IP: ${ipAddress}`);
    const result = await this.usersRepository.update(userId, {
      lastLogin: new Date(),
      lastIpAddress: ipAddress,
      isOnline: true, // Marcar como online ao fazer login
    });
    console.log(`✅ [updateLastLogin] Último login atualizado e usuário marcado como online. Linhas afetadas: ${result.affected || 0}`);

    // Registrar no histórico de IPs (Redis) para o admin visualizar
    try {
      const ipHistoryKey = `user:${userId}:ip_history`;
      const entry = JSON.stringify({
        ip: ipAddress,
        timestamp: new Date().toISOString(),
      });
      await this.redisService.getClient().lPush(ipHistoryKey, entry);
      await this.redisService.getClient().lTrim(ipHistoryKey, 0, 49); // Manter últimos 50
    } catch (err) {
      // Não falhar o login se Redis estiver indisponível
      if (err instanceof Error) {
        console.warn(`⚠️ [updateLastLogin] Redis indisponível para histórico de IP: ${err.message}`);
      }
    }
  }

  /**
   * Atualiza a última atividade do usuário e marca como online
   * Chamado sempre que o usuário faz uma requisição autenticada
   */
  async updateLastActivity(userId: number): Promise<void> {
    try {
      await this.usersRepository.update(userId, {
        lastLogin: new Date(), // Usar lastLogin como timestamp de última atividade
        isOnline: true,
      });
    } catch (error) {
      // Log apenas em caso de erro crítico
      if (error instanceof Error && error.message.includes('does not exist')) {
        // Usuário não existe, ignorar silenciosamente
        return;
      }
      throw error;
    }
  }
}
