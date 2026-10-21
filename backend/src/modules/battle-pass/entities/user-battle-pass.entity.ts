import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('user_battle_pass')
@Unique(['userId', 'seasonId'])
@Index(['seasonId'])
export class UserBattlePass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int')
  userId: number;

  @Column({ type: 'uuid' })
  seasonId: string;

  @Column('int', { default: 0 })
  xp: number;

  @Column({ default: false })
  hasPremium: boolean;

  /** Níveis cuja recompensa gratuita já foi resgatada */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  claimedFreeLevels: number[];

  /** Níveis cuja recompensa premium já foi resgatada */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  claimedPremiumLevels: number[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
