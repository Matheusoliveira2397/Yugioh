# 🎴 PAINEL ADMIN DE CARTAS - GUIA COMPLETO

## **✅ O QUE FOI CRIADO**

### **1. Painel Admin (`AdminCardsPanel.tsx`)**
- ✅ Formulário completo de cadastro
- ✅ Listagem de todas as cartas
- ✅ Edição de cartas existentes
- ✅ Desativar cartas (soft delete)
- ✅ Deletar permanentemente (hard delete)
- ✅ Reativar cartas desativadas
- ✅ Filtros (Todas/Ativas/Inativas)
- ✅ Busca por nome
- ✅ Preview visual das cartas

### **2. Loja de Cartas (`ShopCardsPage.tsx`)**
- ✅ Mostra APENAS cartas com `isForSale: true`
- ✅ Filtra por moeda (coins/credits/cash)
- ✅ Verifica saldo do usuário
- ✅ Sistema de compra funcional
- ✅ Preview visual das cartas
- ✅ Informações de stats (ATK/DEF/Level)

### **3. Backend Atualizado**
- ✅ Endpoint de ativar carta
- ✅ Soft delete (desativa, mas mantém no banco)
- ✅ Hard delete (deleta permanentemente)
- ✅ Listagem admin (vê todas, incluindo inativas)
- ✅ Listagem loja (vê só cartas ativas e à venda)

---

## **📋 FLUXO COMPLETO**

### **PASSO 1: ADMIN CADASTRA CARTA**

```
1. Admin acessa /admin/cards
2. Clica em "➕ Nova Carta"
3. Preenche formulário:
   - Nome: "Dark Magician"
   - Descrição: "The ultimate wizard..."
   - Tipo: Monster
   - Level: 7
   - ATK: 2500
   - DEF: 2100
   - Raridade: Ultra Rare
   - Preços:
     * 🪙 Moedas: 5000
     * 💎 Créditos: 100
     * 💵 Cash: 4.99
   - ✅ Disponível na Loja: true
4. Clica em "✨ Criar Carta"
5. Backend:
   - Salva carta no banco
   - Carta fica com isForSale: true
   - Carta fica com isActive: true
```

### **PASSO 2: CARTA APARECE NA LOJA**

```
1. Usuário acessa /shop/cards
2. Backend busca: SELECT * FROM cards WHERE is_for_sale = true AND is_active = true
3. Carta "Dark Magician" aparece na loja
4. Mostra preços:
   - 🪙 5000 moedas
   - 💎 100 créditos
   - 💵 R$ 4.99
5. Usuário pode escolher qual moeda usar
```

### **PASSO 3: USUÁRIO COMPRA CARTA**

```
1. Usuário clica em botão de moeda desejada (ex: 🪙 Moedas)
2. Usuário clica em "Comprar"
3. Backend verifica:
   - Usuário tem saldo? (user.coins >= card.priceCoins)
   - ✅ Tem: deduz saldo e adiciona ao inventário
   - ❌ Não tem: retorna erro "Saldo insuficiente"
4. Sucesso: Carta vai para inventário do usuário
```

### **PASSO 4: ADMIN GERENCIA CARTAS**

```
OPÇÕES DISPONÍVEIS:

1. ✏️ EDITAR
   - Altera qualquer informação
   - Muda preços
   - Ativa/desativa venda

2. 🔒 DESATIVAR (Soft Delete)
   - Carta fica isActive: false
   - Não aparece mais na loja
   - Ainda existe no banco
   - Pode ser reativada

3. ✅ REATIVAR
   - Carta fica isActive: true
   - Volta a aparecer na loja

4. 🗑️ DELETAR PERMANENTEMENTE (Hard Delete)
   - Remove do banco de dados
   - NÃO pode ser desfeito
   - Some de tudo (loja, inventários, decks)
```

---

## **🎯 ROTAS DISPONÍVEIS**

### **Backend:**
```
GET    /api/cards                    → Cartas ativas (jogadores)
GET    /api/cards/admin/all          → Todas cartas (admin)
GET    /api/cards/shop/for-sale      → Cartas na loja
GET    /api/cards/:id                → Buscar carta específica
POST   /api/cards                    → Criar carta
PUT    /api/cards/:id                → Editar carta
DELETE /api/cards/:id                → Desativar carta (soft)
DELETE /api/cards/:id/hard           → Deletar permanentemente
POST   /api/cards/:id/activate       → Reativar carta
```

### **Frontend:**
```
/admin/cards        → Painel admin de gerenciamento
/shop/cards         → Loja de cartas para jogadores
```

---

## **📊 DIFERENÇAS ENTRE SOFT E HARD DELETE**

### **SOFT DELETE (Recomendado)**
```sql
-- O que faz:
UPDATE cards SET is_active = false WHERE id = '...';

-- Resultado:
- Carta fica no banco
- isActive = false
- NÃO aparece na loja
- Pode ser reativada
- Mantém histórico
```

**Quando usar:**
- ✅ Carta temporariamente indisponível
- ✅ Carta sendo rebalanceada
- ✅ Promoção temporária
- ✅ Teste de novos preços

### **HARD DELETE (Cuidado!)**
```sql
-- O que faz:
DELETE FROM cards WHERE id = '...';

-- Resultado:
- Carta é DELETADA do banco
- ❌ NÃO pode ser desfeita
- Remove de inventários
- Remove de decks
- Perde TODOS os dados
```

**Quando usar:**
- ⚠️ Carta foi criada por erro
- ⚠️ Carta duplicada
- ⚠️ Teste que deve ser removido
- ⚠️ Nunca deve existir no jogo

---

## **🔍 FILTROS E BUSCA**

### **No Painel Admin:**
```
1. FILTROS:
   - Todas (100 cartas)
   - Ativas (85 cartas)
   - Inativas (15 cartas)

2. BUSCA:
   - Busca por nome
   - Ignora maiúsculas/minúsculas
   - Pesquisa em tempo real
```

### **Na Loja:**
```
1. FILTROS:
   - Por moeda (coins/credits/cash)
   - Só mostra cartas com preço na moeda selecionada

2. AUTOMÁTICO:
   - Só cartas com isForSale: true
   - Só cartas com isActive: true
   - Ordenado por raridade
```

---

## **💡 DICAS DE USO**

### **1. Criar Carta Completa**
```typescript
// Preencha TODOS os campos importantes:
{
  name: "Nome único",
  description: "Descrição clara",
  type: "Monster/Spell/Trap",
  rarity: "Common → Legendary",
  
  // Se Monster:
  level: 4,
  atk: 1500,
  def: 1000,
  
  // PREÇOS (pelo menos 1):
  priceCoins: 1000,      // Grátis para jogar
  priceCredits: 50,      // Premium gratuito
  priceCash: 1.99,       // Dinheiro real
  
  // IMPORTANTE:
  isForSale: true        // Aparecer na loja
}
```

### **2. Testar Carta Antes de Publicar**
```
1. Crie com isForSale: false
2. Teste valores, balance
3. Quando pronto: Edite e marque isForSale: true
```

### **3. Promoções Temporárias**
```
1. Edite a carta
2. Reduza o preço temporariamente
3. Quando acabar: Edite e volte preço normal
4. Ou: Desative (soft delete) até próxima promoção
```

### **4. Carta Banida/Limitada**
```
1. Não delete! Use soft delete
2. Carta fica no histórico
3. Pode ser rebalanceada e reativada
```

---

## **🎨 PREVIEW VISUAL**

### **Painel Admin:**
```
┌─────────────────────────────────────┐
│  🎴 Painel de Cartas   [➕ Nova]   │
├─────────────────────────────────────┤
│  🔍 [Buscar...] [Todas ▼]          │
├─────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐       │
│  │  👹      │  │  📜      │       │
│  │ Dark     │  │ Pot of   │       │
│  │ Magician │  │ Greed    │       │
│  ├──────────┤  ├──────────┤       │
│  │ Ultra    │  │ Rare     │       │
│  │ 🪙 5000  │  │ 🪙 1000  │       │
│  │ ✏️ 🔒 🗑️ │  │ ✏️ 🔒 🗑️ │       │
│  └──────────┘  └──────────┘       │
└─────────────────────────────────────┘
```

### **Loja:**
```
┌─────────────────────────────────────┐
│  🛒 Loja de Cartas                 │
│  Saldo: 🪙 10000 💎 50 💵 20       │
├─────────────────────────────────────┤
│  [🪙 Moedas] [💎 Créditos] [💵 Cash]│
├─────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐       │
│  │  👹      │  │  📜      │       │
│  │ Dark     │  │ Pot of   │       │
│  │ Magician │  │ Greed    │       │
│  │ ⭐7 ⚔️2500│  │          │       │
│  │ 🪙 5000  │  │ 🪙 1000  │       │
│  │ [Comprar]│  │ [Comprar]│       │
│  └──────────┘  └──────────┘       │
└─────────────────────────────────────┘
```

---

## **✅ CHECKLIST - CADASTRAR CARTA**

```
□ Preencher nome único
□ Escrever descrição clara
□ Definir tipo (Monster/Spell/Trap)
□ Se Monster: definir Level, ATK, DEF
□ Escolher raridade adequada
□ Definir PELO MENOS 1 preço:
  □ priceCoins (moedas)
  □ priceCredits (créditos)
  □ priceCash (dinheiro real)
□ Marcar "Disponível na Loja" (isForSale: true)
□ Salvar carta
□ Verificar se apareceu na loja
□ Testar compra
```

---

## **🚀 PRÓXIMOS PASSOS**

Quer que eu adicione:

1. **Upload de imagens** (arrastar e soltar)
2. **Sistema de promoções** (desconto automático)
3. **Estatísticas** (cartas mais vendidas)
4. **Pacotes de cartas** (boosters)
5. **Preview 3D** das cartas
6. **Histórico de vendas**
7. **Filtros avançados** (por tipo, atributo, etc)

**Sistema está 100% FUNCIONAL!** 🎉
