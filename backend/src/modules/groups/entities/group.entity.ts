import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { GroupMember } from './group-member.entity';

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  tag: string | null; // Sigla do grupo (ex: HLS)

  @Column({ type: 'varchar', nullable: true })
  logo: string | null;

  @Column({ type: 'varchar', nullable: true })
  banner: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leaderId' })
  leader: User;

  @Column({ type: 'int' })
  leaderId: number;

  @Column({ type: 'int', default: 0 })
  totalScore: number;

  @Column({ type: 'int', default: 50 })
  maxMembers: number;

  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => GroupMember, member => member.group)
  members: GroupMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
