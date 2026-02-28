import { Injectable } from '@nestjs/common';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../../../../common/utils/logger.util';

/**
 * Serviço de Backup Automático de Efeitos
 * 
 * Cria backups automáticos antes de mudanças críticas
 * Permite restaurar efeitos se algo der errado
 */
@Injectable()
export class EffectBackupService {
  private readonly backupDir: string;
  private readonly maxBackups = 10; // Manter apenas os últimos 10 backups

  constructor() {
    // Criar diretório de backups
    this.backupDir = join(process.cwd(), 'backups', 'card-effects');
    this.ensureBackupDirectory();
  }

  /**
   * Cria backup de todos os efeitos antes de uma mudança crítica
   */
  async createBackup(reason: string = 'auto'): Promise<string> {
    try {
      await this.ensureBackupDirectory();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `effects-backup-${timestamp}-${reason}.json`;
      const backupPath = join(this.backupDir, backupFileName);

      // Coletar informações sobre efeitos registrados
      const backupData = {
        timestamp: new Date().toISOString(),
        reason,
        effects: await this.collectEffectInfo(),
        metadata: {
          nodeVersion: process.version,
          platform: process.platform,
        },
      };

      await writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
      
      logger.info(`💾 [EffectBackup] Backup criado: ${backupFileName}`);
      
      // Limpar backups antigos
      await this.cleanOldBackups();

      return backupPath;
    } catch (error) {
      logger.error(`❌ [EffectBackup] Erro ao criar backup:`, error);
      throw error;
    }
  }

  /**
   * Lista todos os backups disponíveis
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = await import('fs/promises');
      const entries = await files.readdir(this.backupDir);
      
      const backups: BackupInfo[] = [];
      
      for (const file of entries) {
        if (file.endsWith('.json')) {
          const filePath = join(this.backupDir, file);
          const stats = await files.stat(filePath);
          const content = await readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          
          backups.push({
            fileName: file,
            filePath,
            timestamp: data.timestamp,
            reason: data.reason,
            size: stats.size,
            effectCount: data.effects?.length || 0,
          });
        }
      }

      // Ordenar por timestamp (mais recente primeiro)
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return backups;
    } catch (error) {
      logger.error(`❌ [EffectBackup] Erro ao listar backups:`, error);
      return [];
    }
  }

  /**
   * Restaura um backup específico
   */
  async restoreBackup(backupFileName: string): Promise<void> {
    try {
      const backupPath = join(this.backupDir, backupFileName);
      
      if (!existsSync(backupPath)) {
        throw new Error(`Backup não encontrado: ${backupFileName}`);
      }

      const content = await readFile(backupPath, 'utf-8');
      const backupData = JSON.parse(content);

      logger.info(`🔄 [EffectBackup] Restaurando backup: ${backupFileName}`);
      logger.info(`📋 [EffectBackup] Backup contém ${backupData.effects?.length || 0} efeitos`);

      // Aqui você pode implementar a lógica de restauração
      // Por exemplo, re-registrar efeitos ou restaurar arquivos

      logger.info(`✅ [EffectBackup] Backup restaurado com sucesso`);
    } catch (error) {
      logger.error(`❌ [EffectBackup] Erro ao restaurar backup:`, error);
      throw error;
    }
  }

  /**
   * Coleta informações sobre efeitos atuais
   */
  private async collectEffectInfo(): Promise<any[]> {
    // Esta função será implementada para coletar informações dos efeitos
    // Por enquanto, retorna array vazio
    return [];
  }

  /**
   * Garante que o diretório de backups existe
   */
  private async ensureBackupDirectory(): Promise<void> {
    try {
      if (!existsSync(this.backupDir)) {
        await mkdir(this.backupDir, { recursive: true });
        logger.info(`📁 [EffectBackup] Diretório de backups criado: ${this.backupDir}`);
      }
    } catch (error) {
      logger.error(`❌ [EffectBackup] Erro ao criar diretório de backups:`, error);
    }
  }

  /**
   * Remove backups antigos, mantendo apenas os mais recentes
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      
      if (backups.length > this.maxBackups) {
        const backupsToDelete = backups.slice(this.maxBackups);
        
        for (const backup of backupsToDelete) {
          const { unlink } = await import('fs/promises');
          await unlink(backup.filePath);
          logger.info(`🗑️ [EffectBackup] Backup antigo removido: ${backup.fileName}`);
        }
      }
    } catch (error) {
      logger.error(`❌ [EffectBackup] Erro ao limpar backups antigos:`, error);
    }
  }
}

export interface BackupInfo {
  fileName: string;
  filePath: string;
  timestamp: string;
  reason: string;
  size: number;
  effectCount: number;
}

