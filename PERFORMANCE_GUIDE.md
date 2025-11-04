# 🚀 GUIA COMPLETO DE PERFORMANCE E ESCALABILIDADE

## **1. CONFIGURAÇÕES DO POSTGRESQL**

### **Arquivo: `postgresql.conf`**

```conf
# CONEXÕES
max_connections = 200              # Máximo de conexões simultâneas
shared_buffers = 2GB              # 25% da RAM disponível
effective_cache_size = 6GB        # 75% da RAM disponível

# PERFORMANCE
work_mem = 16MB                   # Memória por operação (sort, hash)
maintenance_work_mem = 512MB      # Para VACUUM, CREATE INDEX
random_page_cost = 1.1            # SSD (4.0 para HDD)

# WRITE AHEAD LOG (WAL)
wal_buffers = 16MB
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min

# QUERY PLANNER
default_statistics_target = 100
effective_io_concurrency = 200    # Para SSD

# LOGGING (Para debug)
log_min_duration_statement = 1000  # Log queries > 1 segundo
log_line_prefix = '%t [%p]: '
log_checkpoints = on
log_connections = on
log_disconnections = on
```

---

## **2. POOL DE CONEXÕES DO TYPEORM**

### **Arquivo: `app.module.ts`**

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    url: configService.get('DATABASE_URL'),
    autoLoadEntities: true,
    synchronize: false, // NUNCA true em produção!
    logging: false,     // Desabilitar em produção
    
    // POOL DE CONEXÕES
    extra: {
      max: 20,          // Máximo de conexões no pool
      min: 5,           // Mínimo de conexões mantidas
      idleTimeoutMillis: 30000,    // 30s
      connectionTimeoutMillis: 5000, // 5s timeout
      statement_timeout: 10000,    // 10s timeout por query
    },
    
    // RETRY AUTOMÁTICO
    retryAttempts: 3,
    retryDelay: 3000,
    
    // SSL (Produção)
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false,
  }),
  inject: [ConfigService],
}),
```

---

## **3. CONFIGURAÇÃO DO REDIS**

### **Arquivo: `redis.conf`**

```conf
# MEMÓRIA
maxmemory 4gb
maxmemory-policy allkeys-lru  # Remove chaves menos usadas

# PERSISTÊNCIA (Opcional - para sessions críticas)
save 900 1        # Salva após 900s se 1+ chave mudou
save 300 10       # Salva após 300s se 10+ chaves mudaram
save 60 10000     # Salva após 60s se 10000+ chaves mudaram

# PERFORMANCE
tcp-keepalive 300
timeout 0
```

### **No NestJS:**

```typescript
// redis.service.ts
@Injectable()
export class RedisService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      
      // POOL DE CONEXÕES
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      
      // PERFORMANCE
      enableReadyCheck: true,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });
  }

  // CACHE COM TTL
  async cacheSet(key: string, value: any, ttl: number = 3600) {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async cacheGet(key: string) {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // CACHE PATTERN
  async getOrSet(key: string, fn: () => Promise<any>, ttl: number = 3600) {
    const cached = await this.cacheGet(key);
    if (cached) return cached;

    const data = await fn();
    await this.cacheSet(key, data, ttl);
    return data;
  }
}
```

---

## **4. ESTRATÉGIAS DE CACHE**

### **Cache em Múltiplos Níveis:**

```typescript
// 1. CACHE DE CARTAS (Raramente mudam)
@Injectable()
export class CardsService {
  async findAll() {
    return await this.redisService.getOrSet(
      'cards:all',
      () => this.cardRepository.find(),
      3600 * 24 // 24 horas
    );
  }

  async findOne(id: string) {
    return await this.redisService.getOrSet(
      `card:${id}`,
      () => this.cardRepository.findOne({ where: { id } }),
      3600 * 12 // 12 horas
    );
  }
}

// 2. CACHE DE USUÁRIO (Atualiza frequentemente)
@Injectable()
export class UsersService {
  async findById(id: string) {
    return await this.redisService.getOrSet(
      `user:${id}`,
      () => this.userRepository.findOne({ where: { id } }),
      600 // 10 minutos apenas
    );
  }

  // INVALIDAR CACHE ao atualizar
  async update(id: string, data: any) {
    await this.userRepository.update(id, data);
    await this.redisService.delete(`user:${id}`); // ← Importante!
    return this.findById(id);
  }
}

// 3. CACHE DE RANKINGS (Pesado de calcular)
@Injectable()
export class RankingService {
  async getTopPlayers() {
    return await this.redisService.getOrSet(
      'ranking:top100',
      () => this.calculateTopPlayers(),
      300 // 5 minutos
    );
  }
}
```

---

## **5. PAGINAÇÃO EFICIENTE**

```typescript
// ❌ MAU (Carrega tudo na memória)
const allDuels = await this.duelRepository.find();

// ✅ BOM (Paginação)
async findAll(page: number = 1, limit: number = 20) {
  const [items, total] = await this.duelRepository.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
```

---

## **6. QUERIES OTIMIZADAS**

### **Use Eager Loading:**

```typescript
// ❌ MAU (N+1 queries)
const duels = await this.duelRepository.find();
for (const duel of duels) {
  const player1 = await this.userRepository.findOne(duel.player1Id);
  const player2 = await this.userRepository.findOne(duel.player2Id);
}

// ✅ BOM (1 query)
const duels = await this.duelRepository.find({
  relations: ['player1', 'player2'],
});
```

### **Use Select Específico:**

```typescript
// ❌ MAU (Carrega tudo)
const users = await this.userRepository.find();

// ✅ BOM (Só o necessário)
const users = await this.userRepository.find({
  select: ['id', 'username', 'level'],
});
```

### **Use Query Builder para Complexos:**

```typescript
const topPlayers = await this.userRepository
  .createQueryBuilder('user')
  .select(['user.id', 'user.username', 'user.level'])
  .where('user.level > :level', { level: 10 })
  .orderBy('user.experience', 'DESC')
  .limit(100)
  .cache('top_players', 60000) // Cache de 1 minuto
  .getMany();
```

---

## **7. ARQUIVO .ENV OTIMIZADO**

```env
# DATABASE
DATABASE_URL=postgresql://user:pass@localhost:5432/yugioh
DB_POOL_MIN=5
DB_POOL_MAX=20

# REDIS
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=strong_password

# PERFORMANCE
NODE_ENV=production
NODE_OPTIONS="--max-old-space-size=2048"  # 2GB RAM para Node

# RATE LIMITING
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

# WEBSOCKET
WEBSOCKET_MAX_CONNECTIONS=1000
WEBSOCKET_HEARTBEAT_INTERVAL=30000
```

---

## **8. PM2 - GERENCIADOR DE PROCESSO**

### **Arquivo: `ecosystem.config.js`**

```javascript
module.exports = {
  apps: [{
    name: 'yugioh-backend',
    script: 'dist/main.js',
    instances: 'max',  // Usa todos os CPUs
    exec_mode: 'cluster',
    
    // AUTO RESTART
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // LOGS
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    
    // ENVIRONMENT
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
```

### **Comandos:**

```bash
# Instalar PM2
npm install -g pm2

# Iniciar
pm2 start ecosystem.config.js --env production

# Monitorar
pm2 monit

# Logs em tempo real
pm2 logs

# Restart
pm2 restart yugioh-backend

# Stop
pm2 stop yugioh-backend

# Auto-start no boot
pm2 startup
pm2 save
```

---

## **9. NGINX - LOAD BALANCER**

### **Arquivo: `/etc/nginx/sites-available/yugioh`**

```nginx
upstream backend {
    # LOAD BALANCING
    least_conn;  # Direciona para servidor com menos conexões
    
    server 127.0.0.1:3001 weight=3;
    server 127.0.0.1:3002 weight=2;
    server 127.0.0.1:3003 weight=1;
}

server {
    listen 80;
    server_name api.yugiohgame.com;

    # RATE LIMITING
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # GZIP COMPRESSION
    gzip on;
    gzip_types application/json text/plain text/css application/javascript;
    gzip_min_length 1000;

    # SECURITY HEADERS
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        
        # WEBSOCKET SUPPORT
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # TIMEOUTS
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # HEADERS
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # STATIC FILES (CDN)
    location /images {
        root /var/www/yugioh;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# SSL (HTTPS)
server {
    listen 443 ssl http2;
    server_name api.yugiohgame.com;

    ssl_certificate /etc/letsencrypt/live/yugiohgame.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yugiohgame.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # ... resto da configuração ...
}
```

---

## **10. DOCKER - PARA DESENVOLVIMENTO**

### **Arquivo: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  # POSTGRESQL
  postgres:
    image: postgres:15-alpine
    container_name: yugioh-postgres
    environment:
      POSTGRES_USER: yugioh
      POSTGRES_PASSWORD: strong_password
      POSTGRES_DB: yugioh
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  # REDIS
  redis:
    image: redis:7-alpine
    container_name: yugioh-redis
    command: redis-server --requirepass strong_password --maxmemory 4gb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  # MONGODB
  mongodb:
    image: mongo:7
    container_name: yugioh-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: yugioh
      MONGO_INITDB_ROOT_PASSWORD: strong_password
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped

  # BACKEND
  backend:
    build: .
    container_name: yugioh-backend
    depends_on:
      - postgres
      - redis
      - mongodb
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://yugioh:strong_password@postgres:5432/yugioh
      REDIS_HOST: redis
      MONGODB_URI: mongodb://yugioh:strong_password@mongodb:27017/yugioh
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  mongodb_data:
```

---

## **11. MONITORAMENTO**

### **Grafana + Prometheus:**

```bash
# Instalar
docker run -d --name=prometheus -p 9090:9090 prom/prometheus
docker run -d --name=grafana -p 3001:3000 grafana/grafana
```

### **Métricas no NestJS:**

```typescript
// metrics.controller.ts
@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      activeConnections: this.websocketGateway.getConnectionCount(),
      activeDuels: await this.duelsService.getActiveCount(),
      cacheHitRate: await this.redisService.getHitRate(),
    };
  }
}
```

---

## **12. BACKUP AUTOMATIZADO**

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"

# PostgreSQL
pg_dump -U yugioh -d yugioh | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Redis
redis-cli --rdb $BACKUP_DIR/redis_$DATE.rdb

# Limpar backups antigos (mais de 7 dias)
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete

echo "Backup concluído: $DATE"
```

**Cron Job:**
```cron
0 2 * * * /path/to/backup.sh
```

---

## **📊 RESUMO - CHECKLIST**

- [x] Pool de conexões PostgreSQL configurado
- [x] Índices criados em todas as tabelas
- [x] Redis para cache e sessions
- [x] Paginação em todas as listagens
- [x] Queries otimizadas (eager loading)
- [x] Limpeza automática de dados antigos
- [x] VACUUM automático do PostgreSQL
- [x] PM2 para gerenciar processos
- [x] Nginx como load balancer
- [x] Monitoramento de performance
- [x] Backup automatizado
- [x] Rate limiting
- [x] Compression (gzip)
- [x] CDN para imagens estáticas

**Com essas otimizações, seu jogo vai aguentar milhares de jogadores simultâneos!** 🚀
