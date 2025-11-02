import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deck } from './entities/deck.entity';
import { DeckCard } from './entities/deck-card.entity';
import { CreateDeckDto } from './dto/create-deck.dto';

@Injectable()
export class DecksService {
  constructor(
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(DeckCard)
    private deckCardsRepository: Repository<DeckCard>,
  ) {}

  async create(userId: string, createDeckDto: CreateDeckDto): Promise<Deck> {
    // Validar tamanho do deck (40-60 cartas no main deck)
    if (createDeckDto.cards.length < 40 || createDeckDto.cards.length > 60) {
      throw new BadRequestException('Deck must have between 40 and 60 cards');
    }

    const deck = this.decksRepository.create({
      name: createDeckDto.name,
      userId,
    });

    const savedDeck = await this.decksRepository.save(deck);

    // Adicionar cartas ao deck
    const deckCards = createDeckDto.cards.map((cardId) =>
      this.deckCardsRepository.create({
        deckId: savedDeck.id,
        cardId,
      }),
    );

    await this.deckCardsRepository.save(deckCards);

    return this.findOne(savedDeck.id);
  }

  async findAll(userId: string): Promise<Deck[]> {
    return this.decksRepository.find({
      where: { userId },
      relations: ['cards', 'cards.card'],
    });
  }

  async findOne(id: string): Promise<Deck> {
    const deck = await this.decksRepository.findOne({
      where: { id },
      relations: ['cards', 'cards.card'],
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  async delete(id: string, userId: string): Promise<void> {
    const deck = await this.findOne(id);
    
    if (deck.userId !== userId) {
      throw new BadRequestException('You can only delete your own decks');
    }

    await this.decksRepository.delete(id);
  }
}
