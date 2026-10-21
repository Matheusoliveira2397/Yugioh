import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('user_mission_progress')
@Unique(['userId', 'missionId', 'periodKey'])
@Index(['userId', 'periodKey'])
export class UserMissionProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'uuid' })
  missionId: string;

  /**
   * Chave do período de reset:
   * - 'all' para none/manual
   * - '2026-10-17' para daily
   * - '2026-W42' para weekly
   * - 'season:<id>' para season
   */
  @Column({ type: 'varchar', length: 64, default: 'all' })
  periodKey: string;

  /** Progresso por objectiveId → valor atual */
  @Column({ type: 'jsonb', default: {} })
  progress: Record<string, number>;

  /** Dias distintos com login (para LOGIN_DAYS), ISO dates */
  @Column({ type: 'jsonb', default: [] })
  loginDays: string[];

  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @Column({ type: 'boolean', default: false })
  claimed: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
