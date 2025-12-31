import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entidade para armazenar links de redes sociais do jogo
 */
@Entity('social_media')
export class SocialMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  platform: string; // 'discord', 'youtube', 'twitter', 'instagram', 'facebook', 'tiktok', etc.

  @Column({ type: 'varchar', length: 255 })
  url: string; // URL completa da rede social

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null; // Label personalizado (ex: "Nosso Discord", "Canal do YouTube")

  @Column({ type: 'varchar', length: 255, nullable: true })
  icon: string | null; // Emoji ou nome do ícone (ex: "💬", "📺")

  @Column({ type: 'int', default: 0 })
  order: number; // Ordem de exibição

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Se a rede social está ativa

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

