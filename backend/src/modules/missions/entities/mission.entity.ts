import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MissionCategory } from './mission-category.entity';
import { MissionObjective } from './mission-objective.entity';
import { MissionRewardType } from '../mission-objective.types';

@Entity('missions')
@Index(['categoryId', 'sortOrder'])
export class Mission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => MissionCategory, (c) => c.missions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: MissionCategory;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 20, default: 'none' })
  rewardType: MissionRewardType;

  @Column({ type: 'int', default: 0 })
  rewardAmount: number;

  @Column({ type: 'uuid', nullable: true })
  rewardCardId: string | null;

  @OneToMany(() => MissionObjective, (o) => o.mission, { cascade: true })
  objectives: MissionObjective[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
