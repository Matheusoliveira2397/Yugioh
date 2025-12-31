# 🚀 Guia Completo de Deployment - Yu-Gi-Oh! Online

## 📋 Índice
1. [Requisitos do Servidor](#requisitos-do-servidor)
2. [Configuração do Domínio](#configuração-do-domínio)
3. [Configuração do Banco de Dados](#configuração-do-banco-de-dados)
4. [Deployment com Docker](#deployment-com-docker)
5. [Deployment Manual](#deployment-manual)
6. [Configuração de Variáveis de Ambiente](#configuração-de-variáveis-de-ambiente)
7. [Otimizações de Performance](#otimizações-de-performance)
8. [Escalabilidade](#escalabilidade)
9. [Monitoramento](#monitoramento)
10. [SSL/HTTPS](#sslhttps)

---

## 🖥️ Requisitos do Servidor

### **Mínimo Recomendado:**
- **CPU:** 4 cores (2.4GHz+)
- **RAM:** 8GB (16GB recomendado)
- **Disco:** 50GB SSD
- **Rede:** 100Mbps upload/download
- **OS:** Ubuntu 22.04 LTS ou Debian 11+

### **Para Milhares de Players Simultâneos:**
- **CPU:** 8+ cores (3.0GHz+)
- **RAM:** 32GB+ (64GB para 10k+ players)
- **Disco:** 200GB+ SSD NVMe
- **Rede:** 1Gbps+ com alta disponibilidade
- **Load Balancer:** Nginx ou Cloudflare
- **Database:** PostgreSQL gerenciado (AWS RDS, DigitalOcean, etc)
- **Cache:** Redis Cluster
- **CDN:** Para assets estáticos (imagens, etc)

---

## 🌐 Configuração do Domínio

### **1. Comprar Domínio**
- Registre um domínio (ex: `yugioh-game.com`)
- Configure DNS no seu provedor de domínio

### **2. Configurar DNS**
Configure os seguintes registros DNS:

```
Tipo    Nome    Valor                    TTL
A       @       SEU_IP_DO_SERVIDOR       3600
A       www     SEU_IP_DO_SERVIDOR       3600
CNAME   api     SEU_IP_DO_SERVIDOR       3600
```

### **3. Configurar Nginx com Domínio**

Crie arquivo `/etc/nginx/sites-available/yugioh-game`:

```nginx
# Redirecionar HTTP para HTTPS
server {
    listen 80;
    server_name yugioh-game.com www.yugioh-game.com;
    return 301 https://$server_name$request_uri;
}

# Configuração HTTPS
server {
    listen 443 ssl http2;
    server_name yugioh-game.com www.yugioh-game.com;

    # Certificados SSL (gerados com Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yugioh-game.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yugioh-game.com/privkey.pem;
    
    # Configurações SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Headers de segurança
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Limites de upload
    client_max_body_size 10M;
    client_body_buffer_size 128k;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket para Duelos
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts maiores para WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Arquivos estáticos (imagens)
    location /images {
        alias /var/www/yugioh/backend/uploads/images;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /uploads {
        alias /var/www/yugioh/backend/uploads;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

### **4. Instalar Certificado SSL (Let's Encrypt)**

```bash
# Instalar Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Gerar certificado
sudo certbot --nginx -d yugioh-game.com -d www.yugioh-game.com

# Renovação automática (já configurado no cron)
sudo certbot renew --dry-run
```

### **5. Ativar Site Nginx**

```bash
sudo ln -s /etc/nginx/sites-available/yugioh-game /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🗄️ Configuração do Banco de Dados

### **Opção 1: Banco de Dados Gerenciado (Recomendado para Produção)**

#### **AWS RDS (PostgreSQL)**
1. Crie instância RDS PostgreSQL
2. Configure security groups para permitir conexão do seu servidor
3. Use connection string: `postgresql://user:password@host:5432/database`

#### **DigitalOcean Managed Database**
1. Crie database cluster no DigitalOcean
2. Configure trusted sources (IP do seu servidor)
3. Use connection string fornecida

#### **Supabase / Neon / Railway**
- Serviços gerenciados com tier gratuito
- Fácil setup e escalável

### **Opção 2: Banco de Dados no Próprio Servidor**

#### **PostgreSQL**
```bash
# Instalar PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Criar banco e usuário
sudo -u postgres psql
CREATE DATABASE yugioh_db;
CREATE USER yugioh_user WITH PASSWORD 'sua_senha_segura';
GRANT ALL PRIVILEGES ON DATABASE yugioh_db TO yugioh_user;
\q

# Configurar acesso remoto (se necessário)
sudo nano /etc/postgresql/16/main/postgresql.conf
# Descomente: listen_addresses = 'localhost'

sudo nano /etc/postgresql/16/main/pg_hba.conf
# Adicione: host    yugioh_db    yugioh_user    0.0.0.0/0    md5

sudo systemctl restart postgresql
```

#### **MongoDB (Opcional - para Chat)**
```bash
# Instalar MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### **Redis**
```bash
# Instalar Redis
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Configurar Redis para produção
sudo nano /etc/redis/redis.conf
# maxmemory 2gb
# maxmemory-policy allkeys-lru
# appendonly yes

sudo systemctl restart redis-server
```

---

## 🐳 Deployment com Docker (Recomendado)

### **1. Preparar Arquivos**

Crie `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    container_name: yugioh-postgres-prod
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - yugioh-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MongoDB (Opcional)
  mongodb:
    image: mongo:7.0
    container_name: yugioh-mongodb-prod
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: yugioh_chat
    volumes:
      - mongodb_data:/data/db
    networks:
      - yugioh-network
    restart: unless-stopped

  # Redis
  redis:
    image: redis:7-alpine
    container_name: yugioh-redis-prod
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - yugioh-network
    restart: unless-stopped

  # Backend
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: yugioh-backend-prod
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      MONGODB_URI: mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongodb:27017/yugioh_chat?authSource=admin
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: https://yugioh-game.com
    volumes:
      - ./backend/uploads:/app/uploads
    networks:
      - yugioh-network
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    ports:
      - "3000:3000"

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: yugioh-frontend-prod
    environment:
      VITE_API_URL: https://yugioh-game.com/api
    networks:
      - yugioh-network
    restart: unless-stopped
    ports:
      - "5173:5173"

volumes:
  postgres_data:
  mongodb_data:
  redis_data:

networks:
  yugioh-network:
    driver: bridge
```

### **2. Criar Dockerfile para Frontend**

Crie `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### **3. Deploy**

```bash
# Criar arquivo .env com variáveis
cp .env.example .env
nano .env

# Build e start
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f

# Executar migrations
docker-compose -f docker-compose.prod.yml exec backend npm run migration:run
```

---

## 📝 Configuração de Variáveis de Ambiente

### **Backend (.env)**

```env
# Servidor
NODE_ENV=production
PORT=3000

# Banco de Dados PostgreSQL
DATABASE_URL=postgresql://usuario:senha@host:5432/yugioh_db

# MongoDB (Opcional - para chat)
MONGODB_URI=mongodb://usuario:senha@host:27017/yugioh_chat?authSource=admin

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=seu_jwt_secret_super_seguro_aqui_minimo_32_caracteres

# CORS
CORS_ORIGIN=https://yugioh-game.com

# Email (Opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_app
```

### **Frontend (.env)**

```env
VITE_API_URL=https://yugioh-game.com/api
```

---

## ⚡ Otimizações de Performance

### **1. Configurações do PostgreSQL**

Edite `/etc/postgresql/16/main/postgresql.conf`:

```conf
# Memória
shared_buffers = 4GB                    # 25% da RAM
effective_cache_size = 12GB            # 75% da RAM
work_mem = 64MB
maintenance_work_mem = 1GB

# Conexões
max_connections = 200
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8

# Performance
random_page_cost = 1.1                 # Para SSD
effective_io_concurrency = 200
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Logging (apenas erros em produção)
log_min_messages = error
log_min_error_statement = error
```

### **2. Configurações do Nginx**

Edite `/etc/nginx/nginx.conf`:

```nginx
worker_processes auto;
worker_connections 4096;
worker_rlimit_nofile 8192;

# Cache
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

# Gzip
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
```

### **3. Configurações do Node.js**

Crie arquivo `backend/ecosystem.config.js` (PM2):

```javascript
module.exports = {
  apps: [{
    name: 'yugioh-backend',
    script: './dist/main.js',
    instances: 'max', // Usar todos os cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '2G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false
  }]
};
```

Instalar PM2:
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 📈 Escalabilidade

### **Para Milhares de Players Simultâneos:**

#### **1. Load Balancing**
- Use múltiplas instâncias do backend
- Configure Nginx como load balancer:

```nginx
upstream backend_cluster {
    least_conn;
    server backend1:3000;
    server backend2:3000;
    server backend3:3000;
}
```

#### **2. Database Connection Pooling**
Já configurado em `app.module.ts`:
- Min: 20 conexões
- Max: 100 conexões
- Para mais players, aumente para 200-500

#### **3. Redis para Cache**
- Cache de queries frequentes
- Cache de rankings
- Sessões de usuário

#### **4. CDN para Assets**
- Use Cloudflare ou AWS CloudFront
- Cache de imagens de cartas
- Reduz carga no servidor

#### **5. WebSocket Scaling**
- Use Redis Adapter para Socket.IO:

```typescript
// backend/src/modules/duels/duels.gateway.ts
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();
await pubClient.connect();
await subClient.connect();

io.adapter(createAdapter(pubClient, subClient));
```

---

## 🔒 SSL/HTTPS

### **Let's Encrypt (Gratuito)**

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Gerar certificado
sudo certbot --nginx -d yugioh-game.com -d www.yugioh-game.com

# Renovação automática
sudo systemctl enable certbot.timer
```

### **Cloudflare (Recomendado)**
1. Adicione domínio no Cloudflare
2. Configure DNS apontando para seu servidor
3. Ative SSL/TLS (Full ou Full Strict)
4. Cloudflare gerencia SSL automaticamente

---

## 📊 Monitoramento

### **1. PM2 Monitoring**
```bash
pm2 monit
pm2 logs
```

### **2. PostgreSQL Monitoring**
```sql
-- Ver conexões ativas
SELECT count(*) FROM pg_stat_activity;

-- Ver queries lentas
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

### **3. Nginx Logs**
```bash
# Acessos
sudo tail -f /var/log/nginx/access.log

# Erros
sudo tail -f /var/log/nginx/error.log
```

### **4. Sistema**
```bash
# CPU e Memória
htop

# Disco
df -h

# Rede
iftop
```

---

## 🚨 Checklist de Deployment

- [ ] Servidor configurado com requisitos mínimos
- [ ] Domínio configurado e apontando para servidor
- [ ] SSL/HTTPS configurado (Let's Encrypt)
- [ ] Banco de dados PostgreSQL criado e acessível
- [ ] MongoDB configurado (se usar chat)
- [ ] Redis configurado e rodando
- [ ] Variáveis de ambiente configuradas (.env)
- [ ] Nginx configurado como reverse proxy
- [ ] Backend buildado e rodando
- [ ] Frontend buildado e servido
- [ ] Migrations do banco executadas
- [ ] Firewall configurado (portas 80, 443, 22)
- [ ] Backup automático configurado
- [ ] Monitoramento configurado
- [ ] Logs sendo coletados

---

## 🔄 Backup Automático

### **Script de Backup PostgreSQL**

Crie `/usr/local/bin/backup-postgres.sh`:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/postgres"
DB_NAME="yugioh_db"
DB_USER="yugioh_user"

mkdir -p $BACKUP_DIR

# Backup
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup criado: backup_$DATE.sql.gz"
```

Adicionar ao cron:
```bash
crontab -e
# Backup diário às 2h da manhã
0 2 * * * /usr/local/bin/backup-postgres.sh
```

---

## 📞 Suporte e Troubleshooting

### **Problemas Comuns:**

1. **Erro de conexão com banco:**
   - Verifique DATABASE_URL no .env
   - Verifique firewall do banco
   - Teste conexão: `psql $DATABASE_URL`

2. **WebSocket não conecta:**
   - Verifique configuração Nginx para /socket.io
   - Verifique CORS_ORIGIN no backend
   - Verifique se porta está aberta

3. **Alta utilização de CPU:**
   - Verifique queries lentas no PostgreSQL
   - Aumente workers do PM2
   - Use Redis para cache

4. **Memória esgotando:**
   - Aumente limite do PM2
   - Otimize queries do banco
   - Use paginação nas listagens

---

## 🎯 Resumo Rápido

1. **Servidor:** VPS com 8GB+ RAM, 4+ cores
2. **Domínio:** Configure DNS apontando para IP do servidor
3. **Banco:** PostgreSQL gerenciado (AWS RDS, DigitalOcean) ou próprio servidor
4. **Deploy:** Docker Compose ou PM2
5. **SSL:** Let's Encrypt (gratuito)
6. **Performance:** Nginx + PM2 cluster + Redis cache
7. **Escalabilidade:** Load balancer + múltiplas instâncias backend

**O jogo está preparado para milhares de players com as otimizações acima!**
