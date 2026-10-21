import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Mission } from './mission.entity';
import {
  MissionObjectiveMeta,
  MissionObjectiveType,
} from '../mission-objective.types';

@Entity('mission_objectives')
@Index(['missionId', 'sortOrder'])
export class MissionObjective {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  missionId: string;

  @ManyToOne(() => Mission, (m) => m.objectives, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'missionId' })
  mission: Mission;

  @Column({ type: 'varchar', length: 40 })
  type: MissionObjectiveType;

  /** Quantidade necessária (ex.: ganhar 5 duelos) */
  @Column({ type: 'int', default: 1 })
  targetAmount: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Metadados opcionais (ex.: maxPosition para ARENA_TOP_N) */
  @Column({ type: 'jsonb', default: {} })
  meta: MissionObjectiveMeta;
}
