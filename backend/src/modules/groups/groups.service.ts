import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
import { GroupRequest, GroupRequestStatus } from './entities/group-request.entity';
import { User } from '../users/entities/user.entity';
import { Achievement } from '../users/entities/achievement.entity';
import { UserSystemNotification } from '../users/entities/user-system-notification.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcryptjs';
import { SeasonsService } from '../seasons/seasons.service';
import { DuelsGateway } from '../duels/duels.gateway';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GroupsService implements OnModuleInit {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    @InjectRepository(Group)
    private groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private memberRepository: Repository<GroupMember>,
    @InjectRepository(GroupRequest)
    private requestRepository: Repository<GroupRequest>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Achievement)
    private achievementRepository: Repository<Achievement>,
    @InjectRepository(UserSystemNotification)
    private systemNotificationRepository: Repository<UserSystemNotification>,
    private seasonsService: SeasonsService,
    @Optional()
    @Inject(forwardRef(() => DuelsGateway))
    private duelsGateway: DuelsGateway | null,
  ) {}

  async onModuleInit() {
    // Verificar e adicionar colunas se não existirem
    try {
      console.log('🔧 [GroupsService] Verificando colunas da tabela groups...');
      
      // Verificar coluna banner
      const bannerExists = await this.groupRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'groups' AND column_name = 'banner'
      `);
      
      if (bannerExists.length === 0) {
        console.log('🔧 [GroupsService] Adicionando coluna banner...');
        await this.groupRepository.query(`
          ALTER TABLE groups ADD COLUMN IF NOT EXISTS "banner" VARCHAR(255) NULL
        `);
        console.log('✅ [GroupsService] Coluna banner adicionada');
      }

      // Verificar colunas de estatísticas
      const totalCashExists = await this.groupRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'groups' AND column_name = 'totalCash'
      `);
      
      if (totalCashExists.length === 0) {
        console.log('🔧 [GroupsService] Adicionando colunas de estatísticas...');
        await this.groupRepository.query(`
          ALTER TABLE groups 
          ADD COLUMN IF NOT EXISTS "totalCash" INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "credits" INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "totalWins" INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "totalLosses" INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "totalAchievements" INTEGER DEFAULT 0
        `);
        console.log('✅ [GroupsService] Colunas de estatísticas adicionadas');
      } else {
        // Verificar se a coluna credits existe
        const creditsExists = await this.groupRepository.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'groups' AND column_name = 'credits'
        `);
        
        if (creditsExists.length === 0) {
          console.log('🔧 [GroupsService] Adicionando coluna credits...');
          await this.groupRepository.query(`
            ALTER TABLE groups 
            ADD COLUMN IF NOT EXISTS "credits" INTEGER DEFAULT 0
          `);
          console.log('✅ [GroupsService] Coluna credits adicionada');
        }
      }

      // Verificar colunas seasonScore e level
      const seasonScoreExists = await this.groupRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'groups' AND column_name = 'seasonScore'
      `);
      
      if (seasonScoreExists.length === 0) {
        console.log('🔧 [GroupsService] Adicionando colunas seasonScore e level...');
        await this.groupRepository.query(`
          ALTER TABLE groups 
          ADD COLUMN IF NOT EXISTS "seasonScore" NUMERIC(10, 2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "level" INTEGER DEFAULT 1
        `);
        console.log('✅ [GroupsService] Colunas seasonScore e level adicionadas');
      }

      // Verificar colunas de divisão de cash
      const cashDivisionDayExists = await this.groupRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'groups' AND column_name = 'cashDivisionDayOfWeek'
      `);
      
      if (cashDivisionDayExists.length === 0) {
        console.log('🔧 [GroupsService] Adicionando colunas de divisão de cash...');
        await this.groupRepository.query(`
          ALTER TABLE groups 
          ADD COLUMN IF NOT EXISTS "cashDivisionDayOfWeek" INTEGER NULL,
          ADD COLUMN IF NOT EXISTS "cashDivisionTime" VARCHAR(10) NULL,
          ADD COLUMN IF NOT EXISTS "cashDivisionDefaultMembers" INTEGER NULL,
          ADD COLUMN IF NOT EXISTS "cashDivisionMembers" INTEGER NULL
        `);
        console.log('✅ [GroupsService] Colunas de divisão de cash adicionadas');
      }
      
      console.log('✅ [GroupsService] Verificação de colunas concluída');
    } catch (error: any) {
      console.error('⚠️ [GroupsService] Erro ao verificar colunas:', error.message);
    }
  }

  // Criar grupo
  async createGroup(userId: number, name: string, tag: string, description?: string, logo?: string, banner?: string): Promise<Group> {
    // Logo é obrigatória
    if (!logo) {
      throw new BadRequestException('A logo do clã é obrigatória');
    }

    // Validação da tag: deve ser obrigatória e ter exatamente 3 letras
    if (!tag || tag.trim().length === 0) {
      throw new BadRequestException('A tag do clã é obrigatória');
    }

    // Remover espaços e converter para maiúsculas
    const normalizedTag = tag.trim().toUpperCase();

    // Verificar se tem exatamente 3 letras
    if (normalizedTag.length !== 3) {
      throw new BadRequestException('A tag do clã deve ter exatamente 3 letras');
    }

    // Verificar se contém apenas letras (A–Z)
    const tagRegex = /^[A-Z]{3}$/;
    if (!tagRegex.test(normalizedTag)) {
      throw new BadRequestException('A tag do clã deve conter apenas 3 letras (A–Z)');
    }

    // Verifica se usuário já tem grupo ativo (membrosia em grupo com isActive = true)
    const existingMembership = await this.memberRepository.findOne({
      where: { userId, isActive: true },
      relations: ['group']
    });

    if (existingMembership) {
      const group = existingMembership.group ?? await this.groupRepository.findOne({ where: { id: existingMembership.groupId } });
      if (group?.isActive) {
        throw new BadRequestException('Você já pertence a um grupo');
      }
      // Grupo desativado: limpar membresia antiga para permitir criar novo
      await this.memberRepository.update(
        { userId, isActive: true },
        { isActive: false }
      );
      await this.userRepository.update(userId, { clanTag: null as any });
    }

    // Verifica se nome ou tag já existem
    const existingGroup = await this.groupRepository.findOne({
      where: [{ name }, { tag: normalizedTag }]
    });

    if (existingGroup) {
      throw new BadRequestException('Nome ou tag do grupo já existe');
    }

    const group = new Group();
    group.name = name;
    group.tag = normalizedTag;
    group.description = description ?? null;
    group.logo = logo; // Obrigatório
    group.banner = banner ?? null;
    group.leaderId = userId;
    group.isPublic = true;
    group.isActive = true;

    const savedGroup = await this.groupRepository.save(group);

    // Adiciona criador como líder
    // IMPORTANTE: totalScore começa em 0, independente do score que o usuário tinha antes
    const member = this.memberRepository.create({
      groupId: savedGroup.id,
      userId,
      role: GroupRole.LEADER,
      weeklyScore: 0,
      seasonScore: 0,
      totalScore: 0 // Sempre começa em 0 quando entra no clã
    });

    await this.memberRepository.save(member);
    console.log(`✅ [createGroup] Líder criado com totalScore inicial: 0`);
    
    // Recalcular estatísticas iniciais do grupo
    await this.recalculateGroupStats(savedGroup.id);

    // Atualizar clanTag do usuário no banco de dados
    console.log(`🏷️ [createGroup] Atualizando clanTag do usuário ${userId} para "${normalizedTag}"`);
    const updateResult = await this.userRepository.update(userId, { clanTag: normalizedTag });
    console.log(`✅ [createGroup] clanTag atualizado. Resultado:`, updateResult);
    
    // Verificar se foi salvo corretamente
    const updatedUser = await this.userRepository.findOne({ where: { id: userId } });
    console.log(`🔍 [createGroup] Verificação - clanTag do usuário após update:`, updatedUser?.clanTag);

    return savedGroup;
  }

  // Entrar em um grupo (ou criar solicitação se privado)
  async joinGroup(userId: number, groupId: string): Promise<GroupMember | GroupRequest> {
    this.logger.log(`🔍 [joinGroup] userId: ${userId}, groupId: ${groupId}`);
    
    // Validar se groupId é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(groupId)) {
      this.logger.warn(`⚠️ [joinGroup] ID do grupo inválido: ${groupId}`);
      throw new BadRequestException('ID do grupo inválido');
    }

    const group = await this.groupRepository.findOne({
      where: { id: groupId, isActive: true },
      relations: ['members'],
      select: {
        id: true,
        name: true,
        description: true,
        tag: true,
        logo: true,
        leaderId: true,
        totalScore: true,
        maxMembers: true,
        isPublic: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        members: {
          id: true,
          userId: true,
          role: true,
          isActive: true,
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Verifica se usuário já está em outro grupo ativo
    const existingActiveMembership = await this.memberRepository.findOne({
      where: { userId, isActive: true },
      relations: ['group']
    });

    if (existingActiveMembership) {
      const group = existingActiveMembership.group ?? await this.groupRepository.findOne({ where: { id: existingActiveMembership.groupId } });
      if (group?.isActive) {
        this.logger.warn(`⚠️ [joinGroup] Usuário ${userId} já pertence ao grupo ${existingActiveMembership.groupId}`);
        throw new BadRequestException('Você já pertence a um grupo');
      }
      // Grupo desativado: limpar membresia antiga para permitir entrar em outro
      await this.memberRepository.update(
        { userId, isActive: true },
        { isActive: false }
      );
      await this.userRepository.update(userId, { clanTag: null as any });
    }

    // Se o grupo for privado, criar solicitação
    if (!group.isPublic) {
      try {
        // Verificar se já existe uma solicitação (pendente, aceita ou rejeitada)
        const existingRequest = await this.requestRepository.findOne({
          where: { userId, groupId }
        });

        if (existingRequest) {
          // Se já existe uma solicitação pendente, retornar erro
          if (existingRequest.status === GroupRequestStatus.PENDING) {
            throw new BadRequestException('Você já tem uma solicitação pendente para este grupo');
          }
          
          // Se a solicitação foi rejeitada ou aceita anteriormente, reutilizar e resetar para PENDING
          existingRequest.status = GroupRequestStatus.PENDING;
          existingRequest.createdAt = new Date(); // Atualizar data de criação
          return await this.requestRepository.save(existingRequest);
        }

        // Criar nova solicitação
        const request = this.requestRepository.create({
          userId,
          groupId,
          status: GroupRequestStatus.PENDING,
        });

        return await this.requestRepository.save(request);
      } catch (error: any) {
        // Se a tabela não existir, informar para executar a migration
        if (error.message && error.message.includes('does not exist')) {
          this.logger.error('❌ Tabela group_requests não existe. Execute a migration: create-group-requests-table.sql');
          throw new BadRequestException('Sistema de solicitações não está disponível. Contate o administrador.');
        }
        throw error;
      }
    }

    if (group.members.filter(m => m.isActive).length >= group.maxMembers) {
      throw new BadRequestException('Grupo está cheio');
    }

    // Verificar se o usuário já foi membro deste grupo (mesmo que inativo)
    const existingMember = await this.memberRepository.findOne({
      where: { userId, groupId }
    });

    let member: GroupMember;
    
    if (existingMember) {
      // Reativar membro existente e resetar scores (começa do zero novamente)
      existingMember.isActive = true;
      existingMember.weeklyScore = 0;
      existingMember.seasonScore = 0;
      existingMember.totalScore = 0; // Resetar para 0 ao reentrar
      existingMember.role = GroupRole.MEMBER; // Resetar role para MEMBER
      member = existingMember;
      await this.memberRepository.save(member);
      console.log(`✅ [joinGroup] Membro reativado com totalScore resetado para 0`);
    } else {
      // Criar novo membro
      // IMPORTANTE: totalScore começa em 0, independente do score que o usuário tinha antes
      member = this.memberRepository.create({
        groupId: group.id,
        userId,
        role: GroupRole.MEMBER,
        weeklyScore: 0,
        seasonScore: 0,
        totalScore: 0, // Sempre começa em 0 quando entra no clã
        isActive: true // Garantir que está ativo
      });

      await this.memberRepository.save(member);
      console.log(`✅ [joinGroup] Membro criado com totalScore inicial: 0, isActive: ${member.isActive}`);
    }

    // Atualizar clanTag do usuário no banco de dados
    console.log(`🏷️ [joinGroup] Atualizando clanTag do usuário ${userId} para "${group.tag}"`);
    const updateResult = await this.userRepository.update(userId, { clanTag: group.tag });
    console.log(`✅ [joinGroup] clanTag atualizado. Resultado:`, updateResult);
    
    // Verificar se foi salvo corretamente
    const updatedUser = await this.userRepository.findOne({ where: { id: userId } });
    console.log(`🔍 [joinGroup] Verificação - clanTag do usuário após update:`, updatedUser?.clanTag);

    // Recalcular estatísticas do grupo
    await this.recalculateGroupStats(group.id);

    return member;
  }

  // Sair do grupo
  async leaveGroup(userId: number, groupId: string): Promise<void> {
    const member = await this.memberRepository.findOne({
      where: { userId, groupId, isActive: true },
      relations: ['group']
    });

    if (!member) {
      throw new NotFoundException('Você não é membro deste grupo');
    }

    if (member.role === GroupRole.LEADER) {
      throw new BadRequestException('Líder não pode sair. Transfira a liderança primeiro.');
    }

    member.isActive = false;
    await this.memberRepository.save(member);

    // Limpar clanTag do usuário
    await this.userRepository.update(userId, { clanTag: null as any });
    
    // Recalcular estatísticas do grupo
    await this.recalculateGroupStats(groupId);
  }

  // Verificar se usuário é membro do grupo
  async isMember(userId: number, groupId: string): Promise<boolean> {
    const member = await this.memberRepository.findOne({
      where: { userId, groupId, isActive: true }
    });
    return !!member;
  }

  // Verificar se usuário tem solicitação pendente
  async hasPendingRequest(userId: number, groupId: string): Promise<boolean> {
    // Validar se groupId é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(groupId)) {
      return false;
    }

    try {
      const request = await this.requestRepository.findOne({
        where: { userId, groupId, status: GroupRequestStatus.PENDING }
      });
      return !!request;
    } catch (error: any) {
      // Se a tabela não existir, retornar false
      if (error.message && error.message.includes('does not exist')) {
        this.logger.warn('⚠️ Tabela group_requests não existe ainda. Execute a migration.');
        return false;
      }
      throw error;
    }
  }

  // Listar solicitações pendentes de um grupo
  async getPendingRequests(groupId: string, userId: number): Promise<GroupRequest[]> {
    // Validar se groupId é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(groupId)) {
      throw new BadRequestException('ID do grupo inválido');
    }

    // Verificar se o usuário é líder ou co-líder
    const member = await this.memberRepository.findOne({
      where: { userId, groupId, isActive: true }
    });

    if (!member || (member.role !== GroupRole.LEADER && member.role !== GroupRole.CO_LEADER)) {
      throw new ForbiddenException('Apenas líderes e co-líderes podem ver solicitações');
    }

    try {
      return await this.requestRepository.find({
        where: { groupId, status: GroupRequestStatus.PENDING },
        relations: ['user'],
        order: { createdAt: 'DESC' }
      });
    } catch (error: any) {
      // Se a tabela não existir, retornar array vazio
      if (error.message && error.message.includes('does not exist')) {
        this.logger.warn('⚠️ Tabela group_requests não existe ainda. Execute a migration.');
        return [];
      }
      throw error;
    }
  }

  // Aceitar solicitação
  async acceptRequest(requestId: string, userId: number): Promise<GroupMember> {
    const request = await this.requestRepository.findOne({
      where: { id: requestId, status: GroupRequestStatus.PENDING },
      relations: ['group']
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    // Verificar se o usuário é líder ou co-líder
    const member = await this.memberRepository.findOne({
      where: { userId, groupId: request.groupId, isActive: true }
    });

    if (!member || (member.role !== GroupRole.LEADER && member.role !== GroupRole.CO_LEADER)) {
      throw new ForbiddenException('Apenas líderes e co-líderes podem aceitar solicitações');
    }

    const group = request.group;

    // Verificar se o grupo está cheio
    const activeMembers = await this.memberRepository.count({
      where: { groupId: group.id, isActive: true }
    });

    if (activeMembers >= group.maxMembers) {
      throw new BadRequestException('Grupo está cheio');
    }

    // Verificar se o usuário já está em outro grupo
    const existingMembership = await this.memberRepository.findOne({
      where: { userId: request.userId, isActive: true }
    });

    if (existingMembership) {
      throw new BadRequestException('Usuário já pertence a outro grupo');
    }

    // Criar membro
    const newMember = this.memberRepository.create({
      groupId: group.id,
      userId: request.userId,
      role: GroupRole.MEMBER,
      weeklyScore: 0,
      seasonScore: 0,
      totalScore: 0,
      isActive: true
    });

    await this.memberRepository.save(newMember);

    // Atualizar clanTag do usuário
    await this.userRepository.update(request.userId, { clanTag: group.tag });

    // Marcar solicitação como aceita
    request.status = GroupRequestStatus.ACCEPTED;
    await this.requestRepository.save(request);

    // Recalcular estatísticas do grupo
    await this.recalculateGroupStats(group.id);

    return newMember;
  }

  // Recusar solicitação
  async rejectRequest(requestId: string, userId: number): Promise<void> {
    const request = await this.requestRepository.findOne({
      where: { id: requestId, status: GroupRequestStatus.PENDING },
      relations: ['group']
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    // Verificar se o usuário é líder ou co-líder
    const member = await this.memberRepository.findOne({
      where: { userId, groupId: request.groupId, isActive: true }
    });

    if (!member || (member.role !== GroupRole.LEADER && member.role !== GroupRole.CO_LEADER)) {
      throw new ForbiddenException('Apenas líderes e co-líderes podem recusar solicitações');
    }

    // Marcar solicitação como recusada
    request.status = GroupRequestStatus.REJECTED;
    await this.requestRepository.save(request);
  }


  // Atualizar score de um membro
  async updateMemberScore(userId: number, scoreToAdd: number): Promise<void> {
    this.logger.log(`🔍 [updateMemberScore] ========== INICIANDO ==========`);
    this.logger.log(`🔍 [updateMemberScore] userId: ${userId}, scoreToAdd: ${scoreToAdd}, tipo: ${typeof scoreToAdd}`);
    
    if (!scoreToAdd || scoreToAdd <= 0 || isNaN(scoreToAdd)) {
      this.logger.warn(`⚠️ [updateMemberScore] Score inválido ou zero: ${scoreToAdd}, ignorando`);
      return;
    }

    this.logger.log(`🔍 [updateMemberScore] Buscando membro ativo para userId: ${userId}`);
    
    // Primeiro, verificar se o usuário está em algum grupo (mesmo inativo) para debug
    const anyMember = await this.memberRepository.findOne({
      where: { userId },
      relations: ['group']
    });
    
    if (anyMember) {
      this.logger.log(`🔍 [updateMemberScore] Usuário ${userId} encontrado em grupo: groupId=${anyMember.groupId}, isActive=${anyMember.isActive}, group.isActive=${anyMember.group?.isActive}`);
    } else {
      this.logger.log(`🔍 [updateMemberScore] Usuário ${userId} não está em nenhum grupo`);
    }
    
    // Buscar membro ativo usando query builder para garantir que o grupo também está ativo
    const member = await this.memberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.group', 'group')
      .where('member.userId = :userId', { userId })
      .andWhere('member.isActive = :isActive', { isActive: true })
      .andWhere('group.isActive = :groupIsActive', { groupIsActive: true })
      .getOne();

    if (!member) {
      this.logger.warn(`⚠️ [updateMemberScore] Usuário ${userId} não está em nenhum grupo ativo`);
      if (anyMember) {
        this.logger.warn(`⚠️ [updateMemberScore] Usuário ${userId} está em um grupo, mas isActive=${anyMember.isActive}, groupId=${anyMember.groupId}`);
        if (anyMember.group && !anyMember.group.isActive) {
          this.logger.warn(`⚠️ [updateMemberScore] O grupo ${anyMember.groupId} também está inativo`);
        }
      }
      return; // Usuário não está em nenhum grupo ativo
    }
    
    // Verificação adicional: garantir que o grupo está ativo
    if (!member.group || !member.group.isActive) {
      this.logger.warn(`⚠️ [updateMemberScore] Membro encontrado, mas o grupo ${member.groupId} está inativo. Não atualizando score.`);
      return;
    }

    this.logger.log(`✅ [updateMemberScore] Membro encontrado - userId: ${userId}, groupId: ${member.groupId}, isActive: ${member.isActive}`);
    this.logger.log(`📊 [updateMemberScore] Scores atuais - totalScore: ${member.totalScore}, weeklyScore: ${member.weeklyScore}, seasonScore: ${member.seasonScore}`);

    // Só contar score da season no ranking do grupo quando houver season ativa
    const activeSeason = await this.seasonsService.getActiveSeasonOrNull();
    const hasActiveSeason = !!activeSeason;
    if (hasActiveSeason) {
      this.logger.log(`📊 [updateMemberScore] Season ativa: ${activeSeason.name} - score será contado no seasonScore do membro e do grupo`);
    } else {
      this.logger.log(`📊 [updateMemberScore] Nenhuma season ativa - score só será adicionado a totalScore e weeklyScore (não ao seasonScore)`);
    }

    // Atualizar scores semanais, de season e total
    // REGRA: Quando o duelista ganha score, o clã recebe EXATAMENTE o mesmo score
    // seasonScore (membro e grupo) só é incrementado quando há season ativa
    const oldTotalScore = member.totalScore ? parseFloat(String(member.totalScore)) : 0;
    const oldWeeklyScore = member.weeklyScore ? parseFloat(String(member.weeklyScore)) : 0;
    const oldSeasonScore = member.seasonScore ? parseFloat(String(member.seasonScore)) : 0;
    
    try {
      this.logger.log(`🔄 [updateMemberScore] Executando UPDATE SQL - memberId: ${member.id}, scoreToAdd: ${scoreToAdd}, hasActiveSeason: ${hasActiveSeason}`);
      this.logger.log(`🔄 [updateMemberScore] Scores atuais do membro - totalScore: ${oldTotalScore}, weeklyScore: ${oldWeeklyScore}, seasonScore: ${oldSeasonScore}`);
      
      const beforeCheck = await this.memberRepository.query(
        `SELECT "totalScore", "weeklyScore", "seasonScore" FROM group_members WHERE id = $1`,
        [member.id]
      );
      if (beforeCheck && beforeCheck.length > 0) {
        const beforeTotal = parseFloat(beforeCheck[0].totalScore || 0);
        const beforeWeekly = parseFloat(beforeCheck[0].weeklyScore || 0);
        const beforeSeason = parseFloat(beforeCheck[0].seasonScore || 0);
        this.logger.log(`🔄 [updateMemberScore] Scores ANTES do UPDATE (do banco): total=${beforeTotal}, weekly=${beforeWeekly}, season=${beforeSeason}`);
      }
      
      const updateResult = hasActiveSeason
        ? await this.memberRepository.query(
            `UPDATE group_members SET 
              "totalScore" = COALESCE("totalScore", 0)::numeric + $1::numeric,
              "weeklyScore" = COALESCE("weeklyScore", 0)::numeric + $1::numeric,
              "seasonScore" = COALESCE("seasonScore", 0)::numeric + $1::numeric
            WHERE id = $2 
            RETURNING "totalScore", "weeklyScore", "seasonScore"`,
            [scoreToAdd, member.id]
          )
        : await this.memberRepository.query(
            `UPDATE group_members SET 
              "totalScore" = COALESCE("totalScore", 0)::numeric + $1::numeric,
              "weeklyScore" = COALESCE("weeklyScore", 0)::numeric + $1::numeric
            WHERE id = $2 
            RETURNING "totalScore", "weeklyScore", "seasonScore"`,
            [scoreToAdd, member.id]
          );
      
      this.logger.log(`🔄 [updateMemberScore] Resultado do UPDATE:`, JSON.stringify(updateResult));
      
      if (updateResult && updateResult.length > 0) {
        const newTotalScore = parseFloat(updateResult[0].totalScore) || 0;
        const newWeeklyScore = parseFloat(updateResult[0].weeklyScore) || 0;
        const newSeasonScore = parseFloat(updateResult[0].seasonScore) || 0;
        this.logger.log(`✅ [updateMemberScore] Scores atualizados via SQL:`);
        this.logger.log(`   - totalScore: ${oldTotalScore} -> ${newTotalScore} (+${scoreToAdd})`);
        this.logger.log(`   - weeklyScore: ${oldWeeklyScore} -> ${newWeeklyScore} (+${scoreToAdd})`);
        this.logger.log(hasActiveSeason ? `   - seasonScore: ${oldSeasonScore} -> ${newSeasonScore} (+${scoreToAdd})` : `   - seasonScore: ${oldSeasonScore} (sem season ativa, não alterado)`);
        
        // Aguardar um pouco para garantir que a transação foi commitada
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verificar se a atualização foi bem-sucedida - usar query SQL direta para evitar cache
        const verifyResult = await this.memberRepository.query(
          `SELECT "totalScore", "weeklyScore", "seasonScore" FROM group_members WHERE id = $1`,
          [member.id]
        );
        
        if (verifyResult && verifyResult.length > 0) {
          const verifiedTotal = parseFloat(verifyResult[0].totalScore || 0);
          const verifiedWeekly = parseFloat(verifyResult[0].weeklyScore || 0);
          const verifiedSeason = parseFloat(verifyResult[0].seasonScore || 0);
          this.logger.log(`✅ [updateMemberScore] Verificação via SQL direta - totalScore: ${verifiedTotal}, weeklyScore: ${verifiedWeekly}, seasonScore: ${verifiedSeason}`);
          
          if (Math.abs(verifiedTotal - newTotalScore) > 0.01) {
            this.logger.warn(`⚠️ [updateMemberScore] Discrepância no totalScore! SQL retornou ${newTotalScore}, mas verificação tem ${verifiedTotal}`);
          }
          if (Math.abs(verifiedWeekly - newWeeklyScore) > 0.01) {
            this.logger.warn(`⚠️ [updateMemberScore] Discrepância no weeklyScore! SQL retornou ${newWeeklyScore}, mas verificação tem ${verifiedWeekly}`);
          }
          if (Math.abs(verifiedSeason - newSeasonScore) > 0.01) {
            this.logger.warn(`⚠️ [updateMemberScore] Discrepância no seasonScore! SQL retornou ${newSeasonScore}, mas verificação tem ${verifiedSeason}`);
          }
        } else {
          this.logger.warn(`⚠️ [updateMemberScore] Não foi possível verificar os scores no banco`);
        }
      } else {
        this.logger.error(`❌ [updateMemberScore] Nenhum resultado retornado do UPDATE para membro ${member.id}`);
        this.logger.error(`❌ [updateMemberScore] updateResult:`, updateResult);
        throw new Error(`Falha ao atualizar scores do membro ${member.id}`);
      }
    } catch (error: any) {
      this.logger.error(`❌ [updateMemberScore] Erro ao atualizar scores via SQL:`, error.message || error);
      this.logger.error(`❌ [updateMemberScore] Stack:`, error.stack);
      throw error;
    }
    
    // Verificação final: buscar o score atualizado do membro antes de recalcular
    const finalMemberCheck = await this.memberRepository.query(
      `SELECT "totalScore", "groupId" FROM group_members WHERE id = $1`,
      [member.id]
    );
    let finalMemberScore = 0;
    if (finalMemberCheck && finalMemberCheck.length > 0) {
      finalMemberScore = parseFloat(finalMemberCheck[0].totalScore || 0);
      this.logger.log(`✅ [updateMemberScore] Verificação final do membro - totalScore: ${finalMemberScore}, groupId: ${finalMemberCheck[0].groupId}`);
    }
    
    // ATUALIZAR SCORE DO GRUPO DIRETAMENTE - SIMPLES E DIRETO
    // Quando o membro ganha score, adicionar o mesmo score ao grupo
    this.logger.log(`🔄 [updateMemberScore] Atualizando score do grupo diretamente - groupId: ${member.groupId}, scoreToAdd: ${scoreToAdd}`);
    
    try {
      // Buscar score atual do grupo
      const groupBefore = await this.groupRepository.query(
        `SELECT "totalScore", "seasonScore" FROM groups WHERE id = $1`,
        [member.groupId]
      );
      
      let groupTotalScoreBefore = 0;
      let groupSeasonScoreBefore = 0;
      if (groupBefore && groupBefore.length > 0) {
        groupTotalScoreBefore = parseFloat(groupBefore[0].totalScore || 0);
        groupSeasonScoreBefore = parseFloat(groupBefore[0].seasonScore || 0);
        this.logger.log(`📊 [updateMemberScore] Score do grupo ANTES: totalScore=${groupTotalScoreBefore.toFixed(2)}, seasonScore=${groupSeasonScoreBefore.toFixed(2)}`);
      }
      
      // Atualizar score do grupo: totalScore sempre; seasonScore só quando há season ativa
      const updateGroupResult = hasActiveSeason
        ? await this.groupRepository.query(
            `UPDATE groups SET 
              "totalScore" = COALESCE("totalScore", 0)::numeric + $1::numeric,
              "seasonScore" = COALESCE("seasonScore", 0)::numeric + $1::numeric
            WHERE id = $2
            RETURNING "totalScore", "seasonScore"`,
            [scoreToAdd, member.groupId]
          )
        : await this.groupRepository.query(
            `UPDATE groups SET 
              "totalScore" = COALESCE("totalScore", 0)::numeric + $1::numeric
            WHERE id = $2
            RETURNING "totalScore", "seasonScore"`,
            [scoreToAdd, member.groupId]
          );
      
      if (updateGroupResult && updateGroupResult.length > 0) {
        const newGroupTotalScore = parseFloat(updateGroupResult[0].totalScore || 0);
        const newGroupSeasonScore = parseFloat(updateGroupResult[0].seasonScore || 0);
        this.logger.log(`✅ [updateMemberScore] Score do grupo atualizado: totalScore=${groupTotalScoreBefore.toFixed(2)} -> ${newGroupTotalScore.toFixed(2)} (+${scoreToAdd})`);
        if (hasActiveSeason) {
          this.logger.log(`✅ [updateMemberScore] Season score do grupo atualizado: ${groupSeasonScoreBefore.toFixed(2)} -> ${newGroupSeasonScore.toFixed(2)} (+${scoreToAdd})`);
        }
      } else {
        this.logger.error(`❌ [updateMemberScore] Falha ao atualizar score do grupo - nenhum resultado retornado`);
      }
      
      // Verificação final
      const finalGroupCheck = await this.groupRepository.query(
        `SELECT "totalScore", "seasonScore" FROM groups WHERE id = $1`,
        [member.groupId]
      );
      if (finalGroupCheck && finalGroupCheck.length > 0) {
        const finalGroupScore = parseFloat(finalGroupCheck[0].totalScore || 0);
        this.logger.log(`✅ [updateMemberScore] Verificação final - Score do grupo: ${finalGroupScore.toFixed(2)}`);
      }
      
    } catch (error: any) {
      this.logger.error(`❌ [updateMemberScore] ERRO ao atualizar score do grupo:`, error.message || error);
      this.logger.error(`❌ [updateMemberScore] Stack:`, error.stack);
      throw error;
    }
    
    this.logger.log(`✅ [updateMemberScore] CONCLUÍDO com sucesso para userId: ${userId}, groupId: ${member.groupId}`);
  }

  // Atualizar vitórias do membro no clã
  async updateMemberWin(userId: number): Promise<void> {
    this.logger.log(`🔍 [updateMemberWin] Buscando membro ativo para usuário ${userId}`);
    const member = await this.memberRepository.findOne({
      where: { userId, isActive: true }
    });

    if (!member) {
      this.logger.warn(`⚠️ [updateMemberWin] Usuário ${userId} não está em nenhum grupo ativo`);
      return; // Usuário não está em nenhum grupo
    }

    this.logger.log(`📊 [updateMemberWin] Adicionando vitória para membro ${userId} do clã ${member.groupId}`);

    // Incrementar vitórias do clã
    await this.groupRepository.query(
      `UPDATE groups SET "totalWins" = COALESCE("totalWins", 0) + 1 WHERE id = $1`,
      [member.groupId]
    );
    
    this.logger.log(`✅ [updateMemberWin] Vitória adicionada ao clã ${member.groupId}`);
    
    // Recalcular estatísticas do clã
    await this.recalculateGroupStats(member.groupId);
  }

  // Atualizar derrotas do membro no clã
  async updateMemberLoss(userId: number): Promise<void> {
    this.logger.log(`🔍 [updateMemberLoss] Buscando membro ativo para usuário ${userId}`);
    const member = await this.memberRepository.findOne({
      where: { userId, isActive: true }
    });

    if (!member) {
      this.logger.warn(`⚠️ [updateMemberLoss] Usuário ${userId} não está em nenhum grupo ativo`);
      return; // Usuário não está em nenhum grupo
    }

    this.logger.log(`📊 [updateMemberLoss] Adicionando derrota para membro ${userId} do clã ${member.groupId}`);

    // Incrementar derrotas do clã
    await this.groupRepository.query(
      `UPDATE groups SET "totalLosses" = COALESCE("totalLosses", 0) + 1 WHERE id = $1`,
      [member.groupId]
    );
    
    this.logger.log(`✅ [updateMemberLoss] Derrota adicionada ao clã ${member.groupId}`);
    
    // Recalcular estatísticas do clã
    await this.recalculateGroupStats(member.groupId);
  }

  // Adicionar cash ao grupo quando duelista ganha cash em um duelo
  // O grupo recebe metade do cash que o duelista ganhou
  async addGroupCashFromDuel(userId: number, cashEarned: number): Promise<void> {
    this.logger.log(`🔍 [addGroupCashFromDuel] Buscando membro ativo para usuário ${userId}`);
    const member = await this.memberRepository.findOne({
      where: { userId, isActive: true }
    });

    if (!member) {
      this.logger.warn(`⚠️ [addGroupCashFromDuel] Usuário ${userId} não está em nenhum grupo ativo`);
      return; // Usuário não está em nenhum grupo
    }

    // Calcular metade do cash ganho (arredondado para baixo)
    const groupCashEarned = Math.floor(cashEarned / 2);
    
    if (groupCashEarned <= 0) {
      this.logger.log(`ℹ️ [addGroupCashFromDuel] Cash ganho (${cashEarned}) é muito pequeno, grupo não recebe cash`);
      return;
    }

    this.logger.log(`💰 [addGroupCashFromDuel] Duelista ${userId} ganhou ${cashEarned} cash, grupo ${member.groupId} recebe ${groupCashEarned} cash (metade)`);

    // Incrementar cash do clã
    await this.groupRepository.query(
      `UPDATE groups SET "totalCash" = COALESCE("totalCash", 0) + $1 WHERE id = $2`,
      [groupCashEarned, member.groupId]
    );
    
    this.logger.log(`✅ [addGroupCashFromDuel] Cash adicionado ao clã ${member.groupId}: +${groupCashEarned}`);
  }
  
  // Recalcular todas as estatísticas do clã
  async recalculateGroupStats(groupId: string): Promise<void> {
    this.logger.log(`🔄 [recalculateGroupStats] Iniciando recálculo para clã ${groupId}`);
    
    // Buscar membros usando query SQL direta para garantir que temos os valores mais atualizados
    // Isso é crítico porque o totalScore pode ter sido atualizado via query direta e o TypeORM pode ter cache
    const membersRaw = await this.memberRepository.query(
      `SELECT 
        id, 
        "userId", 
        "groupId", 
        "weeklyScore", 
        "seasonScore", 
        "totalScore", 
        "isActive"
      FROM group_members 
      WHERE "groupId" = $1 AND "isActive" = true`,
      [groupId]
    );

    if (!membersRaw || membersRaw.length === 0) {
      this.logger.warn(`⚠️ [recalculateGroupStats] Clã ${groupId} não tem membros ativos`);
      // Resetar estatísticas do clã se não há membros
      await this.groupRepository.query(
        `UPDATE groups SET 
          "totalCash" = 0,
          "totalWins" = 0,
          "totalLosses" = 0,
          "totalAchievements" = 0,
          "totalScore" = 0::numeric,
          "seasonScore" = 0::numeric,
          "level" = 1
        WHERE id = $1`,
        [groupId]
      );
      return;
    }

    this.logger.log(`📊 [recalculateGroupStats] Encontrados ${membersRaw.length} membros ativos no clã ${groupId}`);
    const userIds = membersRaw.map((m: any) => m.userId);
    
    // Buscar dados dos usuários
    const users = await this.userRepository.find({
      where: { id: In(userIds) },
      select: ['id', 'winsGeral', 'lossesGeral', 'totalScore']
    });

    // Buscar cash atual do grupo (não recalcular como soma - o cash é ganho quando duelistas ganham cash em duelos)
    const groupCurrent = await this.groupRepository.query(
      `SELECT "totalCash", "totalWins", "totalLosses" FROM groups WHERE id = $1`,
      [groupId]
    );
    const totalCash = groupCurrent && groupCurrent.length > 0 ? (groupCurrent[0].totalCash || 0) : 0;

    // Calcular totais usando os valores RAW do banco (mais confiável)
    let totalWins = 0;
    let totalLosses = 0;
    let totalScore = 0;
    let seasonScore = 0;
    
    // REGRA: totalScore do clã é a soma dos totalScore dos membros ativos
    // Cada vez que um membro ganha score, esse score é adicionado ao member.totalScore
    // E o group.totalScore é a soma de todos os member.totalScore dos membros ativos
    // Isso garante que o clã recebe exatamente o mesmo score que cada duelista ganhou
    // REGRA: totalCash do clã NÃO é a soma do cash dos membros
    // O cash do clã é ganho quando duelistas ganham cash em duelos (metade do cash ganho)
    this.logger.log(`📊 [recalculateGroupStats] Calculando totais a partir dos valores do banco:`);
    this.logger.log(`📊 [recalculateGroupStats] Total de membros encontrados: ${membersRaw.length}`);
    this.logger.log(`💰 [recalculateGroupStats] Cash atual do grupo (mantido): ${totalCash}`);
    
    // Verificar score atual do grupo ANTES de recalcular
    const groupBefore = await this.groupRepository.query(
      `SELECT "totalScore" FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupBefore && groupBefore.length > 0) {
      const scoreBefore = parseFloat(groupBefore[0].totalScore || 0);
      this.logger.log(`📊 [recalculateGroupStats] Score ANTES do recálculo: ${scoreBefore}`);
    }
    
    membersRaw.forEach((memberRaw: any) => {
      // Converter para número garantindo que seja um número válido
      let memberTotalScore = 0;
      let memberSeasonScore = 0;
      
      if (memberRaw.totalScore !== null && memberRaw.totalScore !== undefined) {
        memberTotalScore = parseFloat(String(memberRaw.totalScore)) || 0;
      }
      
      if (memberRaw.seasonScore !== null && memberRaw.seasonScore !== undefined) {
        memberSeasonScore = parseFloat(String(memberRaw.seasonScore)) || 0;
      }
      
      totalScore += memberTotalScore;
      seasonScore += memberSeasonScore;
      this.logger.log(`  📊 [recalculateGroupStats] Membro ${memberRaw.userId}: totalScore=${memberTotalScore.toFixed(2)}, seasonScore=${memberSeasonScore.toFixed(2)} (acumulado total: ${totalScore.toFixed(2)}, season: ${seasonScore.toFixed(2)})`);
    });
    
    this.logger.log(`📊 [recalculateGroupStats] SOMA FINAL: totalScore=${totalScore.toFixed(2)}, seasonScore=${seasonScore.toFixed(2)}`);
    
    // Somar outras estatísticas dos usuários (mas não cash - cash é mantido do grupo)
    users.forEach(user => {
      totalWins += user.winsGeral || 0;
      totalLosses += user.lossesGeral || 0;
    });

    // Contar conquistas de todos os membros
    const achievementsCount = await this.achievementRepository.count({
      where: { userId: In(userIds) }
    });

    // Calcular nível do clã baseado no totalScore
    // Fórmula: level = Math.floor(totalScore / 100) + 1 (mínimo 1)
    const calculatedLevel = Math.max(1, Math.floor(totalScore / 100) + 1);

    this.logger.log(`📊 [recalculateGroupStats] Totais calculados: Score=${totalScore.toFixed(2)}, SeasonScore=${seasonScore.toFixed(2)}, Wins=${totalWins}, Losses=${totalLosses}, Cash=${totalCash}, Achievements=${achievementsCount}, Level=${calculatedLevel}`);

    // Atualizar grupo - usar query direta para totalScore e seasonScore porque podem ser NUMERIC
    // O totalScore do clã é a soma de todos os totalScore dos membros ativos
    // O seasonScore do clã é a soma de todos os seasonScore dos membros ativos
    this.logger.log(`🔄 [recalculateGroupStats] Atualizando grupo ${groupId} no banco de dados...`);
    this.logger.log(`🔄 [recalculateGroupStats] Valores a atualizar: totalScore=${totalScore}, seasonScore=${seasonScore}, level=${calculatedLevel}`);
    
    try {
      // Garantir que totalScore e seasonScore são números válidos
      const totalScoreValue = Number(totalScore) || 0;
      const seasonScoreValue = Number(seasonScore) || 0;
      
      this.logger.log(`🔄 [recalculateGroupStats] Valores a atualizar (verificados): totalScore=${totalScoreValue}, seasonScore=${seasonScoreValue}`);
      
      const updateResult = await this.groupRepository.query(
        `UPDATE groups SET 
          "totalCash" = $1,
          "totalWins" = $2,
          "totalLosses" = $3,
          "totalAchievements" = $4,
          "totalScore" = $5::numeric,
          "seasonScore" = $6::numeric,
          "level" = $7
        WHERE id = $8
        RETURNING "totalScore", "seasonScore", "level"`,
        [totalCash, totalWins, totalLosses, achievementsCount, totalScoreValue, seasonScoreValue, calculatedLevel, groupId]
      );
      
      this.logger.log(`🔄 [recalculateGroupStats] Resultado do UPDATE:`, JSON.stringify(updateResult));
      this.logger.log(`🔄 [recalculateGroupStats] Query executada: UPDATE groups SET totalScore=${totalScoreValue}::numeric WHERE id='${groupId}'`);
      
      this.logger.log(`✅ [recalculateGroupStats] Clã ${groupId} atualizado: Score=${totalScoreValue.toFixed(2)}, SeasonScore=${seasonScoreValue.toFixed(2)}, Level=${calculatedLevel}, Wins=${totalWins}, Losses=${totalLosses}, Membros=${membersRaw.length}`);
      
      if (updateResult && updateResult.length > 0) {
        const confirmedScore = parseFloat(updateResult[0].totalScore) || 0;
        const confirmedSeasonScore = parseFloat(updateResult[0].seasonScore) || 0;
        const confirmedLevel = updateResult[0].level || 1;
        this.logger.log(`✅ [recalculateGroupStats] totalScore confirmado no banco: ${confirmedScore} (calculado: ${totalScoreValue.toFixed(2)})`);
        this.logger.log(`✅ [recalculateGroupStats] seasonScore confirmado no banco: ${confirmedSeasonScore} (calculado: ${seasonScoreValue.toFixed(2)})`);
        this.logger.log(`✅ [recalculateGroupStats] level confirmado no banco: ${confirmedLevel} (calculado: ${calculatedLevel})`);
        
        if (Math.abs(confirmedScore - totalScoreValue) > 0.01) {
          this.logger.warn(`⚠️ [recalculateGroupStats] Diferença entre score calculado (${totalScoreValue.toFixed(2)}) e confirmado (${confirmedScore})`);
        } else {
          this.logger.log(`✅ [recalculateGroupStats] Score do clã atualizado com sucesso: ${confirmedScore}`);
        }
        
        // Verificação final via SQL direta - fazer múltiplas verificações
        const finalVerify = await this.groupRepository.query(
          `SELECT "totalScore", "seasonScore", "level" FROM groups WHERE id = $1`,
          [groupId]
        );
        
        if (finalVerify && finalVerify.length > 0) {
          const finalScore = parseFloat(finalVerify[0].totalScore || 0);
          const finalSeasonScore = parseFloat(finalVerify[0].seasonScore || 0);
          this.logger.log(`✅ [recalculateGroupStats] Verificação final via SQL: totalScore=${finalScore}, seasonScore=${finalSeasonScore}`);
          
          // Comparar com o valor calculado
          if (Math.abs(finalScore - totalScoreValue) > 0.01) {
            this.logger.error(`❌ [recalculateGroupStats] ERRO: Score no banco (${finalScore}) diferente do calculado (${totalScoreValue})!`);
          } else {
            this.logger.log(`✅ [recalculateGroupStats] Score confirmado no banco de dados: ${finalScore}`);
          }
        } else {
          this.logger.error(`❌ [recalculateGroupStats] Não foi possível verificar o score no banco após atualização!`);
        }
        
        // Verificação adicional: buscar o grupo completo via TypeORM
        const groupEntity = await this.groupRepository.findOne({
          where: { id: groupId },
          select: ['id', 'totalScore', 'seasonScore', 'level']
        });
        
        if (groupEntity) {
          const entityScore = parseFloat(String(groupEntity.totalScore || 0));
          this.logger.log(`✅ [recalculateGroupStats] Verificação via TypeORM: totalScore=${entityScore}`);
          
          if (Math.abs(entityScore - totalScoreValue) > 0.01) {
            this.logger.warn(`⚠️ [recalculateGroupStats] TypeORM retornou score diferente: ${entityScore} (esperado: ${totalScoreValue})`);
          }
        }
      } else {
        this.logger.error(`❌ [recalculateGroupStats] Nenhum resultado retornado do UPDATE para clã ${groupId}`);
        this.logger.error(`❌ [recalculateGroupStats] updateResult:`, updateResult);
      }
    } catch (error: any) {
      this.logger.error(`❌ [recalculateGroupStats] ERRO ao atualizar grupo:`, error.message || error);
      this.logger.error(`❌ [recalculateGroupStats] Stack:`, error.stack);
      throw error;
    }
  }
  
  // Recalcular estatísticas de todos os grupos (pode ser chamado periodicamente)
  @Cron(CronExpression.EVERY_HOUR)
  async recalculateAllGroupsStats(): Promise<void> {
    try {
      const groups = await this.groupRepository.find({
        where: { isActive: true },
        select: ['id']
      });

      for (const group of groups) {
        try {
          // Validar se o ID é um UUID válido antes de processar
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(group.id)) {
            this.logger.warn(`⚠️ [recalculateAllGroupsStats] Grupo com ID inválido ignorado: ${group.id}`);
            continue;
          }
          await this.recalculateGroupStats(group.id);
        } catch (error: any) {
          this.logger.error(`❌ [recalculateAllGroupsStats] Erro ao recalcular stats do grupo ${group.id}:`, error.message);
          // Continuar com os outros grupos mesmo se um falhar
        }
      }
      
      this.logger.log(`✅ Estatísticas de todos os grupos recalculadas (${groups.length} grupos processados)`);
    } catch (error: any) {
      this.logger.error('❌ [recalculateAllGroupsStats] Erro ao buscar grupos:', error.message);
    }
  }
  
  // Promover membro a oficial (CO_LEADER ou ELDER)
  async promoteMember(leaderId: number, groupId: string, memberUserId: number, newRole: GroupRole): Promise<void> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Apenas o líder pode promover membros
    if (group.leaderId !== leaderId) {
      throw new ForbiddenException('Apenas o líder pode promover membros');
    }

    if (newRole === GroupRole.LEADER) {
      throw new BadRequestException('Não é possível promover alguém a líder. Use transferir liderança.');
    }

    const member = await this.memberRepository.findOne({
      where: { groupId, userId: memberUserId, isActive: true }
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    if (member.userId === leaderId) {
      throw new BadRequestException('Você não pode promover a si mesmo');
    }

    // Converter string para GroupRole se necessário
    let roleToSet: GroupRole;
    const roleString = String(newRole);
    if (roleString === 'Co-Leader' || roleString === 'CO_LEADER' || newRole === GroupRole.CO_LEADER) {
      roleToSet = GroupRole.CO_LEADER;
    } else if (roleString === 'Elder' || roleString === 'ELDER' || newRole === GroupRole.ELDER) {
      roleToSet = GroupRole.ELDER;
    } else if (newRole === GroupRole.MEMBER) {
      roleToSet = GroupRole.MEMBER;
    } else if (newRole === GroupRole.LEADER) {
      roleToSet = GroupRole.LEADER;
    } else {
      throw new BadRequestException(`Role inválido: ${newRole}`);
    }

    this.logger.log(`📈 [promoteMember] Promovendo membro ${memberUserId} do grupo ${groupId} para ${roleToSet}`);
    member.role = roleToSet;
    await this.memberRepository.save(member);
    this.logger.log(`✅ [promoteMember] Membro promovido com sucesso`);
  }
  
  // Rebaixar membro a MEMBER
  async demoteMember(leaderId: number, groupId: string, memberUserId: number): Promise<void> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    if (group.leaderId !== leaderId) {
      throw new ForbiddenException('Apenas o líder pode rebaixar membros');
    }

    const member = await this.memberRepository.findOne({
      where: { groupId, userId: memberUserId, isActive: true }
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    if (member.userId === leaderId) {
      throw new BadRequestException('Você não pode rebaixar a si mesmo');
    }

    member.role = GroupRole.MEMBER;
    await this.memberRepository.save(member);
  }

  // Remover/Expulsar membro do grupo
  async removeMember(requesterId: number, groupId: string, memberUserId: number): Promise<void> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['members']
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Verificar se o requester é líder ou oficial
    const requesterMember = await this.memberRepository.findOne({
      where: { groupId, userId: requesterId, isActive: true }
    });

    if (!requesterMember) {
      throw new ForbiddenException('Você não é membro deste grupo');
    }

    const isLeader = group.leaderId === requesterId;
    const isCoLeader = requesterMember.role === GroupRole.CO_LEADER;

    if (!isLeader && !isCoLeader) {
      throw new ForbiddenException('Apenas líderes e oficiais podem remover membros');
    }

    // Buscar o membro a ser removido
    const memberToRemove = await this.memberRepository.findOne({
      where: { groupId, userId: memberUserId, isActive: true }
    });

    if (!memberToRemove) {
      throw new NotFoundException('Membro não encontrado');
    }

    // Verificar permissões
    if (memberToRemove.userId === group.leaderId) {
      throw new BadRequestException('Não é possível remover o líder do grupo');
    }

    // Se o requester é oficial (não líder), não pode remover outros oficiais
    if (isCoLeader && !isLeader) {
      if (memberToRemove.role === GroupRole.CO_LEADER || memberToRemove.role === GroupRole.ELDER) {
        throw new ForbiddenException('Oficiais não podem remover outros oficiais');
      }
    }

    // Remover membro (desativar)
    memberToRemove.isActive = false;
    await this.memberRepository.save(memberToRemove);

    // Limpar clanTag do usuário
    await this.userRepository.update(memberUserId, { clanTag: null as any });

    // Remover ou atualizar solicitações antigas do usuário para este grupo
    try {
      const existingRequests = await this.requestRepository.find({
        where: { userId: memberUserId, groupId }
      });

      if (existingRequests.length > 0) {
        // Remover todas as solicitações antigas para permitir nova entrada
        await this.requestRepository.remove(existingRequests);
        this.logger.log(`🗑️ [removeMember] Removidas ${existingRequests.length} solicitação(ões) antiga(s) do usuário ${memberUserId} para o grupo ${groupId}`);
      }
    } catch (error: any) {
      // Se a tabela não existir ou houver erro, apenas logar e continuar
      this.logger.warn(`⚠️ [removeMember] Erro ao remover solicitações antigas: ${error.message}`);
    }

    // Recalcular estatísticas do grupo
    await this.recalculateGroupStats(groupId);
  }
  
  // Buscar grupo e ranking do usuário
  async getUserGroupInfo(userId: number): Promise<{ group: Group | null; memberRank: number | null; memberTotalRank: number | null }> {
    const member = await this.memberRepository.findOne({
      where: { userId, isActive: true },
      relations: ['group']
    });

    if (!member || !member.group) {
      return { group: null, memberRank: null, memberTotalRank: null };
    }

    // Buscar ranking do membro no clã (total score)
    const allMembers = await this.memberRepository.find({
      where: { groupId: member.groupId, isActive: true },
      order: { totalScore: 'DESC' }
    });

    const memberRank = allMembers.findIndex(m => m.userId === userId) + 1;

    // Buscar ranking geral do clã entre todos os clãs
    const allGroups = await this.groupRepository.find({
      where: { isActive: true },
      order: { totalScore: 'DESC' }
    });

    const memberTotalRank = allGroups.findIndex(g => g.id === member.groupId) + 1;

    return {
      group: member.group,
      memberRank: memberRank > 0 ? memberRank : null,
      memberTotalRank: memberTotalRank > 0 ? memberTotalRank : null
    };
  }

  // Resetar scores semanais (executado toda segunda-feira)
  @Cron('0 0 * * 1') // Toda segunda às 00:00
  async resetWeeklyScores(): Promise<void> {
    await this.memberRepository.update({}, {
      weeklyScore: 0,
      weeklyScoreResetAt: new Date()
    });
    console.log('✅ Scores semanais resetados');
  }

  // Resetar scores da season (chamado quando season termina)
  async resetSeasonScores(): Promise<void> {
    await this.memberRepository.update({}, {
      seasonScore: 0
    });
    console.log('✅ Scores da season resetados');
  }

  // Verificar e executar divisão de cash dos grupos (executa a cada minuto)
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndExecuteCashDivision(): Promise<void> {
    // Converter para horário de Brasília (America/Sao_Paulo)
    const now = new Date();
    
    // Obter horário de Brasília usando Intl.DateTimeFormat
    const brasiliaFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'long',
    });
    
    const brasiliaParts = brasiliaFormatter.formatToParts(now);
    const brasiliaHour = parseInt(brasiliaParts.find(p => p.type === 'hour')?.value || '0', 10);
    const brasiliaMinute = parseInt(brasiliaParts.find(p => p.type === 'minute')?.value || '0', 10);
    const brasiliaWeekday = brasiliaParts.find(p => p.type === 'weekday')?.value || '';
    
    // Mapear weekday para número (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const weekdayMap: { [key: string]: number } = {
      'Sunday': 0,
      'Monday': 1,
      'Tuesday': 2,
      'Wednesday': 3,
      'Thursday': 4,
      'Friday': 5,
      'Saturday': 6,
    };
    
    const currentDayOfWeek = weekdayMap[brasiliaWeekday] ?? now.getDay();
    const currentTime = `${String(brasiliaHour).padStart(2, '0')}:${String(brasiliaMinute).padStart(2, '0')}`;
    
    // Log para debug (apenas a cada 10 minutos)
    if (brasiliaMinute % 10 === 0) {
      this.logger.debug(`🕐 [checkAndExecuteCashDivision] Horário de Brasília: ${currentTime} (dia ${currentDayOfWeek})`);
    }

    // Buscar grupos que devem ter divisão de cash agora
    const groups = await this.groupRepository.find({
      where: {
        isActive: true,
        cashDivisionDayOfWeek: currentDayOfWeek,
        cashDivisionTime: currentTime,
      },
    });

    if (groups.length === 0) {
      // Log apenas a cada 10 minutos para não poluir os logs
      if (now.getMinutes() % 10 === 0) {
        this.logger.debug(`🔍 [checkAndExecuteCashDivision] Nenhum grupo encontrado para divisão às ${currentTime} (dia ${currentDayOfWeek})`);
      }
      return;
    }

    this.logger.log(`💰 [checkAndExecuteCashDivision] Encontrados ${groups.length} grupo(s) para divisão às ${currentTime} (dia ${currentDayOfWeek})`);

    for (const group of groups) {
      try {
        // Buscar o grupo novamente com todos os campos necessários
        const fullGroup = await this.groupRepository.findOne({
          where: { id: group.id },
        });

        if (!fullGroup) {
          this.logger.warn(`⚠️ [checkAndExecuteCashDivision] Grupo ${group.id} não encontrado`);
          continue;
        }

        // Converter totalCash para número (pode vir como string do banco)
        const totalCash = typeof fullGroup.totalCash === 'string' 
          ? parseFloat(fullGroup.totalCash) 
          : Number(fullGroup.totalCash || 0);

        // Verificar se o grupo tem cash para dividir
        if (!totalCash || totalCash <= 0) {
          this.logger.debug(`⚠️ [checkAndExecuteCashDivision] Grupo ${fullGroup.name} não tem cash para dividir (totalCash: ${totalCash})`);
          continue;
        }

        // Determinar número de membros para divisão
        // Prioridade: cashDivisionMembers (configurado pelo líder) > cashDivisionDefaultMembers (configurado pelo admin)
        const divisionMembers = fullGroup.cashDivisionMembers ?? fullGroup.cashDivisionDefaultMembers;

        if (!divisionMembers || divisionMembers <= 0) {
          this.logger.warn(`⚠️ [checkAndExecuteCashDivision] Grupo ${fullGroup.name} não tem número de membros configurado para divisão`);
          continue;
        }

        // Buscar membros ativos do grupo
        const activeMembers = await this.memberRepository.find({
          where: {
            groupId: fullGroup.id,
            isActive: true,
          },
          relations: ['user'],
        });

        if (activeMembers.length === 0) {
          this.logger.warn(`⚠️ [checkAndExecuteCashDivision] Grupo ${fullGroup.name} não tem membros ativos`);
          continue;
        }

        // Calcular cash por membro (usar o menor entre número configurado e número real de membros)
        const membersToDivide = Math.min(divisionMembers, activeMembers.length);
        const cashPerMember = Math.floor(totalCash / membersToDivide);
        const totalDistributed = cashPerMember * membersToDivide;
        const remainingCash = totalCash - totalDistributed;

        if (cashPerMember <= 0) {
          this.logger.warn(`⚠️ [checkAndExecuteCashDivision] Grupo ${fullGroup.name}: cash por membro é 0 ou negativo (${cashPerMember})`);
          continue;
        }

        this.logger.log(`💰 [checkAndExecuteCashDivision] Grupo ${fullGroup.name}: Dividindo ${totalCash} cash entre ${membersToDivide} membro(s). ${cashPerMember} por membro. Restante: ${remainingCash}`);

        // Distribuir cash para os membros
        let distributedCount = 0;
        for (const member of activeMembers.slice(0, membersToDivide)) {
          try {
            const user = await this.userRepository.findOne({ where: { id: member.userId } });
            if (user) {
              const currentCash = Number(user.cash || 0);
              user.cash = currentCash + cashPerMember;
              await this.userRepository.save(user);
              distributedCount++;
              this.logger.debug(`  ✅ Membro ${user.nickname || user.username} recebeu ${cashPerMember} cash (total agora: ${user.cash})`);
              const notificationContent = `O cash semanal do clã [${fullGroup.tag}] foi dividido. Você recebeu ${cashPerMember} de cash. O score semanal do clã foi zerado e a contagem recomeça agora.`;
              const notificationId = uuidv4();
              const createdAt = new Date().toISOString();
              // Persistir notificação para o jogador ver quando abrir o app (mesmo offline no momento da divisão)
              try {
                await this.systemNotificationRepository.save({
                  id: notificationId,
                  userId: Number(member.userId),
                  type: 'CLAN_CASH_DIVISION',
                  content: notificationContent,
                } as UserSystemNotification);
              } catch (persistErr: any) {
                this.logger.warn(`⚠️ [checkAndExecuteCashDivision] Falha ao salvar notificação para usuário ${member.userId}: ${persistErr?.message}`);
              }
              // Notificar em tempo real se estiver conectado
              if (this.duelsGateway) {
                try {
                  this.duelsGateway.emitSystemMessageToUser(Number(member.userId), {
                    id: notificationId,
                    type: 'CLAN_CASH_DIVISION',
                    content: notificationContent,
                    createdAt,
                  });
                } catch (notifErr: any) {
                  this.logger.warn(`⚠️ [checkAndExecuteCashDivision] Falha ao notificar em tempo real usuário ${member.userId}: ${notifErr?.message}`);
                }
              } else {
                this.logger.debug(`⚠️ [checkAndExecuteCashDivision] DuelsGateway não disponível; notificação persistida para usuário ${member.userId}.`);
              }
            }
          } catch (error: any) {
            this.logger.error(`❌ [checkAndExecuteCashDivision] Erro ao distribuir cash para membro ${member.userId}: ${error.message}`);
          }
        }

        // Zerar o score semanal de todos os membros ativos do clã (a contagem recomeça a partir deste momento)
        await this.memberRepository.query(
          `UPDATE group_members SET "weeklyScore" = 0, "weeklyScoreResetAt" = NOW() WHERE "groupId" = $1 AND "isActive" = true`,
          [fullGroup.id]
        );
        this.logger.log(`📊 [checkAndExecuteCashDivision] Grupo ${fullGroup.name}: score semanal dos membros zerado.`);

        // Atualizar cash do grupo (subtrair o que foi distribuído)
        fullGroup.totalCash = remainingCash;
        await this.groupRepository.save(fullGroup);

        this.logger.log(`✅ [checkAndExecuteCashDivision] Grupo ${fullGroup.name}: ${cashPerMember} cash distribuído para ${distributedCount}/${membersToDivide} membro(s). Restante no grupo: ${remainingCash}`);
      } catch (error: any) {
        this.logger.error(`❌ [checkAndExecuteCashDivision] Erro ao processar grupo ${group.id}: ${error.message}`);
        this.logger.error(error.stack);
      }
    }
  }

  // Buscar grupo por ID
  async getGroup(groupId: string): Promise<Group> {
    // Validar se groupId é um UUID válido (mas não bloquear se não for, apenas logar)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(groupId)) {
      this.logger.warn(`⚠️ [getGroup] ID do grupo não é um UUID válido: ${groupId}`);
      // Não bloquear, apenas tentar buscar mesmo assim (pode ser um ID legado)
    }

    // Usar query builder para evitar erro se colunas não existirem
    try {
      // NÃO recalcular estatísticas toda vez - isso pode causar problemas de performance
      // O recalculateGroupStats já é chamado quando necessário (updateMemberScore, joinGroup, leaveGroup, etc.)
      // Se precisar garantir dados atualizados, fazer apenas uma verificação rápida
      
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
        relations: ['members', 'members.user', 'leader'],
        select: {
          id: true,
          name: true,
          description: true,
          tag: true,
          logo: true,
          banner: true,
          leaderId: true,
          totalScore: true, // IMPORTANTE: Incluir totalScore no select
          seasonScore: true,
          level: true,
          totalCash: true,
          credits: true,
          totalWins: true,
          totalLosses: true,
          totalAchievements: true,
          maxMembers: true,
          isPublic: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      if (!group) {
        throw new NotFoundException('Grupo não encontrado');
      }

      const activeMembersCount = group.members?.filter(m => m.isActive).length || 0;
      this.logger.log(`📊 [getGroup] Grupo ${groupId} - totalScore: ${group.totalScore}, seasonScore: ${group.seasonScore}, totalCash: ${group.totalCash}, membros ativos: ${activeMembersCount}`);

      const sanitizedMembers = (group.members || []).map((m: any) => ({
        ...m,
        user: m.user ? { id: m.user.id, nickname: m.user.nickname, profileImage: m.user.profileImage, level: m.user.level ?? 1, clanTag: m.user.clanTag ?? null } : null,
      }));
      const leader = (group as any).leader;
      const sanitizedLeader = leader ? { id: leader.id, nickname: leader.nickname, profileImage: leader.profileImage, level: leader.level ?? 1, clanTag: leader.clanTag ?? null } : null;
      return {
        ...group,
        leader: sanitizedLeader,
        members: sanitizedMembers,
        memberCount: activeMembersCount,
      } as any;
    } catch (error: any) {
      // Se houver erro relacionado a colunas faltando, tentar adicionar e buscar novamente
      if (error.message?.includes('does not exist') || error.message?.includes('column')) {
        this.logger.warn('⚠️ [getGroup] Coluna não encontrada, tentando adicionar...');
        await this.onModuleInit(); // Tentar adicionar colunas
        // Tentar novamente
        const group = await this.groupRepository.findOne({
          where: { id: groupId },
          relations: ['members', 'members.user', 'leader'],
          select: {
            id: true,
            name: true,
            description: true,
            tag: true,
            logo: true,
            banner: true,
            leaderId: true,
            totalScore: true, // IMPORTANTE: Incluir totalScore no select
            seasonScore: true,
            level: true,
            totalCash: true,
            credits: true,
            totalWins: true,
            totalLosses: true,
            totalAchievements: true,
            maxMembers: true,
            isPublic: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          }
        });

        if (!group) {
          throw new NotFoundException('Grupo não encontrado');
        }

        const activeMembersCount = group.members?.filter(m => m.isActive).length || 0;
        this.logger.log(`📊 [getGroup] Grupo ${groupId} (fallback) - totalScore: ${group.totalScore}, seasonScore: ${group.seasonScore}`);
        const sanitizedMembers = (group.members || []).map((m: any) => ({
          ...m,
          user: m.user ? { id: m.user.id, nickname: m.user.nickname, profileImage: m.user.profileImage, level: m.user.level ?? 1, clanTag: m.user.clanTag ?? null } : null,
        }));
        const leader = (group as any).leader;
        const sanitizedLeader = leader ? { id: leader.id, nickname: leader.nickname, profileImage: leader.profileImage, level: leader.level ?? 1, clanTag: leader.clanTag ?? null } : null;
        return {
          ...group,
          leader: sanitizedLeader,
          members: sanitizedMembers,
          memberCount: activeMembersCount,
        } as any;
      }
      this.logger.error(`❌ [getGroup] Erro ao buscar grupo ${groupId}:`, error.message || error);
      throw error;
    }
  }

  // Listar todos os grupos
  async getAllGroups(isPublic?: boolean): Promise<Group[]> {
    const where: any = { isActive: true };
    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    try {
      const groups = await this.groupRepository.find({
        where,
        relations: ['members', 'leader'],
        order: { totalScore: 'DESC' }
      });

      // Adicionar contagem de membros ativos e filtrar grupos sem líder
      return groups
        .filter(group => group.leader) // Filtrar grupos sem líder
        .map(group => ({
          ...group,
          memberCount: group.members?.filter(m => m.isActive).length || 0,
        })) as any;
    } catch (error: any) {
      this.logger.error('❌ [getAllGroups] Erro ao buscar grupos:', error.message);
      
      // Se houver erro relacionado a colunas faltando, tentar adicionar e buscar novamente
      if (error.message?.includes('does not exist') || error.message?.includes('column')) {
        this.logger.warn('⚠️ [getAllGroups] Coluna não encontrada, tentando adicionar...');
        try {
          await this.onModuleInit(); // Tentar adicionar colunas
          // Tentar novamente
          const groups = await this.groupRepository.find({
            where,
            relations: ['members', 'leader'],
            order: { totalScore: 'DESC' }
          });

          return groups
            .filter(group => group.leader)
            .map(group => ({
              ...group,
              memberCount: group.members?.filter(m => m.isActive).length || 0,
            })) as any;
        } catch (retryError: any) {
          this.logger.error('❌ [getAllGroups] Erro ao tentar novamente:', retryError.message);
          // Retornar array vazio em vez de lançar erro
          return [];
        }
      }
      
      // Se for outro tipo de erro, retornar array vazio em vez de lançar
      this.logger.error('❌ [getAllGroups] Erro desconhecido, retornando array vazio');
      return [];
    }
  }

  // Ranking semanal do grupo
  async getWeeklyRanking(groupId: string): Promise<GroupMember[]> {
    return this.memberRepository.find({
      where: { groupId, isActive: true },
      relations: ['user'],
      order: { weeklyScore: 'DESC' }
    });
  }

  // Ranking da season do grupo
  async getSeasonRanking(groupId: string): Promise<GroupMember[]> {
    return this.memberRepository.find({
      where: { groupId, isActive: true },
      relations: ['user'],
      order: { seasonScore: 'DESC' }
    });
  }

  // Ranking geral do grupo
  async getTotalRanking(groupId: string): Promise<GroupMember[]> {
    return this.memberRepository.find({
      where: { groupId, isActive: true },
      relations: ['user'],
      order: { totalScore: 'DESC' }
    });
  }

  // Ranking entre grupos (por total score)
  async getGroupsRanking(): Promise<Group[]> {
    return this.groupRepository.find({
      where: { isActive: true },
      relations: ['leader', 'members'],
      order: { totalScore: 'DESC' },
      take: 100
    });
  }

  // Ranking de clãs por season score (soma dos seasonScore dos membros)
  async getGroupsSeasonRanking(): Promise<any[]> {
    const groups = await this.groupRepository
      .createQueryBuilder('g')
      .leftJoin('g.members', 'member', 'member.isActive = :memberActive', { memberActive: true })
      .leftJoin('g.leader', 'leader')
      .select('g.id', 'id')
      .addSelect('g.name', 'name')
      .addSelect('g.tag', 'tag')
      .addSelect('g.logo', 'logo')
      .addSelect('g.banner', 'banner')
      .addSelect('g.totalCash', 'totalCash')
      .addSelect('g.credits', 'credits')
      .addSelect('g.totalWins', 'totalWins')
      .addSelect('g.totalLosses', 'totalLosses')
      .addSelect('g.totalAchievements', 'totalAchievements')
      .addSelect('leader.nickname', 'leader_nickname')
      .addSelect('leader.profileImage', 'leader_profileImage')
      .addSelect('SUM(member.seasonScore)', 'seasonScore')
      .addSelect('COUNT(DISTINCT member.id)', 'memberCount')
      .where('g.isActive = :isActive', { isActive: true })
      .andWhere('leader.id IS NOT NULL')
      .groupBy('g.id')
      .addGroupBy('g.name')
      .addGroupBy('g.tag')
      .addGroupBy('g.logo')
      .addGroupBy('g.banner')
      .addGroupBy('g.totalCash')
      .addGroupBy('g.credits')
      .addGroupBy('g.totalWins')
      .addGroupBy('g.totalLosses')
      .addGroupBy('g.totalAchievements')
      .addGroupBy('leader.nickname')
      .addGroupBy('leader.profileImage')
      .having('COUNT(DISTINCT member.id) > 0')
      .orderBy('SUM(member.seasonScore)', 'DESC')
      .getRawMany();

    return groups.map((group, index) => ({
      rank: index + 1,
      id: group.id,
      name: group.name,
      tag: group.tag,
      logo: group.logo,
      banner: group.banner,
      totalCash: Number(group.totalCash || 0),
      credits: Number(group.credits || 0),
      totalWins: Number(group.totalWins || 0),
      totalLosses: Number(group.totalLosses || 0),
      totalAchievements: Number(group.totalAchievements || 0),
      seasonScore: Number(group.seasonScore || 0),
      memberCount: Number(group.memberCount || 0),
      leader: {
        nickname: group.leader_nickname,
        profileImage: (group.leader_profileImage && !group.leader_profileImage.includes('/images/default') && !group.leader_profileImage.includes('/avatars/default')) 
          ? group.leader_profileImage 
          : null,
      },
    }));
  }

  // Ranking de clãs por total score (soma dos totalScore dos membros)
  async getGroupsGeneralRanking(): Promise<any[]> {
    // Usar o totalScore já calculado na tabela groups (atualizado pelo recalculateGroupStats)
    // Isso é mais eficiente e garante consistência
    const groups = await this.groupRepository
      .createQueryBuilder('g')
      .leftJoin('g.members', 'member', 'member.isActive = :memberActive', { memberActive: true })
      .leftJoin('g.leader', 'leader')
      .select('g.id', 'id')
      .addSelect('g.name', 'name')
      .addSelect('g.tag', 'tag')
      .addSelect('g.logo', 'logo')
      .addSelect('g.banner', 'banner')
      .addSelect('g.totalCash', 'totalCash')
      .addSelect('g.credits', 'credits')
      .addSelect('g.totalWins', 'totalWins')
      .addSelect('g.totalLosses', 'totalLosses')
      .addSelect('g.totalAchievements', 'totalAchievements')
      .addSelect('g.totalScore', 'totalScore') // Usar o totalScore da tabela groups
      .addSelect('leader.nickname', 'leader_nickname')
      .addSelect('leader.profileImage', 'leader_profileImage')
      .addSelect('COUNT(DISTINCT member.id)', 'memberCount')
      .where('g.isActive = :isActive', { isActive: true })
      .andWhere('leader.id IS NOT NULL')
      .groupBy('g.id')
      .addGroupBy('g.name')
      .addGroupBy('g.tag')
      .addGroupBy('g.logo')
      .addGroupBy('g.banner')
      .addGroupBy('g.totalCash')
      .addGroupBy('g.credits')
      .addGroupBy('g.totalWins')
      .addGroupBy('g.totalLosses')
      .addGroupBy('g.totalAchievements')
      .addGroupBy('g.totalScore') // Adicionar ao groupBy
      .addGroupBy('leader.nickname')
      .addGroupBy('leader.profileImage')
      .having('COUNT(DISTINCT member.id) > 0')
      .orderBy('g.totalScore', 'DESC') // Ordenar pelo totalScore da tabela groups
      .getRawMany();

    return groups.map((group, index) => ({
      rank: index + 1,
      id: group.id,
      name: group.name,
      tag: group.tag,
      logo: group.logo,
      banner: group.banner,
      totalCash: Number(group.totalCash || 0),
      credits: Number(group.credits || 0),
      totalWins: Number(group.totalWins || 0),
      totalLosses: Number(group.totalLosses || 0),
      totalAchievements: Number(group.totalAchievements || 0),
      totalScore: Number(group.totalScore || 0),
      memberCount: Number(group.memberCount || 0),
      leader: {
        nickname: group.leader_nickname,
        profileImage: (group.leader_profileImage && !group.leader_profileImage.includes('/images/default') && !group.leader_profileImage.includes('/avatars/default')) 
          ? group.leader_profileImage 
          : null,
      },
    }));
  }

  // Top 5 grupos da season - otimizado
  async getTop5Groups(): Promise<any[]> {
    // Buscar apenas grupos ativos que têm pelo menos 1 membro ativo
    const groups = await this.groupRepository
      .createQueryBuilder('g')
      .leftJoin('g.leader', 'leader')
      .leftJoin('g.members', 'member', 'member.isActive = :memberActive', { memberActive: true })
      .select('g.id', 'id')
      .addSelect('g.name', 'name')
      .addSelect('g.tag', 'tag')
      .addSelect('g.logo', 'logo')
      .addSelect('g.totalScore', 'totalScore')
      .addSelect('g.totalCash', 'totalCash')
      .addSelect('g.credits', 'credits')
      .addSelect('g.totalWins', 'totalWins')
      .addSelect('g.totalLosses', 'totalLosses')
      .addSelect('g.totalAchievements', 'totalAchievements')
      .addSelect('leader.nickname', 'leader_nickname')
      .addSelect('COUNT(DISTINCT member.id)', 'memberCount')
      .where('g.isActive = :isActive', { isActive: true })
      .andWhere('leader.id IS NOT NULL') // Garantir que tem líder
      .groupBy('g.id')
      .addGroupBy('g.name')
      .addGroupBy('g.tag')
      .addGroupBy('g.logo')
      .addGroupBy('g.totalScore')
      .addGroupBy('g.totalCash')
      .addGroupBy('g.credits')
      .addGroupBy('g.totalWins')
      .addGroupBy('g.totalLosses')
      .addGroupBy('g.totalAchievements')
      .addGroupBy('leader.nickname')
      .having('COUNT(DISTINCT member.id) > 0') // Apenas grupos com pelo menos 1 membro ativo
      .orderBy('g.totalScore', 'DESC')
      .limit(5)
      .getRawMany();

    // Filtrar grupos que realmente existem e têm dados válidos
    const validGroups = groups.filter(group => 
      group.id && 
      group.name && 
      group.tag &&
      Number(group.memberCount || 0) > 0
    );

    return validGroups.map((group, index) => ({
      rank: index + 1,
      id: group.id,
      name: group.name,
      tag: group.tag,
      logo: group.logo,
      totalScore: Number(group.totalScore || 0),
      totalCash: Number(group.totalCash || 0),
      credits: Number(group.credits || 0),
      totalWins: Number(group.totalWins || 0),
      totalLosses: Number(group.totalLosses || 0),
      totalAchievements: Number(group.totalAchievements || 0),
      memberCount: Number(group.memberCount || 0),
      leaderName: group.leader_nickname || 'Desconhecido',
    }));
  }

  // Atualizar grupo (apenas o líder pode)
  async updateGroup(userId: number, groupId: string, updateData: { name?: string; tag?: string; description?: string; logo?: string; banner?: string; isPublic?: boolean; cashDivisionMembers?: number | null }): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['leader']
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    if (group.leaderId !== userId) {
      throw new BadRequestException('Apenas o líder pode editar o grupo');
    }

    // Verificar se nome ou tag já existem (se estiver sendo alterado)
    if (updateData.name) {
      const existingGroup = await this.groupRepository.findOne({
        where: { name: updateData.name }
      });
      if (existingGroup && existingGroup.id !== groupId) {
        throw new BadRequestException('Nome do grupo já existe');
      }
    }
    
    let normalizedTag: string | undefined;
    if (updateData.tag !== undefined) {
      normalizedTag = String(updateData.tag).trim().toUpperCase();
      if (!normalizedTag || normalizedTag.length !== 3) {
        throw new BadRequestException('A tag do clã deve ter exatamente 3 letras');
      }
      if (!/^[A-Z]{3}$/.test(normalizedTag)) {
        throw new BadRequestException('A tag do clã deve conter apenas 3 letras (A–Z)');
      }
      const existingGroup = await this.groupRepository.findOne({
        where: { tag: normalizedTag }
      });
      if (existingGroup && existingGroup.id !== groupId) {
        throw new BadRequestException('Tag do grupo já existe');
      }
    }

    // Atualizar campos
    if (updateData.name !== undefined) group.name = updateData.name;
    if (updateData.tag !== undefined && normalizedTag) {
      group.tag = normalizedTag;
      // Atualizar clanTag de todos os membros se a tag mudou
      const members = await this.memberRepository.find({
        where: { groupId, isActive: true }
      });
      if (members.length > 0) {
        const userIds = members.map(m => m.userId);
        await this.userRepository.update(
          { id: In(userIds) },
          { clanTag: normalizedTag }
        );
      }
    }
    if (updateData.description !== undefined) group.description = updateData.description;
    if (updateData.logo !== undefined) group.logo = updateData.logo;
    if (updateData.banner !== undefined) group.banner = updateData.banner;
    if (updateData.isPublic !== undefined) group.isPublic = updateData.isPublic;
    if (updateData.cashDivisionMembers !== undefined) {
      if (updateData.cashDivisionMembers !== null && updateData.cashDivisionMembers < 1) {
        throw new BadRequestException('Número de membros para divisão deve ser pelo menos 1');
      }
      group.cashDivisionMembers = updateData.cashDivisionMembers;
    }

    return await this.groupRepository.save(group);
  }

  // Configurar divisão de cash padrão (apenas admin)
  async setCashDivisionDefault(dayOfWeek: number, time: string, defaultMembers: number): Promise<void> {
    // Validar dia da semana (0-6)
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new BadRequestException('Dia da semana inválido. Use 0 (Domingo) a 6 (Sábado)');
    }

    // Validar formato de horário (HH:mm)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      throw new BadRequestException('Formato de horário inválido. Use HH:mm (ex: 14:30)');
    }

    // Validar número de membros
    if (defaultMembers < 1) {
      throw new BadRequestException('Número de membros deve ser pelo menos 1');
    }

    // Atualizar todos os grupos ativos com a configuração padrão
    await this.groupRepository.update(
      { isActive: true },
      {
        cashDivisionDayOfWeek: dayOfWeek,
        cashDivisionTime: time,
        cashDivisionDefaultMembers: defaultMembers,
      }
    );

    this.logger.log(`✅ [setCashDivisionDefault] Configuração padrão de divisão de cash atualizada: ${dayOfWeek} às ${time} para ${defaultMembers} membros`);
  }

  // Obter configuração padrão de divisão de cash
  async getCashDivisionDefault(): Promise<{ dayOfWeek: number | null; time: string | null; defaultMembers: number | null }> {
    const group = await this.groupRepository.findOne({
      where: { isActive: true },
      order: { updatedAt: 'DESC' },
    });

    if (!group) {
      return { dayOfWeek: null, time: null, defaultMembers: null };
    }

    return {
      dayOfWeek: group.cashDivisionDayOfWeek,
      time: group.cashDivisionTime,
      defaultMembers: group.cashDivisionDefaultMembers,
    };
  }

  // Buscar conquistas do grupo
  async getGroupAchievements(groupId: string): Promise<any[]> {
    // Buscar todos os membros ativos do grupo
    const members = await this.memberRepository.find({
      where: { groupId, isActive: true },
      select: ['userId']
    });

    if (members.length === 0) {
      return [];
    }

    const userIds = members.map(m => m.userId);

    // Buscar todas as conquistas dos membros
    const achievements = await this.achievementRepository.find({
      where: { userId: In(userIds) },
      relations: ['user'],
      order: { unlockedAt: 'DESC' },
      take: 100 // Limitar a 100 conquistas mais recentes
    });

    // Formatar conquistas com informações do usuário
    return achievements.map(achievement => ({
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon, // Incluir a imagem do troféu
      unlockedAt: achievement.unlockedAt,
      user: {
        id: achievement.user.id,
        nickname: achievement.user.nickname,
        profileImage: achievement.user.profileImage,
        clanTag: achievement.user.clanTag
      }
    }));
  }

  // Excluir grupo (apenas o líder pode)
  async deleteGroup(userId: number, groupId: string, password?: string): Promise<void> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['leader']
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    if (group.leaderId !== userId) {
      throw new BadRequestException('Apenas o líder pode excluir o grupo');
    }

    // Validar senha se fornecida
    if (!password) {
      throw new BadRequestException('Senha é obrigatória para excluir o grupo');
    }

    // Buscar o usuário para verificar a senha
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password']
    });

    if (!user || !user.password) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Senha incorreta');
    }

    // Desativar grupo (soft delete)
    group.isActive = false;
    await this.groupRepository.save(group);

    // Buscar todos os membros ativos do grupo
    const activeMembers = await this.memberRepository.find({
      where: { groupId, isActive: true },
    });

    // Desativar todos os membros e limpar clanTag
    await this.memberRepository.update(
      { groupId },
      { isActive: false }
    );

    // Limpar clanTag de todos os membros
    const userIds = activeMembers.map(m => m.userId);
    if (userIds.length > 0) {
      await this.userRepository.update(
        { id: In(userIds) },
        { clanTag: null as any }
      );
    }
  }
}
