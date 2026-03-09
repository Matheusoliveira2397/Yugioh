import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TalismanTemplate } from './talisman-template.entity';

@Entity('user_talismans')
export class UserTalisman {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'uuid' })
  talismanTemplateId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => TalismanTemplate, { eager: true })
  @JoinColumn({ name: 'talismanTemplateId' })
  template: TalismanTemplate;

  /** Apenas um talismã pode estar equipado por usuário */
  @Column({ default: false })
  equipped: boolean;

  /** Cargas restantes. Cada duelo na arena consome 1; ao chegar em 0 o talismã é removido. */
  @Column({ type: 'int', default: 10 })
  charges: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
