import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIdCartaToCards1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar se a coluna já existe
    const table = await queryRunner.getTable('cards');
    const idCartaColumn = table?.findColumnByName('idCarta');
    
    if (!idCartaColumn) {
      // Adicionar coluna idCarta
      await queryRunner.addColumn('cards', new TableColumn({
        name: 'idCarta',
        type: 'varchar',
        isNullable: true,
      }));
      console.log('✅ Coluna idCarta adicionada à tabela cards');
    } else {
      console.log('ℹ️ Coluna idCarta já existe na tabela cards');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover coluna idCarta
    await queryRunner.dropColumn('cards', 'idCarta');
    console.log('✅ Coluna idCarta removida da tabela cards');
  }
}

