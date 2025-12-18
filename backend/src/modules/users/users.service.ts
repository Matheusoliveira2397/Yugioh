import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { SeasonRanking } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Group } from '../groups/entities/group.entity';

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
    @InjectRepository(Group)
    private groupRepository: Repository<Group>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findById(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ 
      where: { id },
      select: ['id', 'nickname', 'username', 'email', 'password', 'role', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'rating', 'credits', 'cash', 'level', 'experience', 'totalScore', 'profileImage', 'isOnline', 'isBanned', 'banReason', 'lastLogin', 'lastIpAddress', 'avatar', 'isEmailVerified', 'clanTag', 'biography', 'playerClass', 'createdAt', 'updatedAt']
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { username },
      select: ['id', 'nickname', 'username', 'email', 'password', 'role', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'rating', 'credits', 'cash', 'level', 'experience', 'totalScore', 'profileImage', 'isOnline', 'isBanned', 'banReason', 'lastLogin', 'lastIpAddress', 'avatar', 'isEmailVerified', 'clanTag', 'biography', 'playerClass', 'createdAt', 'updatedAt']
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { email },
      select: ['id', 'nickname', 'username', 'email', 'password', 'role', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'rating', 'credits', 'cash', 'level', 'experience', 'totalScore', 'profileImage', 'isOnline', 'isBanned', 'banReason', 'lastLogin', 'lastIpAddress', 'avatar', 'isEmailVerified', 'clanTag', 'biography', 'playerClass', 'createdAt', 'updatedAt']
    });
  }

  async findByNickname(nickname: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { nickname },
      select: ['id', 'nickname', 'username', 'email', 'password', 'role', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'rating', 'credits', 'cash', 'level', 'experience', 'totalScore', 'profileImage', 'isOnline', 'isBanned', 'banReason', 'lastLogin', 'lastIpAddress', 'avatar', 'isEmailVerified', 'clanTag', 'biography', 'playerClass', 'createdAt', 'updatedAt']
    });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    // Sistema de verificação de email desativado
    return null;
  }

  async verifyEmail(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      isEmailVerified: true,
    });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'username', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'rating'],
      order: { rating: 'DESC' },
    });
  }

  async update(userId: number, stats: Partial<User>): Promise<void> {
    await this.usersRepository.update(userId, stats);
  }

  async updateStats(userId: number, stats: Partial<User>): Promise<User> {
    await this.usersRepository.update(userId, stats);
    return this.findById(userId);
  }

  async updateProfileImage(userId: number, profileImage: string): Promise<User> {
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
      select: {
        id: true,
        seasonId: true,
        userId: true,
        seasonScore: true,
        wins: true,
        losses: true,
        rank: true,
        division: true,
        trophy: true,
        user: {
          id: true,
          nickname: true,
          clanTag: true,
          profileImage: true,
          totalScore: true,
          level: true,
        },
      },
      order: { seasonScore: 'DESC' },
      take: 100,
    });

    // Busca os grupos dos usuários - usar QueryBuilder para evitar problemas
    const userIds = rankings.map(r => r.userId);
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
            .addSelect('g.isActive', 'isActive')
            .where('g.id IN (:...groupIds)', { groupIds })
            .andWhere('g.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, isActive: g.isActive }]));
          groupMembers.forEach(gm => {
            const group = groupsMap.get(gm.groupId);
            if (group) {
              groupMap.set(gm.userId, group);
            }
          });
        }
      } catch (error) {
        console.error('❌ [getSeasonRanking] Erro ao carregar grupos:', error);
        groupMap = new Map();
      }
    }

    // Formata os dados para o frontend
    return rankings.map(ranking => {
      const group = groupMap.get(ranking.userId);
      const clanTag = ranking.user.clanTag || (group && group.isActive ? group.tag : null);
      console.log(`🔍 [getSeasonRanking] User ${ranking.user.id} (${ranking.user.nickname}): clanTag=${ranking.user.clanTag}, groupTag=${group?.tag}, finalClanTag=${clanTag}`);
      return {
        id: String(ranking.user.id),
        nickname: ranking.user.nickname,
        clanTag: clanTag,
        profileImage: ranking.user.profileImage,
        seasonScore: ranking.seasonScore,
        totalScore: ranking.user.totalScore,
        wins: ranking.wins,
        losses: ranking.losses,
        division: ranking.division,
        seasonRank: ranking.rank,
        group: group || null,
      };
    });
  }

  async getGeneralRanking(): Promise<any[]> {
    const users = await this.usersRepository.find({
      select: ['id', 'nickname', 'clanTag', 'profileImage', 'rating', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason', 'totalScore', 'level'],
      order: { rating: 'DESC' },
      take: 100,
    });

    // Busca os dados da season ativa para cada usuário
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
    });

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
            .addSelect('g.isActive', 'isActive')
            .where('g.id IN (:...groupIds)', { groupIds })
            .andWhere('g.isActive = :isActive', { isActive: true })
            .getRawMany();
          
          const groupsMap = new Map(groups.map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, isActive: g.isActive }]));
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
      return users.map(user => {
        const group = groupMap.get(user.id);
        return {
          id: String(user.id),
          nickname: user.nickname,
          clanTag: user.clanTag || (group && group.isActive ? group.tag : null),
          profileImage: user.profileImage,
          rating: user.rating,
          seasonScore: 0,
          totalScore: user.totalScore,
          wins: user.winsSeason,
          losses: user.lossesSeason,
          division: 'Bronze',
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
          rating: true,
          totalScore: true,
          level: true,
        },
      },
    });

    const rankingMap = new Map(rankings.map(r => [r.userId, r]));

    return users.map(user => {
      const seasonRanking = rankingMap.get(user.id);
      const group = groupMap.get(user.id);
      const clanTag = user.clanTag || (group && group.isActive ? group.tag : null);
      console.log(`🔍 [getGeneralRanking] User ${user.id} (${user.nickname}): clanTag=${user.clanTag}, groupTag=${group?.tag}, finalClanTag=${clanTag}`);
      return {
        id: String(user.id),
        nickname: user.nickname,
        clanTag: clanTag,
        profileImage: user.profileImage,
        rating: user.rating,
        seasonScore: seasonRanking?.seasonScore || 0,
        totalScore: user.totalScore,
        wins: seasonRanking?.wins || user.winsSeason,
        losses: seasonRanking?.losses || user.lossesSeason,
        division: seasonRanking?.division || 'Bronze',
        globalRank: 0, // Será calculado no frontend baseado na posição
        group: group || null,
      };
    });
  }

  // Método removido - sistema de coins foi desativado

  async getTop5Players(): Promise<any[]> {
    // Busca a season ativa
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
    });

    if (!activeSeason) {
      // Se não há season ativa, retorna top 5 por rating geral - usar QueryBuilder para evitar JOINs
      const users = await this.usersRepository
        .createQueryBuilder('u')
        .select('u.id', 'id')
        .addSelect('u.nickname', 'nickname')
        .addSelect('u.clanTag', 'clanTag')
        .addSelect('u.profileImage', 'profileImage')
        .addSelect('u.rating', 'rating')
        .addSelect('u.winsGeral', 'winsGeral')
        .addSelect('u.lossesGeral', 'lossesGeral')
        .addSelect('u.totalScore', 'totalScore')
        .orderBy('u.rating', 'DESC')
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
          profileImage: user.profileImage,
          rating: user.rating,
          wins: user.winsGeral,
          losses: user.lossesGeral,
          score: user.totalScore,
        };
      });
    }

    // Busca top 5 da season ativa - usar QueryBuilder para evitar JOINs automáticos
    const rankings = await this.seasonRankingRepository
      .createQueryBuilder('sr')
      .innerJoin('sr.user', 'u')
      .select('sr.id', 'id')
      .addSelect('sr.seasonId', 'seasonId')
      .addSelect('sr.userId', 'userId')
      .addSelect('sr.seasonScore', 'seasonScore')
      .addSelect('sr.wins', 'wins')
      .addSelect('sr.losses', 'losses')
      .addSelect('sr.rank', 'rank')
      .addSelect('sr.division', 'division')
      .addSelect('u.id', 'user_id')
      .addSelect('u.nickname', 'user_nickname')
      .addSelect('u.clanTag', 'user_clanTag')
      .addSelect('u.profileImage', 'user_profileImage')
      .addSelect('u.rating', 'user_rating')
      .addSelect('u.totalScore', 'user_totalScore')
      .addSelect('u.level', 'user_level')
      .where('sr.seasonId = :seasonId', { seasonId: activeSeason.id })
      .orderBy('sr.seasonScore', 'DESC')
      .limit(5)
      .getRawMany();

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
      console.log(`🔍 [getTop5Players] User ${ranking.user_id} (${ranking.user_nickname}): clanTag=${ranking.user_clanTag}, groupTag=${group?.tag}, finalClanTag=${clanTag}`);
      return {
        rank: index + 1,
        id: String(ranking.user_id),
        nickname: ranking.user_nickname,
        clanTag: clanTag,
        profileImage: ranking.user_profileImage,
        rating: ranking.user_rating,
        wins: ranking.wins,
        losses: ranking.losses,
        score: ranking.seasonScore,
        division: ranking.division,
      };
    });
  }

  // Calcular classe do jogador baseada no rating
  calculatePlayerClass(rating: number): string {
    if (rating >= 3000) return 'Lendário';
    if (rating >= 2500) return 'Mestre';
    if (rating >= 2000) return 'Veterano';
    if (rating >= 1500) return 'Aprendiz';
    if (rating >= 1000) return 'Novato';
    return 'Iniciante';
  }

  // Obter perfil completo do usuário com rankings
  async getFullProfile(userId: number): Promise<any> {
    const user = await this.findById(userId);
    
    // Buscar season ativa
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
    });

    let seasonRanking = null;
    let seasonRank = 0;
    let generalRank = 0;

    if (activeSeason) {
      seasonRanking = await this.seasonRankingRepository.findOne({
        where: { userId, seasonId: activeSeason.id },
      });

      if (seasonRanking) {
        // Calcular rank na season
        const countBetter = await this.seasonRankingRepository.count({
          where: {
            seasonId: activeSeason.id,
            seasonScore: MoreThan(seasonRanking.seasonScore),
          },
        });
        seasonRank = countBetter + 1;
      }
    }

    // Calcular rank geral
    const countBetterGeneral = await this.usersRepository.count({
      where: { rating: MoreThan(user.rating) },
    });
    generalRank = countBetterGeneral + 1;

    // Calcular classe
    const playerClass = this.calculatePlayerClass(user.rating);

    // Atualizar classe do usuário se necessário
    if (user.playerClass !== playerClass) {
      await this.usersRepository.update(userId, { playerClass });
      user.playerClass = playerClass;
    }

    // Buscar clã do usuário e validar se realmente está em um grupo ativo
    let clanTag = null;
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
          .addSelect('g.isActive', 'isActive')
          .where('g.id = :groupId', { groupId: groupMember.groupId })
          .andWhere('g.isActive = :isActive', { isActive: true })
          .getRawOne();
        
        if (group && group.isActive) {
          clanTag = group.tag ?? null;
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

    return {
      ...user,
      displayNick,
      playerClass,
      seasonRanking: seasonRanking ? {
        seasonScore: seasonRanking.seasonScore,
        wins: seasonRanking.wins,
        losses: seasonRanking.losses,
        division: seasonRanking.division,
        rank: seasonRank,
      } : null,
      generalRank,
    };
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

  // Atualizar email
  async updateEmail(userId: number, email: string): Promise<User> {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Email inválido.');
    }
    
    // Verificar se o email já está em uso por outro usuário
    const existingUser = await this.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('Este email já está em uso.');
    }
    
    await this.usersRepository.update(userId, { email: email.trim() });
    return this.findById(userId);
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
}
