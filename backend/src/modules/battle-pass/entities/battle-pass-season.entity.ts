import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BattlePassLevel } from './battle-pass-level.entity';

@Entity('battle_pass_seasons')
export class BattlePassSeason {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ default: false })
  isActive: boolean;

  /** Preço em créditos para desbloquear a trilha paga */
  @Column('int', { default: 500 })
  premiumPriceCredits: number;

  /** XP ganho ao vencer um duelo (enquanto a season estiver ativa) */
  @Column('int', { default: 100 })
  xpPerWin: number;

  /** XP ganho ao perder um duelo */
  @Column('int', { default: 40 })
  xpPerLoss: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bannerUrl: string | null;

  @OneToMany(() => BattlePassLevel, (level) => level.season)
  levels: BattlePassLevel[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
