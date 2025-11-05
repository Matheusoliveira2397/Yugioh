import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Deck } from '../../decks/entities/deck.entity';

export enum UserRole {
  PLAYER = 'PLAYER',
  ADMIN = 'ADMIN',
  MASTER = 'MASTER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  nickname: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PLAYER })
  role: UserRole;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  verificationToken: string;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  losses: number;

  @Column({ default: 1000 })
  rating: number;

  // Sistema de Economia
  @Column({ type: 'int', default: 0 })
  coins: number; // Moedas (grátis)

  @Column({ type: 'int', default: 0 })
  credits: number; // Crédito (premium gratuito)

  @Column({ type: 'int', default: 0 })
  cash: number; // Cash (premium pago)

  @Column({ default: 0 })
  gems: number; // Mantido para compatibilidade (será migrado para coins)

  // Sistema de Níveis
  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 0 })
  experience: number;

  // Sistema de Score
  @Column({ type: 'int', default: 0 })
  totalScore: number; // Score geral acumulado de todas as seasons

  @Column({ default: '/avatars/default.png', name: 'profileImage' })
  profileImage: string;

  @Column({ default: true })
  isOnline: boolean;

  // Sistema de Ban e Moderação
  @Column({ default: false })
  isBanned: boolean;

  @Column({ type: 'text', nullable: true })
  banReason: string;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin: Date;

  @Column({ type: 'varchar', nullable: true })
  lastIpAddress: string;

  @Column({ type: 'varchar', nullable: true })
  avatar: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @OneToMany(() => Deck, (deck) => deck.user)
  decks: Deck[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
