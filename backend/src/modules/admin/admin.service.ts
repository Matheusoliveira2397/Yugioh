import { Injectable, Inject, forwardRef, OnModuleInit, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, In, MoreThan, LessThan } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { Transaction } from '../economy/entities/transaction.entity';
import { SeasonRanking, Division as DivisionEnum } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Friendship } from '../friends/entities/friendship.entity';
import { PrivateMessage } from '../friends/entities/private-message.entity';
import { TournamentParticipant } from '../tournaments/entities/tournament-participant.entity';
import { TournamentMatch } from '../tournaments/entities/tournament-match.entity';
import { Tournament } from '../tournaments/entities/tournament.entity';
import { Duel, DuelStatus } from '../duels/entities/duel.entity';
import { DuelLog } from '../duels/entities/duel-log.entity';
import { DuelHistory } from '../duels/entities/duel-history.entity';
import { Group } from '../groups/entities/group.entity';
import { News } from '../news/news.entity';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { SiteTab } from './entities/site-tab.entity';
import { Division } from './entities/division.entity';
import { SocialMedia } from './entities/social-media.entity';
import { NewAccountSettingsService } from '../new-account-settings/new-account-settings.service';
import { InitialDecksService } from '../initial-decks/initial-decks.service';
import { CosmeticsService } from '../cosmetics/cosmetics.service';
import { UsersService } from '../users/users.service';
import { DuelsGateway } from '../duels/duels.gateway';
import { ChatGateway } from '../chat/chat.gateway';
import { FriendsGateway } from '../friends/friends.gateway';
import { Achievement, AchievementType } from '../users/entities/achievement.entity';
import { UploadService } from '../upload/upload.service';
import { CreditPaymentLog } from './entities/credit-payment-log.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private authService: AuthService,
    @InjectRepository(CreditPaymentLog)
    private creditPaymentLogRepository: Repository<CreditPaymentLog>,
    @InjectRepository(Achievement)
    private achievementsRepository: Repository<Achievement>,
    @InjectRepository(UserCard)
    private userCardsRepository: Repository<UserCard>,
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(DeckCard)
    private deckCardsRepository: Repository<DeckCard>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(SeasonRanking)
    private seasonRankingsRepository: Repository<SeasonRanking>,
    @InjectRepository(Season)
    private seasonsRepository: Repository<Season>,
    @InjectRepository(GroupMember)
    private groupMembersRepository: Repository<GroupMember>,
    @InjectRepository(Friendship)
    private friendshipsRepository: Repository<Friendship>,
    @InjectRepository(PrivateMessage)
    private privateMessagesRepository: Repository<PrivateMessage>,
    @InjectRepository(TournamentParticipant)
    private tournamentParticipantsRepository: Repository<TournamentParticipant>,
    @InjectRepository(TournamentMatch)
    private tournamentMatchesRepository: Repository<TournamentMatch>,
    @InjectRepository(Tournament)
    private tournamentsRepository: Repository<Tournament>,
    @InjectRepository(Duel)
    private duelsRepository: Repository<Duel>,
    @InjectRepository(DuelLog)
    private duelLogsRepository: Repository<DuelLog>,
    @InjectRepository(DuelHistory)
    private duelHistoryRepository: Repository<DuelHistory>,
    @InjectRepository(Group)
    private groupsRepository: Repository<Group>,
    @InjectRepository(News)
    private newsRepository: Repository<News>,
    @InjectRepository(SiteTab)
    private siteTabsRepository: Repository<SiteTab>,
    @InjectRepository(Division)
    private divisionsRepository: Repository<Division>,
    @InjectRepository(SocialMedia)
    private socialMediaRepository: Repository<SocialMedia>,
    private newAccountSettingsService: NewAccountSettingsService,
    private redisService: RedisService,
    @Inject(forwardRef(() => InitialDecksService))
    private initialDecksService: InitialDecksService,
    private cosmeticsService: CosmeticsService,
    private usersService: UsersService,
    @Inject(forwardRef(() => DuelsGateway))
    private duelsGateway: DuelsGateway,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway?: ChatGateway,
    @Inject(forwardRef(() => FriendsGateway))
    private friendsGateway?: FriendsGateway,
    private uploadService?: UploadService,
  ) {}

  async onModuleInit() {
    // Verificar e criar tabela social_media se não existir
    try {
      console.log('🔧 [AdminService] Verificando tabela social_media...');
      
      const socialMediaTableExists = await this.socialMediaRepository.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'social_media'
      `);
      
      if (socialMediaTableExists.length === 0) {
        console.log('🔧 [AdminService] Tabela social_media não existe. Criando automaticamente...');
        
        // Verificar se gen_random_uuid() está disponível
        let uuidFunction = 'gen_random_uuid()';
        try {
          await this.socialMediaRepository.query(`SELECT gen_random_uuid();`);
        } catch (testError: any) {
          try {
            await this.socialMediaRepository.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
            uuidFunction = 'uuid_generate_v4()';
            console.log('ℹ️ [AdminService] Usando uuid_generate_v4() para UUIDs');
          } catch (extError: any) {
            console.warn('⚠️ [AdminService] Nenhuma função UUID disponível, usando gen_random_uuid() como padrão');
          }
        }
        
        await this.socialMediaRepository.query(`
          CREATE TABLE IF NOT EXISTS "social_media" (
            "id" uuid PRIMARY KEY DEFAULT ${uuidFunction},
            "platform" VARCHAR(50) UNIQUE NOT NULL,
            "url" VARCHAR(255) NOT NULL,
            "label" VARCHAR(100),
            "icon" VARCHAR(255),
            "order" INTEGER DEFAULT 0,
            "isActive" BOOLEAN DEFAULT true,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
          )
        `);
        
        await this.socialMediaRepository.query(`
          CREATE INDEX IF NOT EXISTS "IDX_social_media_isActive" ON "social_media"("isActive")
        `);
        
        await this.socialMediaRepository.query(`
          CREATE INDEX IF NOT EXISTS "IDX_social_media_order" ON "social_media"("order")
        `);
        
        console.log('✅ [AdminService] Tabela social_media criada com sucesso!');
      } else {
        console.log('✅ [AdminService] Tabela social_media já existe');
      }
    } catch (error: any) {
      console.error('❌ [AdminService] Erro ao verificar/criar tabela social_media:', error);
    }

    // Verificar e criar tabela divisions se não existir
    try {
      console.log('🔧 [AdminService] Verificando tabela divisions...');
      
      const tableExists = await this.divisionsRepository.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'divisions'
      `);
      
      if (tableExists.length === 0) {
        console.log('🔧 [AdminService] Tabela divisions não existe. Criando automaticamente...');
        
        // Verificar se gen_random_uuid() está disponível
        let uuidFunction = 'gen_random_uuid()';
        try {
          await this.divisionsRepository.query(`SELECT gen_random_uuid();`);
        } catch (testError: any) {
          try {
            await this.divisionsRepository.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
            uuidFunction = 'uuid_generate_v4()';
            console.log('ℹ️ [AdminService] Usando uuid_generate_v4() para UUIDs');
          } catch (extError: any) {
            console.warn('⚠️ [AdminService] Nenhuma função UUID disponível, usando gen_random_uuid() como padrão');
          }
        }
        
        await this.divisionsRepository.query(`
          CREATE TABLE IF NOT EXISTS "divisions" (
            "id" uuid PRIMARY KEY DEFAULT ${uuidFunction},
            "name" VARCHAR(255) NOT NULL,
            "order" INTEGER NOT NULL UNIQUE,
            "maxDuelistas" INTEGER NOT NULL DEFAULT 100,
            "sobe" INTEGER NOT NULL DEFAULT 10,
            "desce" INTEGER NOT NULL DEFAULT 10,
            "premiacao" TEXT NULL,
            "premiacaoJson" JSONB NULL,
            "isAvailable" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        console.log('✅ [AdminService] Tabela divisions criada com sucesso');
      } else {
        console.log('✅ [AdminService] Tabela divisions já existe');
        
        // Verificar se a coluna isAvailable existe
        try {
          const columnExists = await this.divisionsRepository.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'divisions' AND column_name = 'isAvailable'
          `);
          
          if (columnExists.length === 0) {
            console.log('🔧 [AdminService] Adicionando coluna isAvailable à tabela divisions...');
            await this.divisionsRepository.query(`
              ALTER TABLE divisions 
              ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true
            `);
            console.log('✅ [AdminService] Coluna isAvailable adicionada com sucesso');
          }
        } catch (error: any) {
          console.error('❌ [AdminService] Erro ao verificar/criar coluna isAvailable:', error);
        }
      }

      // Verificar e criar as 6 divisões padrão se não existirem
      try {
        const existingDivisions = await this.divisionsRepository.find();
        const divisionNames = existingDivisions.map(d => d.name.toLowerCase());
        
        const defaultDivisions = [
          { name: 'Bronze', order: 1, isAvailable: true },
          { name: 'Silver', order: 2, isAvailable: false },
          { name: 'Gold', order: 3, isAvailable: false },
          { name: 'Platinum', order: 4, isAvailable: false },
          { name: 'Diamond', order: 5, isAvailable: false },
          { name: 'Master', order: 6, isAvailable: false },
          { name: 'Legendary', order: 7, isAvailable: false },
        ];

        for (const defaultDiv of defaultDivisions) {
          if (!divisionNames.includes(defaultDiv.name.toLowerCase())) {
            console.log(`🔧 [AdminService] Criando divisão padrão: ${defaultDiv.name}`);
            const division = this.divisionsRepository.create({
              name: defaultDiv.name,
              order: defaultDiv.order,
              maxDuelistas: 100,
              sobe: 10,
              desce: 10,
              isAvailable: defaultDiv.isAvailable,
            });
            await this.divisionsRepository.save(division);
            console.log(`✅ [AdminService] Divisão ${defaultDiv.name} criada com sucesso`);
          }
        }
      } catch (error: any) {
        console.error('❌ [AdminService] Erro ao criar divisões padrão:', error);
      }
    } catch (error) {
      console.error('❌ [AdminService] Erro ao verificar/criar tabela divisions:', error);
    }

    // Inicializar abas do site (incluindo atualização de ícones)
    try {
      console.log('🔧 [AdminService] Inicializando abas do site...');
      await this.initializeSiteTabs();
      console.log('✅ [AdminService] Abas do site inicializadas com sucesso');
    } catch (error) {
      console.error('❌ [AdminService] Erro ao inicializar abas do site:', error);
    }
  }

  async promoteToMaster(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.role = UserRole.MASTER;
    return this.usersRepository.save(user);
  }

  async promoteToAdmin(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.role = UserRole.ADMIN;
    return this.usersRepository.save(user);
  }

  async demoteToPlayer(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.role = UserRole.PLAYER;
    return this.usersRepository.save(user);
  }

  /**
   * Atualiza as abas permitidas de um admin. Apenas MASTER pode executar.
   */
  async updateAdminAllowedTabs(
    targetUserId: number,
    allowedTabs: string[],
  ): Promise<{ id: number; username: string; adminAllowedTabs: string[] | null }> {
    const user = await this.usersRepository.findOne({
      where: { id: targetUserId },
      select: ['id', 'username', 'role', 'adminAllowedTabs'],
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Só é possível definir abas permitidas para usuários com role ADMIN.');
    }
    const tabs = Array.isArray(allowedTabs) ? allowedTabs : [];
    user.adminAllowedTabs = tabs.length > 0 ? tabs : null;
    await this.usersRepository.save(user);
    return {
      id: user.id,
      username: user.username,
      adminAllowedTabs: user.adminAllowedTabs,
    };
  }

  /**
   * Cria uma conta ADMIN pelo Master. Não exige email; login/senha/nick e abas permitidas.
   */
  async createAdminByMaster(
    masterUserId: number,
    data: { username: string; nickname: string; password: string; allowedTabs: string[] },
  ): Promise<{ id: number; username: string; nickname: string }> {
    const master = await this.usersRepository.findOne({ where: { id: masterUserId }, select: ['id', 'role'] });
    if (!master || master.role !== UserRole.MASTER) {
      throw new ForbiddenException('Apenas conta Master pode criar contas Admin.');
    }

    const username = (data.username || '').trim();
    const nickname = (data.nickname || '').trim();
    const password = data.password;

    if (!username || username.length < 2) {
      throw new BadRequestException('Username deve ter pelo menos 2 caracteres.');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new BadRequestException('Username deve conter apenas letras, números e underscore.');
    }
    if (!nickname || nickname.length < 2) {
      throw new BadRequestException('Nickname deve ter pelo menos 2 caracteres.');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException('Senha deve ter pelo menos 6 caracteres.');
    }

    const existingNick = await this.usersRepository.findOne({ where: { nickname } });
    if (existingNick) {
      throw new BadRequestException('Este nickname já está em uso.');
    }
    const existingUser = await this.usersRepository.findOne({ where: { username } });
    if (existingUser) {
      throw new BadRequestException('Este username já está em uso.');
    }

    const newAccountSettings = await this.newAccountSettingsService.getSettings();
    const initialCredits = newAccountSettings.initialCredits ?? 50;
    const initialCash = newAccountSettings.initialCash ?? 50000;

    const availableDivisions = await this.divisionsRepository.find({
      where: { isAvailable: true },
      order: { order: 'ASC' },
      take: 1,
    });
    const lowestDivision = availableDivisions.length > 0 ? availableDivisions[0].name : 'Bronze';

    let email = `admin-${username}-${Date.now()}@system`;
    let exists = await this.usersRepository.findOne({ where: { email } });
    while (exists) {
      email = `admin-${username}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@system`;
      exists = await this.usersRepository.findOne({ where: { email } });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const allowedTabs = Array.isArray(data.allowedTabs) ? data.allowedTabs : [];

    const user = this.usersRepository.create({
      nickname,
      username,
      email,
      password: hashedPassword,
      role: UserRole.ADMIN,
      adminAllowedTabs: allowedTabs.length > 0 ? allowedTabs : null,
      isEmailVerified: true,
      level: 1,
      totalScore: 0,
      winsGeral: 0,
      lossesGeral: 0,
      winsSeason: 0,
      lossesSeason: 0,
      credits: initialCredits,
      cash: initialCash,
      division: lowestDivision,
      playerClass: 'Novato',
      isOnline: false,
      isBanned: false,
    });
    const saved = await this.usersRepository.save(user);

    // Aplicar sleeve e playmat padrão (mesmo que contas normais)
    const playmatId = newAccountSettings.defaultPlaymatId?.trim() || null;
    const skinId = newAccountSettings.defaultSkinId?.trim() || null;
    const cosmeticsUpdate: { equippedPlaymatId?: string; equippedPlaymatImage?: string; equippedSkinId?: string; equippedSkinImage?: string } = {};
    if (playmatId) {
      try {
        const playmat = await this.cosmeticsService.findOnePlaymat(playmatId);
        if (playmat?.image) {
          cosmeticsUpdate.equippedPlaymatId = playmat.id;
          cosmeticsUpdate.equippedPlaymatImage = playmat.image;
        }
      } catch (err: any) {
        console.warn(`[AdminService] Playmat padrão não aplicado ao admin (ID ${playmatId}):`, err?.message || err);
      }
    }
    if (skinId) {
      try {
        const sleeve = await this.cosmeticsService.findOneSleeve(skinId);
        if (sleeve?.image) {
          cosmeticsUpdate.equippedSkinId = sleeve.id;
          cosmeticsUpdate.equippedSkinImage = sleeve.image;
        }
      } catch (err: any) {
        console.warn(`[AdminService] Sleeve padrão não aplicada ao admin (ID ${skinId}):`, err?.message || err);
      }
    }
    if (Object.keys(cosmeticsUpdate).length > 0) {
      await this.usersService.updateCosmetics(saved.id, cosmeticsUpdate);
      if (cosmeticsUpdate.equippedPlaymatId) {
        await this.usersService.addOwnedPlaymatIfNotPresent(saved.id, cosmeticsUpdate.equippedPlaymatId);
      }
      if (cosmeticsUpdate.equippedSkinId) {
        await this.usersService.addOwnedSleeveIfNotPresent(saved.id, cosmeticsUpdate.equippedSkinId);
      }
    }

    // Atribuir deck inicial (mesmo que contas normais)
    try {
      const deckIds = (newAccountSettings.availableInitialDeckIds && newAccountSettings.availableInitialDeckIds.length > 0)
        ? newAccountSettings.availableInitialDeckIds
        : undefined;
      await this.initialDecksService.assignDeckToUser(saved.id, deckIds);
    } catch (err: any) {
      console.warn(`[AdminService] Deck inicial não aplicado ao admin:`, err?.message || err);
    }

    return { id: saved.id, username: saved.username, nickname: saved.nickname };
  }

  // Gestão de Usuários (ordenado pelos últimos que ficaram online)
  async getAllUsers(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const selectFields = [
      'id', 'username', 'nickname', 'email', 'role', 'adminAllowedTabs',
      'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason',
      'credits', 'cash', 'profileImage', 'isOnline', 'lastIpAddress',
      'isBanned', 'banReason', 'createdAt', 'lastLogin', 'level', 'clanTag', 'totalScore',
    ];
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .select(selectFields.map((f) => `user.${f}`))
      .orderBy('user.lastLogin', 'DESC', 'NULLS LAST')
      .skip(skip)
      .take(limit);
    const [users, total] = await qb.getManyAndCount();

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOnlineUsers() {
    try {
      console.log('🔍 [getOnlineUsers] Iniciando verificação de usuários online baseado em atividade...');
      
      // Verificar usuários que tiveram atividade recente (últimos 5 minutos)
      // Um usuário está online se teve atividade nos últimos 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // Buscar usuários que tiveram atividade recente (lastLogin > fiveMinutesAgo)
      const activeUsers = await this.usersRepository.find({
        where: {
          lastLogin: MoreThan(fiveMinutesAgo),
          isBanned: false,
        },
        select: ['id', 'lastLogin'],
      });
      
      const activeUserIds = new Set(activeUsers.map(u => u.id));
      console.log(`🔍 [getOnlineUsers] ${activeUserIds.size} usuário(s) com atividade recente encontrado(s)`);

      // Buscar TODOS os usuários marcados como online no banco ANTES da sincronização
      const allOnlineUsersInDb = await this.usersRepository.find({
        where: { isOnline: true, isBanned: false },
        select: ['id', 'lastLogin'],
      });
      
      console.log(`🔍 [getOnlineUsers] Antes da sincronização: ${allOnlineUsersInDb.length} usuário(s) marcado(s) como online no banco`);

      // Marcar como online os que têm atividade recente mas não estão marcados como online
      const userIdsArray = Array.from(activeUserIds);
      if (userIdsArray.length > 0) {
        const usersToMarkOnline = await this.usersRepository.find({
          where: {
            id: In(userIdsArray),
            isOnline: false,
            isBanned: false,
          },
          select: ['id'],
        });

        if (usersToMarkOnline.length > 0) {
          await this.usersRepository.update(
            { id: In(usersToMarkOnline.map(u => u.id)) },
            { isOnline: true }
          );
          console.log(`✅ [getOnlineUsers] Marcados ${usersToMarkOnline.length} usuário(s) como online (têm atividade recente)`);
        }
      }

      // Marcar como offline os que não têm atividade recente mas estão marcados como online
      const staleUsers = allOnlineUsersInDb.filter(u => {
        // Se não está na lista de ativos, verificar se tem lastLogin válido
        if (!activeUserIds.has(u.id)) {
          if (!u.lastLogin) {
            return true; // Sem lastLogin = inativo
          }
          const lastLoginTime = new Date(u.lastLogin).getTime();
          const fiveMinutesAgoTime = fiveMinutesAgo.getTime();
          return lastLoginTime < fiveMinutesAgoTime; // lastLogin muito antigo = inativo
        }
        return false;
      });

      if (staleUsers.length > 0) {
        await this.usersRepository.update(
          { id: In(staleUsers.map(u => u.id)) },
          { isOnline: false }
        );
        console.log(`✅ [getOnlineUsers] Marcados ${staleUsers.length} usuário(s) como offline (sem atividade recente ou sem lastLogin): [${staleUsers.map(u => `ID:${u.id} lastLogin:${u.lastLogin || 'null'}`).join(', ')}]`);
      }

      // Buscar usuários marcados como online no banco (APÓS sincronização)
      const usersFromDb = await this.usersRepository.find({
        where: { isOnline: true, isBanned: false },
        select: ['id', 'username', 'nickname', 'profileImage', 'lastIpAddress', 'clanTag'],
        order: { lastLogin: 'DESC' },
      });

      console.log(`✅ [getOnlineUsers] Verificação concluída. Total de ${usersFromDb.length} usuário(s) online no banco.`);
      return {
        count: usersFromDb.length,
        users: usersFromDb,
      };
    } catch (error) {
      console.error('❌ [getOnlineUsers] Erro ao buscar usuários online:', error);
      // Fallback: retornar apenas do banco
      const usersFromDb = await this.usersRepository.find({
        where: { isOnline: true, isBanned: false },
        select: ['id', 'username', 'nickname', 'profileImage', 'lastIpAddress', 'clanTag'],
        order: { lastLogin: 'DESC' },
      });
      return {
        count: usersFromDb.length,
        users: usersFromDb,
      };
    }
  }

  async getUserDetails(userId: number) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Buscar histórico de IPs do Redis (últimos 10)
    const ipHistoryKey = `user:${userId}:ip_history`;
    const ipHistory = await this.redisService.getClient().lRange(ipHistoryKey, 0, 9);

    return {
      ...user,
      ipHistory: ipHistory.map((entry: string) => JSON.parse(entry)),
    };
  }

  async getUserIpHistory(userId: number) {
    const ipHistoryKey = `user:${userId}:ip_history`;
    const history = await this.redisService.getClient().lRange(ipHistoryKey, 0, 49);

    return history.map((entry: string) => JSON.parse(entry));
  }

  async banUser(userId: number, reason?: string, bannedUntil?: string | null) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    user.isBanned = true;
    user.banReason = reason || 'Violação dos termos de uso';
    user.bannedUntil = bannedUntil != null && bannedUntil !== ''
      ? new Date(bannedUntil)
      : null;

    await this.usersRepository.save(user);

    // Deslogar: invalidar refresh tokens e sessão Redis
    await this.authService.invalidateRefreshTokensForUser(userId);
    await this.redisService.getClient().del(`user:${userId}:session`);

    return {
      message: 'Usuário banido com sucesso',
      user,
    };
  }

  async unbanUser(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    user.isBanned = false;
    user.banReason = '';
    user.bannedUntil = null;

    await this.usersRepository.save(user);

    return {
      message: 'Usuário desbanido com sucesso',
      user,
    };
  }

  async updateUserResources(userId: number, resources: { credits?: number; cash?: number }) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    if (resources.credits !== undefined) {
      user.credits = resources.credits;
    }
    if (resources.cash !== undefined) {
      user.cash = resources.cash;
    }

    await this.usersRepository.save(user);

    return {
      message: 'Recursos atualizados com sucesso',
      user,
    };
  }

  /**
   * Adiciona créditos a um usuário (pagamento) e registra no histórico.
   */
  async addCreditsToUser(
    userId: number,
    amount: number,
    adminId: number,
    note?: string,
  ): Promise<{ message: string; newBalance: number }> {
    if (amount <= 0) {
      throw new BadRequestException('A quantidade de créditos deve ser maior que zero.');
    }
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: ['id', 'username', 'nickname', 'credits'] });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    const previousCredits = user.credits ?? 0;
    user.credits = previousCredits + amount;
    await this.usersRepository.save(user);
    await this.creditPaymentLogRepository.save({
      userId,
      adminId,
      amount,
      note: note?.trim() || null,
    });
    return {
      message: `${amount} créditos adicionados à conta de ${user.nickname || user.username}.`,
      newBalance: user.credits,
    };
  }

  /**
   * Histórico de adição de créditos (pagamentos).
   */
  async getCreditPaymentHistory(options: {
    page?: number;
    limit?: number;
    userId?: number;
  }): Promise<{
    items: Array<{
      id: number;
      userId: number;
      userNickname: string;
      userUsername: string;
      adminId: number;
      adminNickname: string;
      amount: number;
      note: string | null;
      createdAt: string;
    }>;
    total: number;
    totalPages: number;
  }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.creditPaymentLogRepository
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (options.userId != null) {
      qb.where('log.userId = :userId', { userId: options.userId });
    }

    const [logs, total] = await qb.getManyAndCount();

    const userIds = [...new Set(logs.map((l) => l.userId))];
    const adminIds = [...new Set(logs.map((l) => l.adminId))];
    const allIds = [...new Set([...userIds, ...adminIds])];
    const users =
      allIds.length > 0
        ? await this.usersRepository.find({
            where: { id: In(allIds) },
            select: ['id', 'nickname', 'username'],
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = logs.map((log) => {
      const user = userMap.get(log.userId);
      const admin = userMap.get(log.adminId);
      return {
        id: log.id,
        userId: log.userId,
        userNickname: user?.nickname ?? '—',
        userUsername: user?.username ?? '—',
        adminId: log.adminId,
        adminNickname: admin?.nickname ?? admin?.username ?? '—',
        amount: log.amount,
        note: log.note,
        createdAt: log.createdAt.toISOString(),
      };
    });

    return {
      items,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Adiciona créditos ou cash em massa para usuários baseado em filtros
   */
  async addBulkResources(options: {
    credits?: number;
    cash?: number;
    filter: 'all' | 'online' | 'loggedToday' | 'loggedThisWeek' | 'loggedThisMonth';
  }): Promise<{ message: string; affectedUsers: number; totalCreditsAdded?: number; totalCashAdded?: number }> {
    const { credits, cash, filter } = options;

    if (!credits && !cash) {
      throw new Error('É necessário especificar créditos ou cash para adicionar');
    }

    let queryBuilder = this.usersRepository.createQueryBuilder('user');

    // Aplicar filtros
    switch (filter) {
      case 'online':
        queryBuilder = queryBuilder.where('user.isOnline = :isOnline', { isOnline: true });
        break;
      case 'loggedToday':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        queryBuilder = queryBuilder.where('user.lastLogin >= :today', { today });
        break;
      case 'loggedThisWeek':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        queryBuilder = queryBuilder.where('user.lastLogin >= :weekAgo', { weekAgo });
        break;
      case 'loggedThisMonth':
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        queryBuilder = queryBuilder.where('user.lastLogin >= :monthAgo', { monthAgo });
        break;
      case 'all':
      default:
        // Sem filtro adicional
        break;
    }

    // Excluir usuários banidos
    queryBuilder = queryBuilder.andWhere('user.isBanned = :isBanned', { isBanned: false });

    const users = await queryBuilder.getMany();

    if (users.length === 0) {
      return {
        message: 'Nenhum usuário encontrado com os filtros especificados',
        affectedUsers: 0,
      };
    }

    let totalCreditsAdded = 0;
    let totalCashAdded = 0;

    // Atualizar recursos de cada usuário
    for (const user of users) {
      if (credits) {
        user.credits = (user.credits || 0) + credits;
        totalCreditsAdded += credits;
      }
      if (cash) {
        user.cash = (user.cash || 0) + cash;
        totalCashAdded += cash;
      }
    }

    // Salvar em lote
    await this.usersRepository.save(users);

    return {
      message: `Recursos adicionados com sucesso para ${users.length} usuário(s)`,
      affectedUsers: users.length,
      totalCreditsAdded: credits ? totalCreditsAdded : undefined,
      totalCashAdded: cash ? totalCashAdded : undefined,
    };
  }

  async getSystemStats() {
    const totalUsers = await this.usersRepository.count();
    const onlineUsers = await this.usersRepository.count({ where: { isOnline: true } });
    const bannedUsers = await this.usersRepository.count({ where: { isBanned: true } });
    const verifiedUsers = await this.usersRepository.count({ where: { isEmailVerified: true } });

    // Usuários registrados hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await this.usersRepository.count({
      where: {
        createdAt: Not(IsNull()),
      },
    });

    return {
      totalUsers,
      onlineUsers,
      bannedUsers,
      verifiedUsers,
      newUsersToday,
    };
  }

  /**
   * Exclui completamente um usuário e todos os dados relacionados
   */
  async deleteUser(userId: number): Promise<{ message: string; deletedCounts: any }> {
    console.log(`🗑️ [deleteUser] Iniciando exclusão do usuário ${userId}...`);
    
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Não permitir excluir ADMIN ou MASTER
    if (user.role === UserRole.ADMIN || user.role === UserRole.MASTER) {
      throw new Error('Não é possível excluir usuários ADMIN ou MASTER');
    }

    const deletedCounts: any = {};

    // Excluir em ordem (respeitando dependências)
    try {
      // 0. Desconectar o usuário do WebSocket antes de excluir
      try {
        // Marcar como offline
        await this.usersRepository.update({ id: userId }, { isOnline: false });
        console.log(`🔌 [deleteUser] Usuário ${userId} desconectado do sistema`);
      } catch (wsError) {
        console.warn(`⚠️ [deleteUser] Erro ao desconectar usuário ${userId} do WebSocket:`, wsError);
      }

      // 1. Histórico de duelos (duel_history) - excluir antes dos duelos
      const duelHistoryAsPlayer = await this.duelHistoryRepository.find({ where: { playerId: userId } });
      const duelHistoryAsOpponent = await this.duelHistoryRepository.find({ where: { opponentId: userId } });
      deletedCounts.duelHistory = duelHistoryAsPlayer.length + duelHistoryAsOpponent.length;
      if (duelHistoryAsPlayer.length > 0) {
        await this.duelHistoryRepository.delete({ playerId: userId });
      }
      if (duelHistoryAsOpponent.length > 0) {
        await this.duelHistoryRepository.delete({ opponentId: userId });
      }

      // 2. Duelos ativos - deletar duelos onde o usuário é player1 ou player2
      const activeDuelsAsPlayer1 = await this.duelsRepository.find({ 
        where: { player1Id: userId, status: Not(DuelStatus.FINISHED) } 
      });
      const activeDuelsAsPlayer2 = await this.duelsRepository.find({ 
        where: { player2Id: userId, status: Not(DuelStatus.FINISHED) } 
      });
      const allActiveDuels = [...activeDuelsAsPlayer1, ...activeDuelsAsPlayer2];
      deletedCounts.activeDuels = allActiveDuels.length;
      if (allActiveDuels.length > 0) {
        await this.duelsRepository.delete(allActiveDuels.map(d => d.id));
      }

      // 3. Duelos finalizados - atualizar referências para null
      const finishedDuelsAsPlayer1 = await this.duelsRepository.find({ 
        where: { player1Id: userId, status: DuelStatus.FINISHED } 
      });
      const finishedDuelsAsPlayer2 = await this.duelsRepository.find({ 
        where: { player2Id: userId, status: DuelStatus.FINISHED } 
      });
      const finishedDuelsAsWinner = await this.duelsRepository.find({ 
        where: { winnerId: userId } 
      });
      deletedCounts.finishedDuels = finishedDuelsAsPlayer1.length + finishedDuelsAsPlayer2.length + finishedDuelsAsWinner.length;
      
      if (finishedDuelsAsPlayer1.length > 0) {
        await this.duelsRepository.update(
          { id: In(finishedDuelsAsPlayer1.map(d => d.id)) },
          { player1Id: null as any }
        );
      }
      if (finishedDuelsAsPlayer2.length > 0) {
        await this.duelsRepository.update(
          { id: In(finishedDuelsAsPlayer2.map(d => d.id)) },
          { player2Id: null as any }
        );
      }
      if (finishedDuelsAsWinner.length > 0) {
        await this.duelsRepository.update(
          { id: In(finishedDuelsAsWinner.map(d => d.id)) },
          { winnerId: null as any }
        );
      }

      // 4. Logs de duelo
      const duelLogs = await this.duelLogsRepository
        .createQueryBuilder('log')
        .leftJoinAndSelect('log.user', 'user')
        .where('user.id = :userId', { userId })
        .getMany();
      deletedCounts.duelLogs = duelLogs.length;
      if (duelLogs.length > 0) {
        await this.duelLogsRepository.delete(duelLogs.map(log => log.id));
      }

      // 5. Cartas do usuário (user_cards)
      const userCards = await this.userCardsRepository.find({ where: { userId } });
      deletedCounts.userCards = userCards.length;
      await this.userCardsRepository.delete({ userId });

      // 6. Decks do usuário (deck_cards serão deletados automaticamente via CASCADE)
      const decks = await this.decksRepository.find({ where: { userId } });
      deletedCounts.decks = decks.length;
      await this.decksRepository.delete({ userId });

      // 7. Transações do usuário
      const transactions = await this.transactionsRepository.find({ where: { userId } });
      deletedCounts.transactions = transactions.length;
      await this.transactionsRepository.delete({ userId });

      // 8. Rankings de temporada
      const seasonRankings = await this.seasonRankingsRepository.find({ where: { userId } });
      deletedCounts.seasonRankings = seasonRankings.length;
      await this.seasonRankingsRepository.delete({ userId });

      // 9. Mensagens privadas (enviadas e recebidas)
      const sentMessages = await this.privateMessagesRepository
        .createQueryBuilder('pm')
        .where('pm.sender_id = :userId', { userId })
        .getMany();
      const receivedMessages = await this.privateMessagesRepository
        .createQueryBuilder('pm')
        .where('pm.receiver_id = :userId', { userId })
        .getMany();
      deletedCounts.privateMessages = sentMessages.length + receivedMessages.length;
      await this.privateMessagesRepository
        .createQueryBuilder()
        .delete()
        .where('sender_id = :userId OR receiver_id = :userId', { userId })
        .execute();

      // 10. Amizades (como usuário e como amigo)
      const friendshipsAsUser = await this.friendshipsRepository.find({ where: { userId } });
      const friendshipsAsFriend = await this.friendshipsRepository.find({ where: { friendId: userId } });
      deletedCounts.friendships = friendshipsAsUser.length + friendshipsAsFriend.length;
      await this.friendshipsRepository.delete({ userId });
      await this.friendshipsRepository.delete({ friendId: userId });

      // 11. Membros de grupos
      const groupMembers = await this.groupMembersRepository.find({ where: { userId } });
      deletedCounts.groupMembers = groupMembers.length;
      await this.groupMembersRepository.delete({ userId });

      // 12. Se o usuário for líder de um grupo, transferir liderança ou excluir grupo
      const groupsAsLeader = await this.groupsRepository.find({ where: { leaderId: userId } });
      for (const group of groupsAsLeader) {
        // Buscar outro membro para ser líder, ou excluir o grupo se não houver
        const otherMembers = await this.groupMembersRepository.find({ 
          where: { groupId: group.id },
          take: 1 
        });
        if (otherMembers.length > 0) {
          group.leaderId = otherMembers[0].userId;
          await this.groupsRepository.save(group);
          console.log(`🔄 [deleteUser] Liderança do grupo ${group.id} transferida para usuário ${otherMembers[0].userId}`);
        } else {
          await this.groupsRepository.delete({ id: group.id });
          console.log(`🗑️ [deleteUser] Grupo ${group.id} excluído (sem outros membros)`);
        }
      }
      deletedCounts.groupsLed = groupsAsLeader.length;

      // 13. Participações em torneios
      const tournamentParticipants = await this.tournamentParticipantsRepository.find({ where: { userId } });
      deletedCounts.tournamentParticipants = tournamentParticipants.length;
      await this.tournamentParticipantsRepository.delete({ userId });

      // 14. Partidas de torneio (como player1, player2 ou winner)
      const matchesAsPlayer1 = await this.tournamentMatchesRepository.find({ where: { player1Id: userId } });
      const matchesAsPlayer2 = await this.tournamentMatchesRepository.find({ where: { player2Id: userId } });
      const matchesAsWinner = await this.tournamentMatchesRepository.find({ where: { winnerId: userId } });
      deletedCounts.tournamentMatches = matchesAsPlayer1.length + matchesAsPlayer2.length + matchesAsWinner.length;
      
      if (matchesAsPlayer1.length > 0) {
        await this.tournamentMatchesRepository.update(
          { id: In(matchesAsPlayer1.map(m => m.id)) },
          { player1Id: null as any }
        );
      }
      if (matchesAsPlayer2.length > 0) {
        await this.tournamentMatchesRepository.update(
          { id: In(matchesAsPlayer2.map(m => m.id)) },
          { player2Id: null as any }
        );
      }
      if (matchesAsWinner.length > 0) {
        await this.tournamentMatchesRepository.update(
          { id: In(matchesAsWinner.map(m => m.id)) },
          { winnerId: null as any }
        );
      }

      // 15. Torneios criados pelo usuário
      const tournamentsCreated = await this.tournamentsRepository
        .createQueryBuilder('tournament')
        .where('tournament.createdBy = :userId', { userId })
        .getMany();
      deletedCounts.tournamentsCreated = tournamentsCreated.length;
      // Nota: Torneios não são deletados, apenas contados (createdBy pode não ser nullable)

      // 16. Notícias criadas pelo usuário
      const newsCreated = await this.newsRepository.find({ where: { authorId: userId } });
      deletedCounts.newsCreated = newsCreated.length;
      if (newsCreated.length > 0) {
        await this.newsRepository.delete(newsCreated.map(n => n.id));
      }

      // 17. Limpar dados do Redis
      try {
        await this.redisService.getClient().del(`user:${userId}:session`);
        await this.redisService.getClient().del(`user:${userId}:ip_history`);
        console.log(`🗑️ [deleteUser] Dados do Redis limpos para usuário ${userId}`);
      } catch (redisError) {
        console.warn(`⚠️ [deleteUser] Erro ao limpar dados do Redis:`, redisError);
      }

      // 18. Finalmente, excluir o usuário
      await this.usersRepository.delete({ id: userId });
      console.log(`✅ [deleteUser] Usuário ${userId} excluído com sucesso`);

      return {
        message: 'Usuário e todos os dados relacionados foram excluídos com sucesso',
        deletedCounts,
      };
    } catch (error) {
      console.error(`❌ [deleteUser] Erro ao excluir usuário ${userId}:`, error);
      console.error(`❌ [deleteUser] Stack trace:`, error.stack);
      throw new Error(`Erro ao excluir usuário: ${error.message}`);
    }
  }

  // Gerenciamento de Abas do Site
  async getSiteTabs(): Promise<SiteTab[]> {
    return this.siteTabsRepository.find({
      order: { order: 'ASC' },
    });
  }

  async getActiveSiteTabs(): Promise<SiteTab[]> {
    return this.siteTabsRepository.find({
      where: { isActive: true },
      order: { order: 'ASC' },
    });
  }

  async updateSiteTab(key: string, isActive: boolean): Promise<SiteTab> {
    const tab = await this.siteTabsRepository.findOne({ where: { key } });
    if (!tab) {
      throw new Error(`Aba com key "${key}" não encontrada`);
    }
    tab.isActive = isActive;
    return this.siteTabsRepository.save(tab);
  }

  async updateSiteTabIcon(key: string, icon: string): Promise<SiteTab> {
    const tab = await this.siteTabsRepository.findOne({ where: { key } });
    if (!tab) {
      throw new Error(`Aba com key "${key}" não encontrada`);
    }
    tab.icon = icon;
    return this.siteTabsRepository.save(tab);
  }

  async initializeSiteTabs(): Promise<void> {
    // Verificar e alterar o tipo da coluna icon se necessário
    try {
      const columnInfo = await this.siteTabsRepository.query(`
        SELECT character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'site_tabs' AND column_name = 'icon'
      `);
      
      if (columnInfo.length > 0 && columnInfo[0].character_maximum_length === 10) {
        console.log('🔧 [AdminService] Alterando tipo da coluna icon de VARCHAR(10) para VARCHAR(255)...');
        await this.siteTabsRepository.query(`
          ALTER TABLE "site_tabs" 
          ALTER COLUMN "icon" TYPE VARCHAR(255)
        `);
        console.log('✅ [AdminService] Coluna icon alterada com sucesso');
      }
    } catch (error) {
      console.warn('⚠️ [AdminService] Erro ao verificar/alterar coluna icon (pode já estar correta):', error);
    }

    const defaultTabs = [
      { key: 'home', label: 'Home', route: '/', icon: '/images/Icones/Home.png', order: 0, isActive: true },
      { key: 'chat', label: 'Chat', route: '/chat', icon: '/images/Icones/Chat.png', order: 1, isActive: true },
      { key: 'random-duel', label: 'Random Duel', route: '/random-duel', icon: '/images/Icones/Random Duel.png', order: 2, isActive: true },
      { key: 'arena', label: 'Arena', route: '/arena', icon: '⚔', order: 3, isActive: true },
      { key: 'tournaments', label: 'Torneios', route: '/tournaments', icon: '/images/Icones/Torneio.png', order: 4, isActive: true },
      { key: 'groups', label: 'Clãs', route: '/groups', icon: '/images/Icones/Cla.png', order: 5, isActive: true },
      { key: 'ranking', label: 'Ranking', route: '/ranking', icon: '/images/Icones/Ranking.png', order: 6, isActive: true },
      { key: 'missions', label: 'Missões', route: '/missions', icon: '✦', order: 7, isActive: true },
      { key: 'drops', label: 'Drops', route: '/drops', icon: '✨', order: 8, isActive: true },
      { key: 'shop', label: 'Loja', route: '/shop', icon: '🛍', order: 9, isActive: true },
      { key: 'marketplace-accounts', label: 'Contas', route: '/marketplace/accounts', icon: '👤', order: 10, isActive: true },
      { key: 'marketplace-cards', label: 'Cartas', route: '/marketplace/cards', icon: '🃏', order: 11, isActive: true },
    ];

    for (const tabData of defaultTabs) {
      const existingTab = await this.siteTabsRepository.findOne({ where: { key: tabData.key } });
      if (!existingTab) {
        const tab = this.siteTabsRepository.create(tabData);
        await this.siteTabsRepository.save(tab);
      } else {
        // Atualizar ícone se já existir
        existingTab.icon = tabData.icon;
        await this.siteTabsRepository.save(existingTab);
      }
    }
  }

  /**
   * Reseta o deck do Admin: deleta todos os decks e aplica o deck inicial
   */
  async resetAdminDeck(): Promise<{ message: string; adminId: number; deletedDecks: number }> {
    // Buscar usuário Admin (por username "Admin" ou role ADMIN)
    let admin = await this.usersRepository.findOne({
      where: { username: 'Admin' },
    });

    // Se não encontrar por username, buscar por role ADMIN
    if (!admin) {
      admin = await this.usersRepository.findOne({
        where: { role: UserRole.ADMIN },
      });
    }

    if (!admin) {
      throw new Error('Usuário Admin não encontrado');
    }

    console.log(`🔧 [resetAdminDeck] Resetando deck do Admin (ID: ${admin.id}, username: ${admin.username})`);

    // Buscar todos os decks do Admin
    const adminDecks = await this.decksRepository.find({
      where: { userId: admin.id },
    });

    console.log(`🗑️ [resetAdminDeck] Encontrados ${adminDecks.length} decks para deletar`);

    // Deletar todas as cartas dos decks primeiro (CASCADE deve fazer isso, mas vamos garantir)
    for (const deck of adminDecks) {
      await this.deckCardsRepository.delete({ deckId: deck.id });
    }

    // Deletar todos os decks do Admin
    const deleteResult = await this.decksRepository.delete({ userId: admin.id });
    const deletedCount = deleteResult.affected || 0;

    console.log(`✅ [resetAdminDeck] ${deletedCount} decks deletados`);

    // Limpar equippedDeckName do usuário
    await this.usersRepository.update(admin.id, { equippedDeckName: null });

    // Aplicar deck inicial
    console.log(`🎴 [resetAdminDeck] Aplicando deck inicial ao Admin...`);
    await this.initialDecksService.assignDeckToUser(admin.id);

    console.log(`✅ [resetAdminDeck] Deck inicial aplicado com sucesso ao Admin`);

    return {
      message: 'Deck do Admin resetado com sucesso. Deck inicial aplicado.',
      adminId: admin.id,
      deletedDecks: deletedCount,
    };
  }

  // Enviar mensagem do sistema para todos os usuários
  async broadcastMessage(content: string) {
    if (!content || !content.trim()) {
      throw new Error('Conteúdo da mensagem não pode estar vazio');
    }

    if (!this.friendsGateway) {
      throw new Error('FriendsGateway não está disponível para broadcast.');
    }

    // Buscar todos os usuários (exceto admins, se necessário)
    const allUsers = await this.usersRepository.find({
      where: {
        isBanned: false,
      },
      select: ['id'],
    });

    let sentCount = 0;

    // Enviar mensagem do sistema para cada usuário via WebSocket
    for (const user of allUsers) {
      try {
        // Formatar mensagem do sistema para WebSocket
        const systemMessageData = {
          id: `system-${Date.now()}-${user.id}`,
          type: 'system',
          content: content.trim(),
          createdAt: new Date().toISOString(),
        };

        // Enviar via WebSocket como mensagem do sistema
        this.friendsGateway.emitSystemMessage(user.id, systemMessageData);
        sentCount++;
      } catch (error) {
        console.error(`Erro ao enviar mensagem do sistema para usuário ${user.id}:`, error);
        // Continuar com os outros usuários mesmo se um falhar
      }
    }

    return {
      message: 'Mensagem do sistema enviada com sucesso',
      sentCount,
      totalUsers: allUsers.length,
    };
  }

  // Buscar usuários por ID ou nickname
  private async findUsersByIdentifiers(identifiers: string[]): Promise<number[]> {
    const userIds: number[] = [];
    const nicknames: string[] = [];

    // Separar IDs numéricos de nicknames
    for (const identifier of identifiers) {
      const trimmed = identifier.trim();
      const numericId = parseInt(trimmed, 10);
      if (!isNaN(numericId)) {
        userIds.push(numericId);
      } else {
        nicknames.push(trimmed);
      }
    }

    // Buscar usuários por ID
    const usersById = userIds.length > 0
      ? await this.usersRepository.find({
          where: { id: In(userIds) },
          select: ['id'],
        })
      : [];

    // Buscar usuários por nickname
    const usersByNickname = nicknames.length > 0
      ? await this.usersRepository.find({
          where: { nickname: In(nicknames) },
          select: ['id'],
        })
      : [];

    // Combinar todos os IDs encontrados
    const allUserIds = [
      ...usersById.map(u => u.id),
      ...usersByNickname.map(u => u.id),
    ];

    return allUserIds;
  }

  // Enviar conquista para usuário(s)
  async sendAchievement(
    identifiers: string[], // Pode ser IDs ou nicknames
    title: string,
    description: string,
    imagePath?: string,
    type?: AchievementType
  ): Promise<{ sentCount: number; achievements: Achievement[] }> {
    if (!title || !title.trim()) {
      throw new Error('Título da conquista é obrigatório');
    }

    if (identifiers.length === 0) {
      throw new Error('É necessário selecionar pelo menos um usuário');
    }

    // Buscar usuários por ID ou nickname
    const userIds = await this.findUsersByIdentifiers(identifiers);

    if (userIds.length === 0) {
      throw new Error('Nenhum usuário foi encontrado com os identificadores fornecidos');
    }

    if (userIds.length !== identifiers.length) {
      throw new Error('Um ou mais usuários não foram encontrados');
    }

    const achievements: Achievement[] = [];
    let sentCount = 0;

    for (const userId of userIds) {
      try {
        // Criar objeto de dados com propriedades explícitas (usando undefined em vez de null)
        const achievementInput: {
          userId: number;
          title: string;
          description?: string;
          icon?: string;
          type: AchievementType;
        } = {
          userId: userId,
          title: title.trim(),
          description: description?.trim() || undefined,
          icon: imagePath || undefined,
          type: type || AchievementType.VICTORIES,
        };
        
        // Usar create com o objeto tipado
        const achievementData = this.achievementsRepository.create(achievementInput);
        
        // Salvar a conquista (create retorna Achievement quando passado um objeto único)
        const savedAchievement = await this.achievementsRepository.save(achievementData);
        
        // save retorna Achievement quando passado uma única entidade
        if (Array.isArray(savedAchievement)) {
          achievements.push(...savedAchievement);
        } else {
          achievements.push(savedAchievement);
        }
        sentCount++;
      } catch (error) {
        console.error(`Erro ao enviar conquista para usuário ${userId}:`, error);
      }
    }

    return {
      sentCount,
      achievements,
    };
  }

  // ==================== DIVISÕES ====================

  async getAllDivisions(): Promise<Division[]> {
    return this.divisionsRepository.find({
      order: { order: 'ASC' },
    });
  }

  async getAvailableDivisions(): Promise<Division[]> {
    return this.divisionsRepository.find({
      where: { isAvailable: true },
      order: { order: 'DESC' }, // Ordem decrescente (maior order primeiro)
    });
  }

  async getDivisionById(id: string): Promise<Division> {
    const division = await this.divisionsRepository.findOne({ where: { id } });
    if (!division) {
      throw new Error('Divisão não encontrada');
    }
    return division;
  }

  async createDivision(divisionData: {
    name: string;
    order: number;
    maxDuelistas: number;
    sobe: number;
    desce: number;
    premiacao?: string;
    premiacaoJson?: any;
    isAvailable?: boolean;
  }): Promise<Division> {
    // Verificar se já existe uma divisão com essa ordem
    const existingDivision = await this.divisionsRepository.findOne({
      where: { order: divisionData.order },
    });
    if (existingDivision) {
      throw new Error(`Já existe uma divisão com a ordem ${divisionData.order}`);
    }

    const division = this.divisionsRepository.create(divisionData);
    return this.divisionsRepository.save(division);
  }

  async updateDivision(
    id: string,
    divisionData: {
      name?: string;
      order?: number;
      maxDuelistas?: number;
      sobe?: number;
      desce?: number;
      premiacao?: string;
      premiacaoJson?: any;
      isAvailable?: boolean;
    },
  ): Promise<Division> {
    const division = await this.divisionsRepository.findOne({ where: { id } });
    if (!division) {
      throw new Error('Divisão não encontrada');
    }

    // Se estiver atualizando a ordem, verificar se já existe outra divisão com essa ordem
    if (divisionData.order !== undefined && divisionData.order !== division.order) {
      const existingDivision = await this.divisionsRepository.findOne({
        where: { order: divisionData.order },
      });
      if (existingDivision && existingDivision.id !== id) {
        throw new Error(`Já existe uma divisão com a ordem ${divisionData.order}`);
      }
    }

    Object.assign(division, divisionData);
    return this.divisionsRepository.save(division);
  }

  async deleteDivision(id: string): Promise<void> {
    const division = await this.divisionsRepository.findOne({ where: { id } });
    if (!division) {
      throw new Error('Divisão não encontrada');
    }
    await this.divisionsRepository.remove(division);
  }

  /**
   * Busca a divisão mais baixa (menor order) que está disponível (isAvailable = true)
   * Retorna o nome da divisão (ex: "Bronze") ou "Bronze" como padrão se nenhuma estiver disponível
   */
  async getLowestAvailableDivision(): Promise<string> {
    const availableDivisions = await this.divisionsRepository.find({
      where: { isAvailable: true },
      order: { order: 'ASC' },
      take: 1,
    });

    if (availableDivisions.length > 0) {
      return availableDivisions[0].name;
    }

    // Se nenhuma divisão estiver disponível, retornar Bronze como padrão
    console.warn('⚠️ [getLowestAvailableDivision] Nenhuma divisão disponível, usando Bronze como padrão');
    return 'Bronze';
  }

  // Garantir que todos os usuários tenham ranking da season com divisão Bronze
  async ensureAllUsersHaveSeasonRanking(): Promise<{ created: number; updated: number; total: number }> {
    try {
      // Buscar season ativa
      let activeSeason = await this.seasonsRepository.findOne({
        where: { isActive: true },
        order: { createdAt: 'DESC' }
      });

      // Se não houver season ativa, buscar a mais recente
      if (!activeSeason) {
        activeSeason = await this.seasonsRepository.findOne({
          order: { createdAt: 'DESC' }
        });
      }

      if (!activeSeason) {
        throw new Error('Nenhuma season encontrada. Crie uma season primeiro.');
      }

      // Buscar todos os usuários
      const allUsers = await this.usersRepository.find({
        select: ['id']
      });

      let created = 0;
      let updated = 0;

      for (const user of allUsers) {
        // Verificar se já existe ranking
        const existingRanking = await this.seasonRankingsRepository.findOne({
          where: {
            seasonId: activeSeason.id,
            userId: user.id
          }
        });

        if (existingRanking) {
          // Atualizar divisão para Bronze se não estiver
          if (existingRanking.division !== DivisionEnum.BRONZE) {
            existingRanking.division = DivisionEnum.BRONZE;
            await this.seasonRankingsRepository.save(existingRanking);
            updated++;
          }
        } else {
          // Criar novo ranking com divisão Bronze
          const newRanking = this.seasonRankingsRepository.create({
            seasonId: activeSeason.id,
            userId: user.id,
            seasonScore: 0,
            wins: 0,
            losses: 0,
            division: DivisionEnum.BRONZE,
            divisionPoints: 0,
            rank: 0
          });
          await this.seasonRankingsRepository.save(newRanking);
          created++;
        }
      }

      return {
        created,
        updated,
        total: allUsers.length
      };
    } catch (error: any) {
      console.error('❌ [ensureAllUsersHaveSeasonRanking] Erro:', error);
      throw new Error(`Erro ao garantir rankings da season: ${error.message}`);
    }
  }

  // ==================== REDES SOCIAIS ====================

  async getAllSocialMedia(): Promise<SocialMedia[]> {
    return await this.socialMediaRepository.find({
      order: { order: 'ASC', createdAt: 'ASC' }
    });
  }

  async getActiveSocialMedia(): Promise<SocialMedia[]> {
    return await this.socialMediaRepository.find({
      where: { isActive: true },
      order: { order: 'ASC', createdAt: 'ASC' }
    });
  }

  async createSocialMedia(data: {
    platform: string;
    url: string;
    label?: string;
    icon?: string;
    order?: number;
    isActive?: boolean;
  }): Promise<SocialMedia> {
    const socialMedia = this.socialMediaRepository.create({
      platform: data.platform,
      url: data.url,
      label: data.label || null,
      icon: data.icon || null,
      order: data.order || 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
    });

    return await this.socialMediaRepository.save(socialMedia);
  }

  async updateSocialMedia(
    id: string,
    data: {
      platform?: string;
      url?: string;
      label?: string;
      icon?: string;
      order?: number;
      isActive?: boolean;
    }
  ): Promise<SocialMedia> {
    const socialMedia = await this.socialMediaRepository.findOne({ where: { id } });
    if (!socialMedia) {
      throw new Error('Rede social não encontrada');
    }

    if (data.platform !== undefined) socialMedia.platform = data.platform;
    if (data.url !== undefined) socialMedia.url = data.url;
    if (data.label !== undefined) socialMedia.label = data.label;
    if (data.icon !== undefined) socialMedia.icon = data.icon;
    if (data.order !== undefined) socialMedia.order = data.order;
    if (data.isActive !== undefined) socialMedia.isActive = data.isActive;

    return await this.socialMediaRepository.save(socialMedia);
  }

  async deleteSocialMedia(id: string): Promise<void> {
    const socialMedia = await this.socialMediaRepository.findOne({ where: { id } });
    if (!socialMedia) {
      throw new Error('Rede social não encontrada');
    }
    await this.socialMediaRepository.remove(socialMedia);
  }

  // ========== NEW ACCOUNT SETTINGS ==========

  async getNewAccountSettings() {
    return this.newAccountSettingsService.getSettings();
  }

  async updateNewAccountSettings(data: {
    initialCredits?: number;
    initialCash?: number;
    availableInitialDeckIds?: string[];
    defaultPlaymatId?: string | null;
    defaultSkinId?: string | null;
  }) {
    return this.newAccountSettingsService.updateSettings(data);
  }

  // ========== RESET COMPLETO DO SISTEMA ==========

  /**
   * ⚠️ PERIGOSO: Reseta contas conforme opções selecionadas
   * Opções: scoreSeason, scoreGeral, cartas (deck inicial), conquistas, scoreGeralGrupo, scoreSeasonGrupo
   */
  async resetAllAccounts(confirmationCode: string, options: {
    resetScoreSeason: boolean;
    resetScoreGeral: boolean;
    resetCartas: boolean;
    resetCreditsCash: boolean;
    resetConquistas: boolean;
    resetScoreGeralGrupo: boolean;
    resetScoreSeasonGrupo: boolean;
  }): Promise<{
    message: string;
    usersReset: number;
    cardsDeleted: number;
    decksDeleted: number;
    achievementsDeleted: number;
    groupsUpdated: number;
  }> {
    if (confirmationCode !== 'RESET_ALL_ACCOUNTS_CONFIRM') {
      throw new Error('Código de confirmação inválido');
    }

    const hasAny = Object.values(options).some(Boolean);
    if (!hasAny) {
      throw new Error('Selecione pelo menos uma opção de reset');
    }

    const newAccountSettings = await this.newAccountSettingsService.getSettings();
    const initialCredits = newAccountSettings.initialCredits || 50;
    const initialCash = newAccountSettings.initialCash || 50000;
    const availableDeckIds = newAccountSettings.availableInitialDeckIds || [];

    const availableDivisions = await this.divisionsRepository.find({
      where: { isAvailable: true },
      order: { order: 'ASC' },
      take: 1,
    });
    const lowestDivision = availableDivisions.length > 0 ? availableDivisions[0].name : 'Bronze';

    const queryRunner = this.usersRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let cardsDeleted = 0;
    let decksDeleted = 0;
    let achievementsDeleted = 0;
    let groupsUpdated = 0;
    let playerIds: number[] = [];

    try {
      await queryRunner.query('SET LOCAL statement_timeout = 300000');

      // Resetar todas as contas (PLAYER, ADMIN e MASTER)
      const allUsers = await queryRunner.manager.find(User, {
        where: { role: In([UserRole.PLAYER, UserRole.ADMIN, UserRole.MASTER]) },
        select: ['id'],
      });
      playerIds = allUsers.map((u) => u.id);
      if (playerIds.length === 0) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return {
          message: 'Nenhuma conta (PLAYER/ADMIN/MASTER) encontrada para reset',
          usersReset: 0,
          cardsDeleted: 0,
          decksDeleted: 0,
          achievementsDeleted: 0,
          groupsUpdated: 0,
        };
      }

      if (options.resetCartas) {
        const deletedCards = await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(UserCard)
          .where('userId IN (:...ids)', { ids: playerIds })
          .execute();
        cardsDeleted = deletedCards.affected || 0;

        const deletedDecks = await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Deck)
          .where('userId IN (:...ids)', { ids: playerIds })
          .execute();
        decksDeleted = deletedDecks.affected || 0;
      }

      if (options.resetConquistas) {
        const deletedAchievements = await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Achievement)
          .where('userId IN (:...ids)', { ids: playerIds })
          .execute();
        achievementsDeleted = deletedAchievements.affected || 0;
      }

      const userSet: Record<string, unknown> = {};
      if (options.resetScoreSeason) {
        userSet.winsSeason = 0;
        userSet.lossesSeason = 0;
      }
      if (options.resetScoreGeral) {
        userSet.totalScore = 0;
        userSet.winsGeral = 0;
        userSet.lossesGeral = 0;
        userSet.level = 1;
        userSet.division = lowestDivision;
      }
      if (options.resetCartas || options.resetCreditsCash) {
        userSet.credits = initialCredits;
        userSet.cash = initialCash;
      }
      if (options.resetCartas) {
        userSet.equippedDeckName = null;
      }
      if (Object.keys(userSet).length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(User)
          .set(userSet)
          .where('id IN (:...ids)', { ids: playerIds })
          .execute();
      }

      if (options.resetScoreSeason) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(SeasonRanking)
          .set({
            wins: 0,
            losses: 0,
            seasonScore: 0,
            rank: 0,
            divisionPoints: 0,
          })
          .execute();
      }

      if (options.resetScoreGeralGrupo || options.resetScoreSeasonGrupo) {
        const groupSet: Record<string, unknown> = {};
        if (options.resetScoreGeralGrupo) {
          groupSet.totalScore = 0;
          groupSet.totalWins = 0;
          groupSet.totalLosses = 0;
        }
        if (options.resetScoreSeasonGrupo) {
          groupSet.seasonScore = 0;
        }
        if (Object.keys(groupSet).length > 0) {
          const qb = queryRunner.manager.createQueryBuilder().update(Group).set(groupSet);
          const res = await qb.execute();
          groupsUpdated = res.affected || 0;
        }
        if (options.resetScoreGeralGrupo || options.resetScoreSeasonGrupo) {
          const memberSet: Record<string, unknown> = {};
          if (options.resetScoreGeralGrupo) {
            memberSet.totalScore = 0;
            memberSet.contributedWins = 0;
            memberSet.contributedLosses = 0;
          }
          if (options.resetScoreSeasonGrupo) {
            memberSet.seasonScore = 0;
          }
          if (Object.keys(memberSet).length > 0) {
            await queryRunner.manager
              .createQueryBuilder()
              .update(GroupMember)
              .set(memberSet)
              .execute();
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (options.resetCartas && playerIds.length > 0) {
      for (const userId of playerIds) {
        try {
          await this.initialDecksService.assignDeckToUser(
            userId,
            availableDeckIds.length > 0 ? availableDeckIds : undefined,
          );
        } catch (err) {
          // ignorar se não houver deck inicial
        }
      }
    }

    return {
      message: 'Reset realizado com sucesso conforme opções selecionadas',
      usersReset: playerIds.length,
      cardsDeleted,
      decksDeleted,
      achievementsDeleted,
      groupsUpdated,
    };
  }
}
