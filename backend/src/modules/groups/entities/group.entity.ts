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

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  totalScore: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  seasonScore: number; // Score da season (soma dos seasonScore dos membros)

  @Column({ type: 'int', default: 1 })
  level: number; // Nível do clã (calculado baseado no totalScore)

  @Column({ type: 'int', default: 0 })
  totalCash: number; // Cash total do clã (ganho quando duelistas ganham cash em duelos - metade do cash ganho)

  @Column({ type: 'int', default: 0 })
  credits: number; // Crédito total do clã

  // Configuração de divisão de cash
  @Column({ type: 'int', nullable: true })
  cashDivisionDayOfWeek: number | null; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

  @Column({ type: 'varchar', nullable: true })
  cashDivisionTime: string | null; // Formato HH:mm (ex: "14:30")

  @Column({ type: 'int', nullable: true })
  cashDivisionDefaultMembers: number | null; // Número padrão de membros para divisão (configurado pelo admin)

  @Column({ type: 'int', nullable: true })
  cashDivisionMembers: number | null; // Número de membros para divisão (configurado pelo líder do grupo)

  @Column({ type: 'int', default: 0 })
  totalWins: number; // Vitórias totais do clã

  @Column({ type: 'int', default: 0 })
  totalLosses: number; // Derrotas totais do clã

  @Column({ type: 'int', default: 0 })
  totalAchievements: number; // Total de conquistas do clã

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
