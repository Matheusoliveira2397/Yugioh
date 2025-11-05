import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('challenge_arenas')
export class ChallengeArena {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  participants: number;

  @Column({ type: 'float', default: 1.5 })
  scoreMultiplier: number;

  @Column({ type: 'int', default: 50 })
  bonusGems: number;

  @Column({ type: 'jsonb', default: {} })
  config: {
    minRating?: number;
    maxRating?: number;
    allowedDeckTypes?: string[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
