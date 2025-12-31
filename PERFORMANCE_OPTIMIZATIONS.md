# ⚡ Otimizações de Performance para Milhares de Players

## 📊 Análise Atual do Sistema

### **Configurações Existentes:**
- ✅ Connection Pool: 20-100 conexões (bom)
- ✅ Max Connections HTTP: 2000 (bom)
- ✅ Redis para cache (bom)
- ✅ Nginx como reverse proxy (bom)
- ⚠️ Apenas 1 instância do backend (precisa escalar)
- ⚠️ Sem load balancing (precisa adicionar)

---

## 🚀 Melhorias Necessárias para Milhares de Players

### **1. Aumentar Connection Pool do PostgreSQL**

**Atual:** 20-100 conexões
**Recomendado para 10k+ players:** 200-500 conexões

Edite `backend/src/app.module.ts`:

```typescript
extra: {
  max: 500,        // Aumentado de 100 para 500
  min: 50,         // Aumentado de 20 para 50
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 5000,
  maxUses: 7500,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  allowExitOnIdle: false,
},
```

### **2. Implementar PM2 Cluster Mode**

Já criado `ecosystem.config.js` - usar:
```bash
pm2 start ecosystem.config.js
```

Isso cria múltiplas instâncias do backend (uma por core CPU).

### **3. Adicionar Redis Adapter para Socket.IO**

Para escalar WebSockets entre múltiplos servidores:

```typescript
// backend/src/modules/duels/duels.gateway.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

// No afterInit:
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();
await pubClient.connect();
await subClient.connect();

this.server.adapter(createAdapter(pubClient, subClient));
```

### **4. Implementar Cache de Queries Frequentes**

```typescript
// Exemplo: Cache de ranking
async getSeasonRanking(seasonId?: string): Promise<SeasonRanking[]> {
  const cacheKey = `ranking:${seasonId || 'active'}`;
  
  // Tentar buscar do cache
  const cached = await this.redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Buscar do banco
  const ranking = await this.rankingRepository.find(...);
  
  // Salvar no cache (5 minutos)
  await this.redis.setex(cacheKey, 300, JSON.stringify(ranking));
  
  return ranking;
}
```

### **5. Otimizar Queries do Banco**

- Adicionar índices nas colunas mais consultadas
- Usar `select` explícito (não buscar colunas desnecessárias)
- Implementar paginação em todas as listagens
- Usar `QueryBuilder` para queries complexas

### **6. Configurar Nginx Load Balancing**

Para múltiplas instâncias do backend:

```nginx
upstream backend_cluster {
    least_conn;  # Balanceamento por menor conexão
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
    keepalive 32;
}

location /api {
    proxy_pass http://backend_cluster;
    # ... resto da configuração
}
```

### **7. Otimizar WebSocket**

```typescript
// Limitar eventos por segundo por conexão
io.use((socket, next) => {
  const rateLimiter = new Map();
  const maxEvents = 10; // 10 eventos por segundo
  const windowMs = 1000;
  
  const now = Date.now();
  const userEvents = rateLimiter.get(socket.id) || [];
  const recentEvents = userEvents.filter(time => now - time < windowMs);
  
  if (recentEvents.length >= maxEvents) {
    return next(new Error('Rate limit exceeded'));
  }
  
  recentEvents.push(now);
  rateLimiter.set(socket.id, recentEvents);
  next();
});
```

### **8. Database Indexes**

Execute estas migrations:

```sql
-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_duels_player1 ON duels(player1_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_player2 ON duels(player2_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_status ON duels(status);
CREATE INDEX IF NOT EXISTS idx_season_rankings_score ON season_rankings(season_id, season_score DESC);
CREATE INDEX IF NOT EXISTS idx_season_rankings_division ON season_rankings(season_id, division, season_score DESC);
```

---

## 📈 Capacidade Estimada

### **Configuração Atual (1 servidor):**
- **Players simultâneos:** ~500-1000
- **Duelos simultâneos:** ~250-500
- **Conexões WebSocket:** ~1000

### **Com Otimizações (1 servidor):**
- **Players simultâneos:** ~2000-3000
- **Duelos simultâneos:** ~1000-1500
- **Conexões WebSocket:** ~3000

### **Com Load Balancing (3+ servidores):**
- **Players simultâneos:** ~10,000+
- **Duelos simultâneos:** ~5,000+
- **Conexões WebSocket:** ~10,000+

---

## 🔧 Checklist de Otimização

- [ ] Aumentar connection pool para 500
- [ ] Implementar PM2 cluster mode
- [ ] Adicionar Redis adapter para Socket.IO
- [ ] Implementar cache de queries frequentes
- [ ] Adicionar índices no banco de dados
- [ ] Configurar Nginx load balancing
- [ ] Implementar rate limiting
- [ ] Configurar CDN para assets
- [ ] Otimizar queries com paginação
- [ ] Monitorar performance (APM)

---

## 📊 Monitoramento de Performance

### **Métricas Importantes:**
1. **Latência de API:** < 100ms (p95)
2. **Conexões ativas:** Monitorar pico
3. **Uso de CPU:** < 70% média
4. **Uso de RAM:** < 80%
5. **Conexões DB:** Monitorar pool
6. **WebSocket connections:** Monitorar pico

### **Ferramentas Recomendadas:**
- **PM2 Plus:** Monitoramento de PM2
- **New Relic / Datadog:** APM completo
- **Grafana + Prometheus:** Métricas customizadas
- **PostgreSQL pg_stat_statements:** Queries lentas
