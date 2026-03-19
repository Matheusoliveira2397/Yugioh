import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AnimeDeckCard } from './anime-deck-card.entity';
import { Card } from '../../cards/entities/card.entity';

@Entity('anime_decks')
export class AnimeDeck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** ID da carta usada como imagem/capa do deck (opcional) */
  @Column({ type: 'uuid', nullable: true })
  coverCardId: string | null;

  @ManyToOne(() => Card, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'coverCardId' })
  coverCard: Card | null;

  @OneToMany(() => AnimeDeckCard, (animeDeckCard) => animeDeckCard.animeDeck, { cascade: true })
  cards: AnimeDeckCard[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
