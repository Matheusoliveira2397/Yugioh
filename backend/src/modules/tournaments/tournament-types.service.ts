import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TournamentType } from './entities/tournament-type.entity';
import { Tournament } from './entities/tournament.entity';

@Injectable()
export class TournamentTypesService {
  constructor(
    @InjectRepository(TournamentType)
    private readonly typeRepository: Repository<TournamentType>,
    @InjectRepository(Tournament)
    private readonly tournamentRepository: Repository<Tournament>,
  ) {}

  async findAll(): Promise<TournamentType[]> {
    return this.typeRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<TournamentType> {
    const type = await this.typeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Tipo de torneio não encontrado');
    return type;
  }

  async create(data: Partial<TournamentType>): Promise<TournamentType> {
    if (!data.name?.trim()) {
      throw new BadRequestException('Nome do tipo é obrigatório');
    }
    const type = this.typeRepository.create({
      name: data.name!.trim(),
      description: data.description?.trim() ?? null,
      defaultBanlist: data.defaultBanlist ?? null,
      defaultEntryFee: data.defaultEntryFee ?? 0,
      defaultEntryFeeType: data.defaultEntryFeeType === 'cash' ? 'cash' : 'credit',
      defaultMaxParticipants: data.defaultMaxParticipants ?? 16,
      defaultMinLevel: data.defaultMinLevel ?? 1,
      defaultMaxLevel: data.defaultMaxLevel ?? null,
      defaultPrizeDetails: data.defaultPrizeDetails ?? null,
    } as Partial<TournamentType>);
    return this.typeRepository.save(type) as Promise<TournamentType>;
  }

  async update(id: string, data: Partial<TournamentType>): Promise<TournamentType> {
    const type = await this.findOne(id);
    if (data.name != null) type.name = data.name.trim();
    if (data.description !== undefined) type.description = data.description?.trim() ?? null;
    if (data.defaultBanlist !== undefined) type.defaultBanlist = data.defaultBanlist;
    if (data.defaultEntryFee != null) type.defaultEntryFee = data.defaultEntryFee;
    if (data.defaultEntryFeeType != null) type.defaultEntryFeeType = data.defaultEntryFeeType === 'cash' ? 'cash' : 'credit';
    if (data.defaultMaxParticipants != null) type.defaultMaxParticipants = data.defaultMaxParticipants;
    if (data.defaultMinLevel != null) type.defaultMinLevel = data.defaultMinLevel;
    if (data.defaultMaxLevel !== undefined) type.defaultMaxLevel = data.defaultMaxLevel;
    if (data.defaultPrizeDetails !== undefined) type.defaultPrizeDetails = data.defaultPrizeDetails;
    return this.typeRepository.save(type);
  }

  async remove(id: string): Promise<{ message: string }> {
    const type = await this.findOne(id);
    const used = await this.tournamentRepository.count({ where: { tournamentTypeId: id } });
    if (used > 0) {
      throw new BadRequestException(`Não é possível excluir: ${used} torneio(s) usam este tipo.`);
    }
    await this.typeRepository.remove(type);
    return { message: 'Tipo de torneio excluído com sucesso' };
  }

  /**
   * Retorna o próximo nome sugerido para um torneio deste tipo (ex.: "Torneio Season 2").
   */
  async getNextSequence(typeId: string): Promise<{ nextName: string; nextNumber: number }> {
    const type = await this.findOne(typeId);
    const baseName = type.name.trim();
    const allOfType = await this.tournamentRepository.find({
      where: { tournamentTypeId: typeId },
      select: ['name'],
      order: { createdAt: 'DESC' },
    });
    const numbers: number[] = [];
    const baseLower = baseName.toLowerCase();
    for (const t of allOfType) {
      const n = t.name.trim();
      if (n.toLowerCase() === baseLower) {
        numbers.push(1);
        continue;
      }
      if (n.toLowerCase().startsWith(baseLower)) {
        const suffix = n.slice(baseName.length).trim();
        const match = suffix.match(/^\s*(\d+)\s*$/);
        if (match) numbers.push(parseInt(match[1], 10));
      }
    }
    const nextNumber = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    const nextName = `${baseName} ${nextNumber}`;
    return { nextName, nextNumber };
  }
}
