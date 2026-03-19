import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnimeDeck } from './entities/anime-deck.entity';
import { AnimeDeckCard } from './entities/anime-deck-card.entity';

@Injectable()
export class AnimeDecksService {
  constructor(
    @InjectRepository(AnimeDeck)
    private animeDeckRepository: Repository<AnimeDeck>,
    @InjectRepository(AnimeDeckCard)
    private animeDeckCardRepository: Repository<AnimeDeckCard>,
  ) {}

  async findAll(): Promise<AnimeDeck[]> {
    return this.animeDeckRepository.find({
      relations: ['cards', 'cards.card', 'coverCard'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<AnimeDeck> {
    const deck = await this.animeDeckRepository.findOne({
      where: { id },
      relations: ['cards', 'cards.card', 'coverCard'],
    });

    if (!deck) {
      throw new NotFoundException('Deck anime não encontrado');
    }

    return deck;
  }

  async findActiveDecks(): Promise<AnimeDeck[]> {
    return this.animeDeckRepository.find({
      where: { isActive: true },
      relations: ['cards', 'cards.card', 'coverCard'],
    });
  }

  async create(createDeckDto: {
    name: string;
    description?: string;
    coverCardId?: string | null;
    cards: Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }>;
  }): Promise<AnimeDeck> {
    const deck = this.animeDeckRepository.create({
      name: createDeckDto.name,
      description: createDeckDto.description,
      isActive: true,
      coverCardId: createDeckDto.coverCardId ?? null,
    });
    const savedDeck = await this.animeDeckRepository.save(deck);

    if (createDeckDto.cards && createDeckDto.cards.length > 0) {
      const deckCards = createDeckDto.cards.map((cardData) =>
        this.animeDeckCardRepository.create({
          animeDeckId: savedDeck.id,
          cardId: cardData.cardId,
          quantity: cardData.quantity,
          isExtraDeck: !!cardData.isExtraDeck,
        }),
      );
      await this.animeDeckCardRepository.save(deckCards);
    }

    return this.findOne(savedDeck.id);
  }

  async update(
    id: string,
    updateDeckDto: {
      name?: string;
      description?: string;
      isActive?: boolean;
      coverCardId?: string | null;
      cards?: Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }>;
    },
  ): Promise<AnimeDeck> {
    const deck = await this.findOne(id);

    if (updateDeckDto.name !== undefined) deck.name = updateDeckDto.name;
    if (updateDeckDto.description !== undefined) deck.description = updateDeckDto.description;
    if (updateDeckDto.isActive !== undefined) deck.isActive = updateDeckDto.isActive;
    if (updateDeckDto.coverCardId !== undefined) deck.coverCardId = updateDeckDto.coverCardId ?? null;

    await this.animeDeckRepository.save(deck);

    if (updateDeckDto.cards !== undefined) {
      await this.animeDeckCardRepository.delete({ animeDeckId: id });
      if (updateDeckDto.cards.length > 0) {
        const deckCards = updateDeckDto.cards.map((cardData) =>
          this.animeDeckCardRepository.create({
            animeDeckId: id,
            cardId: cardData.cardId,
            quantity: cardData.quantity,
            isExtraDeck: !!cardData.isExtraDeck,
          }),
        );
        await this.animeDeckCardRepository.save(deckCards);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const deck = await this.findOne(id);
    await this.animeDeckRepository.remove(deck);
  }
}
