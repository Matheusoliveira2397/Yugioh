import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('site_tabs')
export class SiteTab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string; // Ex: 'home', 'chat', 'arena', etc.

  @Column()
  label: string; // Nome exibido: 'Home', 'Chat', 'Arena', etc.

  @Column()
  route: string; // Rota: '/', '/chat', '/arena', etc.

  @Column({ type: 'varchar', length: 255 })
  icon: string; // Caminho PNG: '/images/Icones/Torneio.png' (emoji legado ainda suportado no Layout)

  @Column({ default: true })
  isActive: boolean; // Se a aba está ativa

  @Column({ default: 0 })
  order: number; // Ordem de exibição

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

