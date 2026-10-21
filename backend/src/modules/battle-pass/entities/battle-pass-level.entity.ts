import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BattlePassSeason } from './battle-pass-season.entity';

export enum BattlePassRewardType {
  NONE = 'none',
  CREDITS = 'credits',
  CASH = 'cash',
  CARD = 'card',
}

@Entity('battle_pass_levels')
@Index(['seasonId', 'level'], { unique: true })
export class BattlePassLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  seasonId: string;

  @ManyToOne(() => BattlePassSeason, (season) => season.levels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seasonId' })
  season: BattlePassSeason;

  /** Nível do passe (1, 2, 3…) */
  @Column('int')
  level: number;

  /** XP cumulativo necessário para desbloquear este nível */
  @Column('int')
  xpRequired: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: BattlePassRewardType.NONE,
  })
  freeRewardType: BattlePassRewardType;

  @Column('int', { default: 0 })
  freeRewardAmount: number;

  @Column({ type: 'uuid', nullable: true })
  freeRewardCardId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: BattlePassRewardType.NONE,
  })
  premiumRewardType: BattlePassRewardType;

  @Column('int', { default: 0 })
  premiumRewardAmount: number;

  @Column({ type: 'uuid', nullable: true })
  premiumRewardCardId: string | null;
}
