import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Playmat } from './entities/playmat.entity';
import { Sleeve } from './entities/sleeve.entity';
import { CreatePlaymatDto } from './dto/create-playmat.dto';
import { CreateSleeveDto } from './dto/create-sleeve.dto';

@Injectable()
export class CosmeticsService {
  constructor(
    @InjectRepository(Playmat)
    private playmatRepository: Repository<Playmat>,
    @InjectRepository(Sleeve)
    private sleeveRepository: Repository<Sleeve>,
  ) {}

  // ==================== PLAYMATS ====================

  async createPlaymat(createPlaymatDto: CreatePlaymatDto): Promise<Playmat> {
    console.log('🎨 [CosmeticsService] Creating playmat with data:', createPlaymatDto);
    try {
      const playmat = this.playmatRepository.create(createPlaymatDto);
      const saved = await this.playmatRepository.save(playmat);
      console.log('✅ [CosmeticsService] Playmat saved:', saved.id);
      return saved;
    } catch (error) {
      console.error('❌ [CosmeticsService] Error saving playmat:', error);
      throw error;
    }
  }

  async findAllPlaymats(): Promise<Playmat[]> {
    return this.playmatRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findPlaymatsForSale(): Promise<Playmat[]> {
    return this.playmatRepository.find({
      where: { isActive: true, isForSale: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOnePlaymat(id: string): Promise<Playmat> {
    const playmat = await this.playmatRepository.findOne({ where: { id } });
    if (!playmat) {
      throw new NotFoundException(`Playmat com ID ${id} não encontrado`);
    }
    return playmat;
  }

  async updatePlaymat(id: string, updateData: Partial<CreatePlaymatDto>): Promise<Playmat> {
    const playmat = await this.findOnePlaymat(id);
    Object.assign(playmat, updateData);
    return this.playmatRepository.save(playmat);
  }

  async deletePlaymat(id: string): Promise<void> {
    const playmat = await this.findOnePlaymat(id);
    await this.playmatRepository.remove(playmat);
  }

  // ==================== SLEEVES ====================

  async createSleeve(createSleeveDto: CreateSleeveDto): Promise<Sleeve> {
    const sleeve = this.sleeveRepository.create(createSleeveDto);
    return this.sleeveRepository.save(sleeve);
  }

  async findAllSleeves(): Promise<Sleeve[]> {
    return this.sleeveRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findSleevesForSale(): Promise<Sleeve[]> {
    return this.sleeveRepository.find({
      where: { isActive: true, isForSale: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneSleeve(id: string): Promise<Sleeve> {
    const sleeve = await this.sleeveRepository.findOne({ where: { id } });
    if (!sleeve) {
      throw new NotFoundException(`Sleeve com ID ${id} não encontrado`);
    }
    return sleeve;
  }

  async updateSleeve(id: string, updateData: Partial<CreateSleeveDto>): Promise<Sleeve> {
    const sleeve = await this.findOneSleeve(id);
    Object.assign(sleeve, updateData);
    return this.sleeveRepository.save(sleeve);
  }

  async deleteSleeve(id: string): Promise<void> {
    const sleeve = await this.findOneSleeve(id);
    await this.sleeveRepository.remove(sleeve);
  }
}

