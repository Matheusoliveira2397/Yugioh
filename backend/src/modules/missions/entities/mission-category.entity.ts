import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Mission } from './mission.entity';
import { MissionResetType } from '../mission-objective.types';

@Entity('mission_categories')
export class MissionCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nome da aba (ex.: Missões Diárias, Missões da Season) */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 16, default: '🎯' })
  icon: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Como o progresso reinicia:
   * none = nunca; daily = todo dia; weekly = toda semana;
   * season = quando a season competitiva muda; manual = só o admin
   */
  @Column({ type: 'varchar', length: 20, default: 'none' })
  resetType: MissionResetType;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @OneToMany(() => Mission, (m) => m.category)
  missions: Mission[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
