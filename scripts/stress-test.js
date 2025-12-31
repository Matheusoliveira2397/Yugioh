const axios = require('axios');
const crypto = require('crypto');

// Configurações
const API_URL = process.env.API_URL || 'http://localhost:3000';
const NUM_USERS = parseInt(process.env.NUM_USERS || '50');
const NUM_DUELS = parseInt(process.env.NUM_DUELS || '100');
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT || '10');
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY || '50'); // ms

// Estatísticas
const stats = {
  usersCreated: 0,
  usersFailed: 0,
  loginsSuccess: 0,
  loginsFailed: 0,
  decksEquipped: 0,
  decksFailed: 0,
  duelsCreated: 0,
  duelsFailed: 0,
  errors: []
};

// Função para gerar dados aleatórios
function generateRandomUser(index) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return {
    nickname: `StressTest${index}_${random}`,
    username: `stresstest${index}_${random}`,
    email: `stress${index}_${random}@test.com`,
    password: 'Test123456',
    confirmPassword: 'Test123456',
    confirmEmail: `stress${index}_${random}@test.com`
  };
}

// Criar usuário
async function createUser(userData, index) {
  try {
    const response = await axios.post(`${API_URL}/auth/register`, userData, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });
    stats.usersCreated++;
    if (index % 10 === 0) {
      console.log(`✅ [${index}] Usuário criado: ${userData.nickname}`);
    }
    return response.data;
  } catch (error) {
    stats.usersFailed++;
    const errorMsg = error.response?.data?.message || error.message;
    if (stats.errors.length < 20) {
      stats.errors.push(`Erro ao criar usuário ${index}: ${errorMsg}`);
    }
    return null;
  }
}

// Fazer login
async function loginUser(username, password, index) {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      username,
      password
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    stats.loginsSuccess++;
    return {
      token: response.data.access_token,
      userId: response.data.user?.id
    };
  } catch (error) {
    stats.loginsFailed++;
    const errorMsg = error.response?.data?.message || error.message;
    if (stats.errors.length < 20) {
      stats.errors.push(`Erro ao fazer login ${index}: ${errorMsg}`);
    }
    return null;
  }
}

// Verificar e equipar deck se necessário
async function ensureDeckEquipped(token, userId, index) {
  try {
    // Buscar perfil do usuário para verificar se tem deck equipado
    const profileResponse = await axios.get(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });

    const user = profileResponse.data;
    
    // Se já tem deck equipado, tudo certo
    if (user.equippedDeckName) {
      stats.decksEquipped++;
      return true;
    }

    // Se não tem deck equipado, buscar decks e equipar o primeiro
    const decksResponse = await axios.get(`${API_URL}/decks`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });

    const decks = decksResponse.data;
    
    if (decks && decks.length > 0) {
      // Equipar o primeiro deck disponível
      await axios.put(
        `${API_URL}/users/me/cosmetics`,
        { equippedDeckName: decks[0].name },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );
      
      stats.decksEquipped++;
      return true;
    }
    
    // Se não tiver deck, marcar como falha (mas não é crítico)
    stats.decksFailed++;
    return false;
  } catch (error) {
    // Não é crítico se falhar, apenas logar
    stats.decksFailed++;
    return false;
  }
}

// Criar duelo via API HTTP
async function createDuelViaAPI(token, player1Id, player2Id, index) {
  try {
    const response = await axios.post(
      `${API_URL}/duels/test-create-duel-stress`,
      { player2Id },
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
    
    stats.duelsCreated++;
    if (index % 20 === 0) {
      console.log(`✅ [${index}] Duelo criado: ${player1Id} vs ${player2Id}`);
    }
    return response.data;
  } catch (error) {
    stats.duelsFailed++;
    const errorMsg = error.response?.data?.message || error.message;
    if (stats.errors.length < 20) {
      stats.errors.push(`Erro ao criar duelo ${index}: ${errorMsg}`);
    }
    throw error;
  }
}

// Processar em lotes
async function processBatch(items, batchSize, processor, delay = 0) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item, idx) => 
        new Promise(resolve => 
          setTimeout(() => resolve(processor(item, i + idx)), idx * delay)
        )
      )
    );
    
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : null));
    
    // Pequeno delay entre lotes
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  return results;
}

// Função principal
async function runStressTest() {
  console.log('🚀 ============================================');
  console.log('🚀 TESTE DE STRESS - Yu-Gi-Oh! Duel Arena');
  console.log('🚀 ============================================');
  console.log(`📊 Configurações:`);
  console.log(`   - Usuários: ${NUM_USERS}`);
  console.log(`   - Duelos: ${NUM_DUELS}`);
  console.log(`   - Requisições simultâneas: ${CONCURRENT_REQUESTS}`);
  console.log(`   - Delay entre requisições: ${DELAY_BETWEEN_REQUESTS}ms`);
  console.log(`   - API URL: ${API_URL}`);
  console.log('');

  const startTime = Date.now();

  // Fase 1: Criar usuários
  console.log('📝 Fase 1: Criando usuários...');
  const userDataList = Array.from({ length: NUM_USERS }, (_, i) => ({
    data: generateRandomUser(i + 1),
    index: i + 1
  }));

  const users = await processBatch(
    userDataList,
    CONCURRENT_REQUESTS,
    async ({ data, index }) => await createUser(data, index),
    DELAY_BETWEEN_REQUESTS
  );

  const validUsers = users.filter(u => u !== null);
  console.log(`✅ ${validUsers.length} usuários criados de ${NUM_USERS}`);
  console.log('');

  // Fase 2: Fazer login
  console.log('🔐 Fase 2: Fazendo login...');
  const loginData = validUsers.map((user, index) => ({
    username: userDataList[index].data.username,
    password: userDataList[index].data.password,
    userId: user.user?.id,
    index: index + 1
  })).filter((_, i) => users[i] !== null);

  const authResults = await processBatch(
    loginData,
    CONCURRENT_REQUESTS,
    async ({ username, password, index }) => await loginUser(username, password, index),
    DELAY_BETWEEN_REQUESTS
  );

  const usersWithAuth = loginData.filter((_, i) => authResults[i] !== null);
  const tokens = authResults.filter(t => t !== null);
  console.log(`✅ ${tokens.length} logins realizados de ${validUsers.length}`);
  console.log('');

  // Fase 3: Verificar/Equipar decks
  console.log('🃏 Fase 3: Verificando decks...');
  const deckPromises = usersWithAuth.map((user, index) => 
    ensureDeckEquipped(tokens[index].token, tokens[index].userId, index + 1)
  );

  await processBatch(
    deckPromises,
    CONCURRENT_REQUESTS,
    async (promise) => await promise,
    DELAY_BETWEEN_REQUESTS
  );

  console.log(`✅ ${stats.decksEquipped} usuários com decks equipados de ${usersWithAuth.length}`);
  console.log('');

  // Fase 4: Criar duelos
  console.log('⚔️ Fase 4: Criando duelos...');
  const duelPromises = [];
  
  for (let i = 0; i < NUM_DUELS && i < usersWithAuth.length - 1; i++) {
    const player1Index = i % usersWithAuth.length;
    const player2Index = (i + 1) % usersWithAuth.length;
    
    if (player1Index === player2Index) continue;
    
    const player1 = usersWithAuth[player1Index];
    const player2 = usersWithAuth[player2Index];
    const player1Token = tokens[player1Index];
    const player2Token = tokens[player2Index];
    
    if (!player1Token || !player2Token) continue;

    duelPromises.push(
      createDuelViaAPI(
        player1Token.token,
        player1Token.userId,
        player2Token.userId,
        i + 1
      ).catch(() => null)
    );

    // Processar em lotes menores para WebSocket
    if (duelPromises.length >= Math.min(CONCURRENT_REQUESTS, 5)) {
      await Promise.allSettled(duelPromises);
      duelPromises.length = 0;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Processar duelos restantes
  if (duelPromises.length > 0) {
    await Promise.allSettled(duelPromises);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Relatório final
  console.log('');
  console.log('📊 ============================================');
  console.log('📊 RELATÓRIO DO TESTE DE STRESS');
  console.log('📊 ============================================');
  console.log(`⏱️  Tempo total: ${duration}s`);
  console.log(`📈 Taxa: ${((stats.usersCreated + stats.duelsCreated) / duration).toFixed(2)} operações/segundo`);
  console.log('');
  console.log('👥 Usuários:');
  console.log(`   ✅ Criados: ${stats.usersCreated}`);
  console.log(`   ❌ Falhas: ${stats.usersFailed}`);
  console.log('');
  console.log('🔐 Logins:');
  console.log(`   ✅ Sucessos: ${stats.loginsSuccess}`);
  console.log(`   ❌ Falhas: ${stats.loginsFailed}`);
  console.log('');
  console.log('🃏 Decks:');
  console.log(`   ✅ Equipados: ${stats.decksEquipped}`);
  console.log(`   ❌ Falhas: ${stats.decksFailed}`);
  console.log('');
  console.log('⚔️ Duelos:');
  console.log(`   ✅ Criados: ${stats.duelsCreated}`);
  console.log(`   ❌ Falhas: ${stats.duelsFailed}`);
  console.log('');
  
  if (stats.errors.length > 0) {
    console.log('❌ Erros encontrados (primeiros 10):');
    stats.errors.slice(0, 10).forEach((error, i) => {
      console.log(`   ${i + 1}. ${error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`   ... e mais ${stats.errors.length - 10} erros`);
    }
  }
  
  console.log('');
  console.log('✅ Teste de stress concluído!');
  process.exit(0);
}

// Executar
runStressTest().catch(error => {
  console.error('❌ Erro fatal no teste de stress:', error);
  process.exit(1);
});
