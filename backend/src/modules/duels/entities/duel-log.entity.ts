import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { Duel } from './duel.entity';
import { User } from '../../users/entities/user.entity';

export enum DuelActionType {
  DRAW_CARD = 'DRAW_CARD',
  SUMMON_MONSTER = 'SUMMON_MONSTER',
  SET_MONSTER = 'SET_MONSTER',
  ACTIVATE_SPELL = 'ACTIVATE_SPELL',
  SET_SPELL_TRAP = 'SET_SPELL_TRAP',
  ATTACK = 'ATTACK',
  DIRECT_ATTACK = 'DIRECT_ATTACK',
  CHANGE_POSITION = 'CHANGE_POSITION',
  END_TURN = 'END_TURN',
  LIFE_CHANGE = 'LIFE_CHANGE',
  CARD_DESTROYED = 'CARD_DESTROYED',
  CARD_TO_GRAVEYARD = 'CARD_TO_GRAVEYARD',
  DUEL_START = 'DUEL_START',
  DUEL_END = 'DUEL_END'
}

@Entity('duel_logs')
export class DuelLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Duel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'duel_id' })
  duel: Duel;

  @Column({ type: 'uuid' })
  duelId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: DuelActionType })
  actionType: DuelActionType;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; // Dados adicionais da ação

  @CreateDateColumn()
  createdAt: Date;
}
