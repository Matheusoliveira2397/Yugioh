import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type PatchNoteCategory =
  | 'bugfix'
  | 'cards'
  | 'features'
  | 'balance'
  | 'other';

@Entity('patch_notes')
export class PatchNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** Versão opcional (ex: 1.4.2 ou 2026-03-21) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  version?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'other' })
  category: PatchNoteCategory;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ type: 'int' })
  authorId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
