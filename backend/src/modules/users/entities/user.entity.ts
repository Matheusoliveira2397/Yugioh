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
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({ default: 0 })
  winsGeral: number;

  @Column({ default: 0 })
  lossesGeral: number;

  @Column({ default: 0 })
  winsSeason: number;

  @Column({ default: 0 })
  lossesSeason: number;

  @Column({ default: 1000 })
  rating: number;

  // Sistema de Economia
  @Column({ type: 'int', default: 0 })
  credits: number; // Crédito (premium gratuito)

  @Column({ type: 'int', default: 0 })
  cash: number; // Cash (premium pago)

  // Sistema de Níveis
  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 0 })
  experience: number;

  // Sistema de Score
  @Column({ type: 'int', default: 0 })
  totalScore: number; // Score geral acumulado de todas as seasons

  @Column({ default: '/images/default.png', name: 'profileImage' })
  profileImage: string;

  @Column({ default: true })
  isOnline: boolean;

  // Sistema de Ban e Moderação
  @Column({ default: false })
  isBanned: boolean;

  @Column({ type: 'text', nullable: true })
  banReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin: Date;

  @Column({ type: 'varchar', nullable: true })
  lastIpAddress: string;

  @Column({ type: 'varchar', nullable: true })
  avatar: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  // Sistema de Clã
  @Column({ type: 'varchar', nullable: true })
  clanTag: string | null; // Tag do clã (ex: "CLA")

  // Biografia do jogador
  @Column({ type: 'text', nullable: true })
  biography: string | null;

  // Classe do jogador (baseada em rating)
  @Column({ type: 'varchar', nullable: true, default: 'Novato' })
  playerClass: string; // Novato, Aprendiz, Veterano, Mestre, Lendário, etc.

  @OneToMany(() => Deck, (deck) => deck.user)
  decks: Deck[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
