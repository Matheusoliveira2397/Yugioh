import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum AchievementType {
  VICTORIES = 'VICTORIES',
  RATING = 'RATING',
  DUELS_PLAYED = 'DUELS_PLAYED',
  SEASON_WINNER = 'SEASON_WINNER',
  TOURNAMENT_WINNER = 'TOURNAMENT_WINNER',
  PERFECT_WIN = 'PERFECT_WIN',
  COMEBACK = 'COMEBACK',
  STREAK = 'STREAK',
}

@Entity('achievements')
export class Achievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar' })
  type: AchievementType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  icon: string; // URL ou nome do ícone

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; // Dados adicionais (ex: quantidade, data específica)

  @CreateDateColumn()
  unlockedAt: Date;
}

