import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Group } from './group.entity';

export enum GroupRole {
  LEADER = 'Leader',
  CO_LEADER = 'Co-Leader',
  ELDER = 'Elder',
  MEMBER = 'Member'
}

@Entity('group_members')
@Index(['group', 'user'], { unique: true })
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Group, group => group.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column()
  groupId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: GroupRole, default: GroupRole.MEMBER })
  role: GroupRole;

  // Score Semanal (reseta toda semana)
  @Column({ type: 'int', default: 0 })
  weeklyScore: number;

  @Column({ type: 'timestamp', nullable: true })
  weeklyScoreResetAt: Date;

  // Score da Season (reseta a cada season)
  @Column({ type: 'int', default: 0 })
  seasonScore: number;

  // Score Geral (nunca reseta)
  @Column({ type: 'int', default: 0 })
  totalScore: number;

  @Column({ type: 'int', default: 0 })
  contributedWins: number;

  @Column({ type: 'int', default: 0 })
  contributedLosses: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
