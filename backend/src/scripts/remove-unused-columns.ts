import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});

async function runMigration() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Conectado ao banco de dados');

    const queryRunner = AppDataSource.createQueryRunner();
    
    // Lista de colunas para remover
    const columnsToRemove = [
      'nameEn',
      'linkRating',
      'pendulumScale',
      'effect',
      'isLimited',
      'konamiId'
    ];

    for (const columnName of columnsToRemove) {
      try {
        // Verificar se a coluna existe
        const result = await queryRunner.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'cards' AND column_name = $1
        `, [columnName]);

        if (result.length > 0) {
          await queryRunner.query(`ALTER TABLE cards DROP COLUMN IF EXISTS "${columnName}"`);
          console.log(`✅ Coluna ${columnName} removida da tabela cards`);
        } else {
          console.log(`ℹ️ Coluna ${columnName} não existe na tabela cards`);
        }
      } catch (error: any) {
        console.error(`❌ Erro ao remover coluna ${columnName}:`, error.message);
      }
    }

    // Tornar idCarta obrigatório e único
    try {
      // Verificar se a coluna idCarta existe
      const idCartaExists = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'cards' AND column_name = 'idCarta'
      `);

      if (idCartaExists.length === 0) {
        console.log('⚠️ Coluna idCarta não existe. Criando...');
        await queryRunner.query(`
          ALTER TABLE cards ADD COLUMN "idCarta" VARCHAR
        `);
      }

      // Verificar se há registros com idCarta NULL ou vazio
      const nullCount = await queryRunner.query(`
        SELECT COUNT(*) as count FROM cards WHERE "idCarta" IS NULL OR "idCarta" = ''
      `);
      
      if (parseInt(nullCount[0].count) > 0) {
        console.log(`⚠️ Encontrados ${nullCount[0].count} registros com idCarta vazio. Atualizando...`);
        await queryRunner.query(`
          UPDATE cards 
          SET "idCarta" = 'TEMP_' || "id"::text 
          WHERE "idCarta" IS NULL OR "idCarta" = ''
        `);
      }

      // Remover índice único antigo se existir
      try {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cards_idCarta"`);
      } catch (e) {
        // Ignorar se não existir
      }

      // Criar índice único
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cards_idCarta" ON "cards" ("idCarta")
      `);
      console.log('✅ Índice único criado para idCarta');

      // Tornar NOT NULL
      await queryRunner.query(`
        ALTER TABLE cards 
        ALTER COLUMN "idCarta" SET NOT NULL
      `);
      console.log('✅ Coluna idCarta tornada obrigatória');
    } catch (error: any) {
      console.error('❌ Erro ao atualizar idCarta:', error.message);
    }

    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✅ Migration concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error);
    process.exit(1);
  }
}

runMigration();

