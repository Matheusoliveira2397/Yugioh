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
  PHASE_CHANGE = 'PHASE_CHANGE',
  LIFE_CHANGE = 'LIFE_CHANGE',
  CARD_DESTROYED = 'CARD_DESTROYED',
  CARD_TO_GRAVEYARD = 'CARD_TO_GRAVEYARD',
  DUEL_START = 'DUEL_START',
  DUEL_END = 'DUEL_END',
  // Special Summons
  SPECIAL_SUMMON_CYBER_DRAGON = 'SPECIAL_SUMMON_CYBER_DRAGON',
  SPECIAL_SUMMON_CHAOS_SORCERER = 'SPECIAL_SUMMON_CHAOS_SORCERER',
  SPECIAL_SUMMON_DARK_ARMED_DRAGON = 'SPECIAL_SUMMON_DARK_ARMED_DRAGON',
  SPECIAL_SUMMON_RED_EYES_DARKNESS_METAL_DRAGON = 'SPECIAL_SUMMON_RED_EYES_DARKNESS_METAL_DRAGON',
  // Card Effects
  DARK_ARMED_DRAGON_EFFECT = 'DARK_ARMED_DRAGON_EFFECT',
  CHAOS_SORCERER_EFFECT = 'CHAOS_SORCERER_EFFECT',
  EXILED_FORCE_EFFECT = 'EXILED_FORCE_EFFECT',
  CYBER_STEIN_EFFECT = 'CYBER_STEIN_EFFECT',
  RED_EYES_DARKNESS_METAL_DRAGON_EFFECT = 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT',
  REINFORCEMENT_OF_THE_ARMY = 'REINFORCEMENT_OF_THE_ARMY',
  LAST_WILL_EFFECT = 'LAST_WILL_EFFECT',
}

@Entity('duel_logs')
export class DuelLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Duel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'duel_id' })
  duel: Duel;

  @Column({ name: 'duel_id', type: 'uuid', insert: false, update: false })
  duelId: string;

  @ManyToOne(() => User, { eager: true, createForeignKeyConstraints: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // userId é apenas uma propriedade virtual para leitura, não é uma coluna real
  // Use user.id para acessar o ID do usuário

  @Column({ type: 'enum', enum: DuelActionType })
  actionType: DuelActionType;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; // Dados adicionais da ação

  @CreateDateColumn()
  createdAt: Date;
}
