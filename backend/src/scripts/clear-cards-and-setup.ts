import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
});

async function clearCards() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Conectado ao banco de dados');

    const queryRunner = AppDataSource.createQueryRunner();
    
    // Apagar todas as cartas e dados relacionados
    console.log('🗑️ Apagando dados relacionados...');
    
    // Apagar deck_cards primeiro (depende de cards)
    await queryRunner.query(`DELETE FROM deck_cards`);
    console.log('✅ deck_cards apagado');
    
    // Apagar user_cards
    await queryRunner.query(`DELETE FROM user_cards`);
    console.log('✅ user_cards apagado');
    
    // Apagar shop_items
    await queryRunner.query(`DELETE FROM shop_items`);
    console.log('✅ shop_items apagado');
    
    // Apagar cards
    await queryRunner.query(`DELETE FROM cards`);
    console.log('✅ cards apagado');
    
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✅ Todas as cartas foram apagadas do banco de dados!');
    console.log('✅ Agora você pode criar cartas novas com idCarta correto');
  } catch (error) {
    console.error('❌ Erro ao apagar cartas:', error);
    process.exit(1);
  }
}

clearCards();













