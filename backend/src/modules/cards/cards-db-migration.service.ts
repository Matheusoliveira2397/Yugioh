import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Card } from './entities/card.entity';

@Injectable()
export class CardsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(CardsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    // Aguardar um pouco para garantir que a conexão está estabelecida
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await this.ensureCardSchema();
    } catch (error: any) {
      this.logger.error('⚠️ Erro ao verificar schema de cartas:', error?.message || error);
      // Não lançar erro para não impedir a inicialização do módulo
    }
  }

  private async ensureCardSchema() {
    const queryRunner = this.dataSource.createQueryRunner();
    
    try {
      await queryRunner.connect();
      
      // 1. Remover coluna skinId se existir (migração da versão antiga)
      const skinIdExists = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cards' 
        AND column_name = 'skinId'
      `);

      if (skinIdExists.length > 0) {
        this.logger.log('🔧 Removendo coluna skinId (migração para novo sistema)...');
        
        // Remover constraint única composta se existir
        try {
          await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_cards_idCarta_skinId_unique"
          `);
          this.logger.log('✅ Constraint única composta removida');
        } catch (error: any) {
          this.logger.debug('ℹ️ Constraint única composta não existe');
        }
        
        // Remover índice de skinId
        try {
          await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_cards_skinId"
          `);
          this.logger.log('✅ Índice IDX_cards_skinId removido');
        } catch (error: any) {
          this.logger.debug('ℹ️ Índice skinId não existe');
        }
        
        // Remover coluna skinId
        await queryRunner.query(`
          ALTER TABLE "cards" 
          DROP COLUMN IF EXISTS "skinId"
        `);
        this.logger.log('✅ Coluna skinId removida');
      }
      
      // 2. Garantir que idCarta seja único
      const idCartaUnique = await queryRunner.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
        AND table_name = 'cards' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%idCarta%'
      `);

      if (idCartaUnique.length === 0) {
        this.logger.log('🔧 Criando constraint UNIQUE para idCarta...');
        await queryRunner.query(`
          ALTER TABLE "cards" 
          ADD CONSTRAINT "cards_idCarta_key" UNIQUE ("idCarta")
        `);
        this.logger.log('✅ Constraint UNIQUE de idCarta criada');
      } else {
        this.logger.debug('✅ Constraint UNIQUE de idCarta já existe.');
      }
      
      // 3. Criar índice para name (para buscar cartas pelo nome - efeitos)
      const nameIndex = await queryRunner.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'cards' 
        AND indexname = 'IDX_cards_name'
      `);

      if (nameIndex.length === 0) {
        this.logger.log('🔧 Criando índice para name...');
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_cards_name" ON "cards"("name")
        `);
        this.logger.log('✅ Índice IDX_cards_name criado');
      } else {
        this.logger.debug('✅ Índice IDX_cards_name já existe.');
      }

      // 4. Coluna effectVerified (admin: efeito implementado corretamente)
      const effectVerifiedCol = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cards'
          AND column_name = 'effectVerified'
      `);
      if (effectVerifiedCol.length === 0) {
        this.logger.log('🔧 Adicionando coluna effectVerified...');
        await queryRunner.query(`
          ALTER TABLE "cards"
          ADD COLUMN "effectVerified" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_cards_effectVerified" ON "cards"("effectVerified")
        `);
        this.logger.log('✅ Coluna effectVerified criada');
      }

      // 5. Coluna activatedAt (ordem de ativação na coleção)
      const activatedAtCol = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cards'
          AND column_name = 'activatedAt'
      `);
      if (activatedAtCol.length === 0) {
        this.logger.log('🔧 Adicionando coluna activatedAt...');
        await queryRunner.query(`
          ALTER TABLE "cards"
          ADD COLUMN "activatedAt" TIMESTAMPTZ NULL
        `);
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_cards_activatedAt" ON "cards"("activatedAt")
        `);
        // Cartas já ativas: usa createdAt como ordem histórica aproximada
        await queryRunner.query(`
          UPDATE "cards"
          SET "activatedAt" = "createdAt"
          WHERE "isActive" = true AND "activatedAt" IS NULL
        `);
        this.logger.log('✅ Coluna activatedAt criada e preenchida');
      }
      
      this.logger.log('✅ Schema de cartas configurado corretamente!');
    } catch (error: any) {
      this.logger.error('Erro ao verificar/criar schema de cartas:', error?.message || error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

