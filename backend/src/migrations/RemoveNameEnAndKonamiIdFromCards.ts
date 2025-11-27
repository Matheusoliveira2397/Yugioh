import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveNameEnAndKonamiIdFromCards1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remover coluna nameEn
    await queryRunner.dropColumn('cards', 'nameEn');
    
    // Remover coluna konamiId
    await queryRunner.dropColumn('cards', 'konamiId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter: adicionar colunas de volta (caso precise reverter)
    await queryRunner.addColumn('cards', new TableColumn({
      name: 'nameEn',
      type: 'varchar',
      isNullable: true,
    }));
    
    await queryRunner.addColumn('cards', new TableColumn({
      name: 'konamiId',
      type: 'varchar',
      isNullable: true,
    }));
  }
}

