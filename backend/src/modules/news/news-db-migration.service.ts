import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class NewsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(NewsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    // Aguardar um pouco para garantir que a conexão está estabelecida
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await this.ensureNewsViewsTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração de news_views:', error);
      // Não lançar erro para não impedir o módulo de iniciar
    }
  }

  private async ensureNewsViewsTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    
    try {
      await queryRunner.connect();
      
      // Verificar se a tabela existe
      const result = await queryRunner.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'news_views'
      `);

      if (result.length === 0) {
        // Tentar criar extensão uuid-ossp se necessário (para uuid_generate_v4)
        try {
          await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
        } catch (extError: any) {
          // Ignorar silenciosamente se a extensão já existir
        }
        
        // Tentar usar gen_random_uuid() primeiro (PostgreSQL 13+), se falhar, usar uuid_generate_v4()
        let uuidFunction = 'gen_random_uuid()';
        try {
          await queryRunner.query(`SELECT gen_random_uuid();`);
        } catch (testError: any) {
          uuidFunction = 'uuid_generate_v4()';
        }
        
        // Criar a tabela
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "news_views" (
            "id" UUID PRIMARY KEY DEFAULT ${uuidFunction},
            "userId" INTEGER NOT NULL,
            "newsId" UUID NOT NULL,
            "viewedAt" TIMESTAMP DEFAULT NOW(),
            CONSTRAINT "FK_news_views_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_news_views_news" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE,
            CONSTRAINT "UQ_news_views_user_news" UNIQUE ("userId", "newsId")
          )
        `);
        
        // Criar índices
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_news_views_userId" ON "news_views"("userId")
        `);
        
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_news_views_newsId" ON "news_views"("newsId")
        `);
      }
    } catch (error: any) {
      // Se o erro for "tabela já existe", ignorar silenciosamente
      if (!error?.message?.includes('already exists') && error?.code !== '42P07') {
        this.logger.error('Erro ao verificar/criar tabela news_views:', error?.message || error);
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}

