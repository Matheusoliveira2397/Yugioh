import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveUnusedCardColumns1702000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('cards');
    
    if (!table) {
      console.log('⚠️ Tabela cards não encontrada');
      return;
    }

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
      const column = table.findColumnByName(columnName);
      if (column) {
        await queryRunner.dropColumn('cards', columnName);
        console.log(`✅ Coluna ${columnName} removida da tabela cards`);
      } else {
        console.log(`ℹ️ Coluna ${columnName} não existe na tabela cards`);
      }
    }

    // Tornar idCarta obrigatório e único
    const idCartaColumn = table.findColumnByName('idCarta');
    if (idCartaColumn) {
      // Verificar se já é unique
      const isUnique = idCartaColumn.isUnique;
      
      if (!isUnique) {
        // Criar índice único se não existir
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cards_idCarta" ON "cards" ("idCarta")
        `);
        console.log('✅ Índice único criado para idCarta');
      }
      
      // Tornar NOT NULL se ainda não for
      if (idCartaColumn.isNullable) {
        // Primeiro, atualizar registros NULL com um valor temporário
        await queryRunner.query(`
          UPDATE "cards" 
          SET "idCarta" = 'TEMP_' || "id"::text 
          WHERE "idCarta" IS NULL OR "idCarta" = ''
        `);
        
        // Depois, tornar NOT NULL
        await queryRunner.changeColumn('cards', 'idCarta', new TableColumn({
          name: 'idCarta',
          type: 'varchar',
          isNullable: false,
          isUnique: true,
        }));
        console.log('✅ Coluna idCarta tornada obrigatória e única');
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter: adicionar colunas de volta (opcional)
    const table = await queryRunner.getTable('cards');
    
    if (!table) {
      return;
    }

    // Adicionar colunas de volta
    if (!table.findColumnByName('nameEn')) {
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'nameEn',
        type: 'varchar',
        isNullable: true,
      }));
    }

    if (!table.findColumnByName('linkRating')) {
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'linkRating',
        type: 'int',
        isNullable: true,
      }));
    }

    if (!table.findColumnByName('pendulumScale')) {
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'pendulumScale',
        type: 'int',
        isNullable: true,
      }));
    }

    if (!table.findColumnByName('effect')) {
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'effect',
        type: 'jsonb',
        isNullable: true,
      }));
    }

    if (!table.findColumnByName('isLimited')) {
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'isLimited',
        type: 'boolean',
        default: false,
      }));
    }

    if (!table.findColumnByName('konamiId')) {
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'konamiId',
        type: 'varchar',
        isNullable: true,
      }));
    }

    // Remover constraint unique de idCarta (mas manter a coluna)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_cards_idCarta"
    `);
  }
}













