import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Deck } from './deck.entity';
import { Card } from '../../cards/entities/card.entity';

@Entity('deck_cards')
export class DeckCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deckId: string;

  @Column()
  cardId: string;

  @Column({ type: 'boolean', default: false })
  isExtraDeck: boolean; // true se a carta está no Extra Deck, false se está no Deck Principal

  @ManyToOne(() => Deck, (deck) => deck.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deckId' })
  deck: Deck;

  @ManyToOne(() => Card)
  @JoinColumn({ name: 'cardId' })
  card: Card;
}
