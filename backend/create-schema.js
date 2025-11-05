const { Client } = require('pg');

const client = new Client({
  host: 'postgres',
  port: 5432,
  user: 'yugioh_user',
  password: 'yugioh_password_2024',
  database: 'yugioh_db',
});

async function createSchema() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // O TypeORM vai criar as tabelas automaticamente quando o app iniciar
    // Este script apenas verifica a conexão
    const res = await client.query('SELECT NOW()');
    console.log('📅 Database time:', res.rows[0].now);
    
    console.log('✅ Database is ready. TypeORM will create tables on app start.');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.end();
  }
}

createSchema();
