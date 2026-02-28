const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

async function updateAllCards() {
  try {
    console.log('🔐 Fazendo login como admin...');
    
    // Login
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });

    const token = loginResponse.data.access_token;
    if (!token) {
      throw new Error('Token não recebido no login');
    }

    console.log('✅ Login realizado com sucesso!');
    console.log('🔄 Iniciando atualização de todas as cartas...\n');

    // Chamar endpoint de atualização
    const updateResponse = await axios.post(
      `${API_URL}/cards/admin/update-all-from-api`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 600000, // 10 minutos de timeout
      }
    );

    const result = updateResponse.data;
    
    console.log('\n✅ Atualização concluída!');
    console.log(`📊 Resultados:`);
    console.log(`   - Cartas atualizadas: ${result.updated}`);
    console.log(`   - Erros: ${result.errors}`);
    console.log(`   - Total processado: ${result.details.length}`);
    
    if (result.details && result.details.length > 0) {
      const errors = result.details.filter(d => d.status === 'error');
      if (errors.length > 0) {
        console.log(`\n⚠️ Cartas com erro (${errors.length}):`);
        errors.slice(0, 10).forEach(d => {
          console.log(`   - ${d.cardName}: ${d.message}`);
        });
        if (errors.length > 10) {
          console.log(`   ... e mais ${errors.length - 10} erros`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro ao atualizar cartas:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Mensagem: ${error.response.data?.message || error.message}`);
      if (error.response.data?.details) {
        console.error(`   Detalhes:`, error.response.data.details);
      }
    } else {
      console.error(`   Erro: ${error.message}`);
    }
    process.exit(1);
  }
}

updateAllCards();


