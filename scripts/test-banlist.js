const axios = require('axios');

async function testBanlist() {
  try {
    // Testar com algumas cartas conhecidas
    const testCards = ['Dark Magician', 'Pot of Greed', 'Raigeki', 'Monster Reborn'];
    
    for (const cardName of testCards) {
      console.log(`\n🔍 Testando: ${cardName}`);
      const response = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php', {
        params: { name: cardName },
        timeout: 10000,
      });
      
      if (response.data.data && response.data.data.length > 0) {
        const card = response.data.data[0];
        console.log(`  Nome: ${card.name}`);
        console.log(`  Banlist Info:`, JSON.stringify(card.banlist_info, null, 2));
        
        // Verificar diferentes formatos possíveis
        if (card.banlist_info) {
          console.log(`  ban_tcg: ${card.banlist_info.ban_tcg}`);
          console.log(`  ban_ocg: ${card.banlist_info.ban_ocg}`);
          console.log(`  ban_goat: ${card.banlist_info.ban_goat}`);
          console.log(`  Todos os campos:`, Object.keys(card.banlist_info));
        } else {
          console.log(`  ⚠️ Sem banlist_info`);
        }
      } else {
        console.log(`  ❌ Carta não encontrada`);
      }
    }
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

testBanlist();


