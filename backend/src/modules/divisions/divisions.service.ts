import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Division } from '../admin/entities/division.entity';

@Injectable()
export class DivisionsService {
  constructor(
    @InjectRepository(Division)
    private divisionsRepository: Repository<Division>,
  ) {}

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
    console.warn('⚠️ [DivisionsService] Nenhuma divisão disponível, usando Bronze como padrão');
    return 'Bronze';
  }
}

