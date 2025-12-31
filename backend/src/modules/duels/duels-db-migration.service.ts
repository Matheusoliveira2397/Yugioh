import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DuelsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DuelsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    // Aguardar um pouco para garantir que a conexão está estabelecida
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await this.ensureTurnCounterColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração de turn_counter:', error);
      // Não lançar erro para não impedir o módulo de iniciar
    }
  }

  private async ensureTurnCounterColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    
    try {
      await queryRunner.connect();
      
      // Verificar se a coluna existe
      const result = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'duels' 
        AND column_name = 'turn_counter'
      `);

      if (result.length === 0) {
        this.logger.log('🔧 Coluna turn_counter não existe. Criando...');
        
        // Criar a coluna (sem NOT NULL primeiro para permitir valores NULL temporariamente)
        await queryRunner.query(`
          ALTER TABLE duels 
          ADD COLUMN turn_counter INTEGER DEFAULT 1
        `);
        
        // Atualizar duelos existentes
        const updateResult = await queryRunner.query(`
          UPDATE duels 
          SET turn_counter = 1 
          WHERE turn_counter IS NULL
        `);
        
        this.logger.log(`✅ Coluna turn_counter criada! ${updateResult.rowCount || 0} duelos atualizados.`);
      } else {
        this.logger.log('✅ Coluna turn_counter já existe.');
      }
    } catch (error: any) {
      // Se o erro for "coluna já existe", ignorar
      if (error?.message?.includes('already exists') || error?.code === '42701') {
        this.logger.log('✅ Coluna turn_counter já existe (detectado via erro).');
      } else {
        this.logger.error('Erro ao verificar/criar coluna turn_counter:', error?.message || error);
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
