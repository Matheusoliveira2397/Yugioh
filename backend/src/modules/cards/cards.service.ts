import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Card } from './entities/card.entity';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private cardsRepository: Repository<Card>,
  ) {}

  async findAll(search?: string, type?: string): Promise<Card[]> {
    const where: any = {};
    
    if (search) {
      where.name = Like(`%${search}%`);
    }
    
    if (type) {
      where.type = type;
    }

    return this.cardsRepository.find({
      where,
      take: 100,
    });
  }

  async findOne(id: string): Promise<Card | null> {
    return this.cardsRepository.findOne({ where: { id } });
  }

  async seed() {
    // Método para popular banco com cartas iniciais
    const sampleCards = [
      {
        name: 'Dark Magician',
        type: 'Monster',
        attribute: 'DARK',
        level: 7,
        attack: 2500,
        defense: 2100,
        description: 'The ultimate wizard in terms of attack and defense.',
      },
      {
        name: 'Blue-Eyes White Dragon',
        type: 'Monster',
        attribute: 'LIGHT',
        level: 8,
        attack: 3000,
        defense: 2500,
        description: 'This legendary dragon is a powerful engine of destruction.',
      },
    ];

    for (const cardData of sampleCards) {
      const exists = await this.cardsRepository.findOne({
        where: { name: cardData.name },
      });
      
      if (!exists) {
        const card = this.cardsRepository.create(cardData);
        await this.cardsRepository.save(card);
      }
    }
  }
}
