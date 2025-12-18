import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
import { GroupMessage } from './entities/group-message.entity';
import { User } from '../users/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private memberRepository: Repository<GroupMember>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(GroupMessage)
    private messageRepository: Repository<GroupMessage>,
  ) {}

  // Criar grupo
  async createGroup(userId: number, name: string, tag: string, description?: string, logo?: string, banner?: string): Promise<Group> {
    // Verifica se usuário já tem grupo
    const existingMembership = await this.memberRepository.findOne({
      where: { userId, isActive: true }
    });

    if (existingMembership) {
      throw new BadRequestException('Você já pertence a um grupo');
    }

    // Verifica se nome ou tag já existem
    const existingGroup = await this.groupRepository.findOne({
      where: [{ name }, { tag }]
    });

    if (existingGroup) {
      throw new BadRequestException('Nome ou tag do grupo já existe');
    }

    const group = new Group();
    group.name = name;
    group.tag = tag ?? null;
    group.description = description ?? null;
    group.logo = logo ?? null;
    group.banner = banner ?? null;
    group.leaderId = userId;
    group.isPublic = true;
    group.isActive = true;

    const savedGroup = await this.groupRepository.save(group);

    // Adiciona criador como líder
    const member = this.memberRepository.create({
      groupId: savedGroup.id,
      userId,
      role: GroupRole.LEADER,
      weeklyScore: 0,
      seasonScore: 0,
      totalScore: 0
    });

    await this.memberRepository.save(member);

    // Atualizar clanTag do usuário no banco de dados
    console.log(`🏷️ [createGroup] Atualizando clanTag do usuário ${userId} para "${tag}"`);
    const updateResult = await this.userRepository.update(userId, { clanTag: tag });
    console.log(`✅ [createGroup] clanTag atualizado. Resultado:`, updateResult);
    
    // Verificar se foi salvo corretamente
    const updatedUser = await this.userRepository.findOne({ where: { id: userId } });
    console.log(`🔍 [createGroup] Verificação - clanTag do usuário após update:`, updatedUser?.clanTag);

    return savedGroup;
  }

  // Entrar em um grupo
  async joinGroup(userId: number, groupId: string): Promise<GroupMember> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId, isActive: true },
      relations: ['members']
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    if (!group.isPublic) {
      throw new ForbiddenException('Grupo privado, necessário convite');
    }

    if (group.members.filter(m => m.isActive).length >= group.maxMembers) {
      throw new BadRequestException('Grupo está cheio');
    }

    // Verifica se usuário já está em outro grupo
    const existingMembership = await this.memberRepository.findOne({
      where: { userId, isActive: true }
    });

    if (existingMembership) {
      throw new BadRequestException('Você já pertence a um grupo');
    }

    const member = this.memberRepository.create({
      groupId: group.id,
      userId,
      role: GroupRole.MEMBER,
      weeklyScore: 0,
      seasonScore: 0,
      totalScore: 0
    });

    await this.memberRepository.save(member);

    // Atualizar clanTag do usuário no banco de dados
    console.log(`🏷️ [joinGroup] Atualizando clanTag do usuário ${userId} para "${group.tag}"`);
    const updateResult = await this.userRepository.update(userId, { clanTag: group.tag });
    console.log(`✅ [joinGroup] clanTag atualizado. Resultado:`, updateResult);
    
    // Verificar se foi salvo corretamente
    const updatedUser = await this.userRepository.findOne({ where: { id: userId } });
    console.log(`🔍 [joinGroup] Verificação - clanTag do usuário após update:`, updatedUser?.clanTag);

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
  }

  // Verificar se usuário é membro do grupo
  async isMember(userId: number, groupId: string): Promise<boolean> {
    const member = await this.memberRepository.findOne({
      where: { userId, groupId, isActive: true }
    });
    return !!member;
  }

  // Chat de clã
  async getGroupMessages(groupId: string, userId: number, limit: number = 50): Promise<GroupMessage[]> {
    // Verificar se é membro
    const isMember = await this.isMember(userId, groupId);
    if (!isMember) {
      throw new ForbiddenException('Você não é membro deste clã');
    }

    const messages = await this.messageRepository.find({
      where: { groupId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return messages.reverse(); // Ordenar do mais antigo para o mais recente
  }

  async sendGroupMessage(groupId: string, userId: number, message: string): Promise<GroupMessage> {
    // Verificar se é membro
    const isMember = await this.isMember(userId, groupId);
    if (!isMember) {
      throw new ForbiddenException('Você não é membro deste clã');
    }

    if (!message || message.trim().length === 0) {
      throw new BadRequestException('Mensagem não pode estar vazia');
    }

    if (message.length > 500) {
      throw new BadRequestException('Mensagem muito longa (máximo 500 caracteres)');
    }

    const groupMessage = this.messageRepository.create({
      groupId,
      userId,
      message: message.trim(),
    });

    const saved = await this.messageRepository.save(groupMessage);
    const savedMessage = await this.messageRepository.findOne({
      where: { id: saved.id },
      relations: ['user', 'group'],
    });
    
    if (!savedMessage) {
      throw new BadRequestException('Erro ao salvar mensagem');
    }
    
    return savedMessage;
  }

  // Atualizar score de um membro
  async updateMemberScore(userId: number, scoreToAdd: number): Promise<void> {
    const member = await this.memberRepository.findOne({
      where: { userId, isActive: true }
    });

    if (!member) {
      return; // Usuário não está em nenhum grupo
    }

    member.weeklyScore += scoreToAdd;
    member.seasonScore += scoreToAdd;
    member.totalScore += scoreToAdd;

    await this.memberRepository.save(member);

    // Atualiza score total do grupo
    await this.groupRepository.update(member.groupId, {
      totalScore: () => `"totalScore" + ${scoreToAdd}`
    });
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

  // Buscar grupo por ID
  async getGroup(groupId: string): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['members', 'members.user', 'leader']
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    return group;
  }

  // Listar todos os grupos
  async getAllGroups(isPublic?: boolean): Promise<Group[]> {
    const where: any = { isActive: true };
    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    return this.groupRepository.find({
      where,
      relations: ['members', 'leader'],
      order: { totalScore: 'DESC' }
    });
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

  // Ranking entre grupos
  async getGroupsRanking(): Promise<Group[]> {
    return this.groupRepository.find({
      where: { isActive: true },
      relations: ['leader', 'members'],
      order: { totalScore: 'DESC' },
      take: 100
    });
  }

  // Top 5 grupos da season - otimizado
  async getTop5Groups(): Promise<any[]> {
    // Usar QueryBuilder para melhor performance
    const groups = await this.groupRepository
      .createQueryBuilder('g')
      .leftJoin('g.leader', 'leader')
      .leftJoin('g.members', 'member')
      .select('g.id', 'id')
      .addSelect('g.name', 'name')
      .addSelect('g.tag', 'tag')
      .addSelect('g.totalScore', 'totalScore')
      .addSelect('leader.nickname', 'leader_nickname')
      .addSelect('COUNT(CASE WHEN member.isActive = true THEN 1 END)', 'memberCount')
      .where('g.isActive = :isActive', { isActive: true })
      .groupBy('g.id')
      .addGroupBy('leader.nickname')
      .orderBy('g.totalScore', 'DESC')
      .limit(5)
      .getRawMany();

    return groups.map((group, index) => ({
      rank: index + 1,
      id: group.id || group.g_id,
      name: group.name || group.g_name,
      tag: group.tag || group.g_tag,
      totalScore: Number(group.totalScore || group.g_totalScore || 0),
      memberCount: Number(group.memberCount || 0),
      leaderName: group.leader_nickname || 'Desconhecido',
    }));
  }

  // Atualizar grupo (apenas o líder pode)
  async updateGroup(userId: number, groupId: string, updateData: { name?: string; tag?: string; description?: string; logo?: string; banner?: string; isPublic?: boolean }): Promise<Group> {
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
    
    if (updateData.tag) {
      const existingGroup = await this.groupRepository.findOne({
        where: { tag: updateData.tag }
      });
      if (existingGroup && existingGroup.id !== groupId) {
        throw new BadRequestException('Tag do grupo já existe');
      }
    }

    // Atualizar campos
    if (updateData.name !== undefined) group.name = updateData.name;
    if (updateData.tag !== undefined) {
      group.tag = updateData.tag;
      // Atualizar clanTag de todos os membros se a tag mudou
      const members = await this.memberRepository.find({
        where: { groupId, isActive: true }
      });
      if (members.length > 0) {
        const userIds = members.map(m => m.userId);
        await this.userRepository.update(
          { id: In(userIds) },
          { clanTag: updateData.tag }
        );
      }
    }
    if (updateData.description !== undefined) group.description = updateData.description;
    if (updateData.logo !== undefined) group.logo = updateData.logo;
    if (updateData.banner !== undefined) group.banner = updateData.banner;
    if (updateData.isPublic !== undefined) group.isPublic = updateData.isPublic;

    return await this.groupRepository.save(group);
  }

  // Excluir grupo (apenas o líder pode)
  async deleteGroup(userId: number, groupId: string): Promise<void> {
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
