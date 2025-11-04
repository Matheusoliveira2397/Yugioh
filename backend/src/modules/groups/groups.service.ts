import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
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
  ) {}

  // Criar grupo
  async createGroup(userId: string, name: string, tag: string, description?: string): Promise<Group> {
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

    const group = this.groupRepository.create({
      name,
      tag,
      description,
      leaderId: userId,
      isPublic: true,
      isActive: true
    });

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

    return savedGroup;
  }

  // Entrar em um grupo
  async joinGroup(userId: string, groupId: string): Promise<GroupMember> {
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

    return this.memberRepository.save(member);
  }

  // Sair do grupo
  async leaveGroup(userId: string, groupId: string): Promise<void> {
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
  }

  // Atualizar score de um membro
  async updateMemberScore(userId: string, scoreToAdd: number): Promise<void> {
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

  // Excluir grupo (apenas o líder pode)
  async deleteGroup(userId: string, groupId: string): Promise<void> {
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

    // Desativar todos os membros
    await this.memberRepository.update(
      { groupId },
      { isActive: false }
    );
  }
}
