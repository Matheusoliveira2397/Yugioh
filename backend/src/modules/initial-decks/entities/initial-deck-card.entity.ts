import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InitialDeck } from './initial-deck.entity';
import { Card } from '../../cards/entities/card.entity';

@Entity('initial_deck_cards')
export class InitialDeckCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  initialDeckId: string;

  @Column()
  cardId: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  isExtraDeck: boolean; // true = Deck Adicional (Fusion, Synchro, Xyz, Link)

  @ManyToOne(() => InitialDeck, (initialDeck) => initialDeck.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'initialDeckId' })
  initialDeck: InitialDeck;

  @ManyToOne(() => Card, { eager: true })
  @JoinColumn({ name: 'cardId' })
  card: Card;
}

