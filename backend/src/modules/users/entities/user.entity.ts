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

  /** Para ADMIN: IDs das abas do painel admin que pode acessar. Null = todas (compat). */
  @Column({ type: 'simple-json', nullable: true })
  adminAllowedTabs: string[] | null;

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

  // Sistema de Níveis (baseado em totalScore via LevelsService)
  @Column({ type: 'int', default: 1 })
  level: number;

  // Sistema de Score
  @Column({ type: 'decimal', precision: 10, scale: 1, default: 0, name: 'total_score' })
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

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pendingNewEmail: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailChangeToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailChangeExpiresAt: Date | null;

  // Sistema de Clã
  @Column({ type: 'varchar', nullable: true })
  clanTag: string | null; // Tag do clã (ex: "CLA")

  // Biografia do jogador
  @Column({ type: 'text', nullable: true })
  biography: string | null;

  // Classe do jogador (baseada em rating)
  @Column({ type: 'varchar', nullable: true, default: 'Novato' })
  playerClass: string; // Novato, Aprendiz, Veterano, Mestre, Lendário, etc.

  // Divisão do jogador (Bronze, Silver, Gold, Platinum, Diamond, Master, Legendary)
  @Column({ type: 'varchar', nullable: true, default: 'Bronze' })
  division: string;

  @OneToMany(() => Deck, (deck) => deck.user)
  decks: Deck[];

  /** IDs das skins de carta (sleeves) que o usuário comprou */
  @Column({ type: 'simple-json', nullable: true, default: [] })
  ownedSleeveIds: string[];

  /** IDs dos playmats que o usuário comprou */
  @Column({ type: 'simple-json', nullable: true, default: [] })
  ownedPlaymatIds: string[];

  // Cosméticos equipados (playmat de campo e skin de carta)
  @Column({ type: 'varchar', length: 100, nullable: true })
  equippedPlaymatId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  equippedPlaymatImage: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  equippedSkinId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  equippedSkinImage: string | null;

  // Deck equipado (deck que será usado no duelo)
  @Column({ type: 'varchar', length: 100, nullable: true })
  equippedDeckName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
