# 🚀 Quick Start - Deploy Rápido

## Opção 1: Deploy com Docker (Mais Fácil)

### 1. Preparar Servidor
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt install docker-compose -y
```

### 2. Clonar Repositório
```bash
git clone SEU_REPOSITORIO
cd Yugioh
```

### 3. Configurar Variáveis
```bash
# Backend
cd backend
cp .env.example .env
nano .env  # Editar com suas configurações

# Frontend
cd ../frontend
cp .env.example .env
nano .env  # Editar VITE_API_URL
```

### 4. Build e Deploy
```bash
cd ..
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### 5. Executar Migrations
```bash
docker-compose -f docker-compose.prod.yml exec backend npm run migration:run
```

---

## Opção 2: Deploy Manual (Mais Controle)

### 1. Instalar Dependências do Sistema
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install postgresql postgresql-contrib

# Redis
sudo apt install redis-server

# Nginx
sudo apt install nginx

# PM2
sudo npm install -g pm2
```

### 2. Configurar Banco de Dados
```bash
sudo -u postgres psql
CREATE DATABASE yugioh_db;
CREATE USER yugioh_user WITH PASSWORD 'sua_senha_segura';
GRANT ALL PRIVILEGES ON DATABASE yugioh_db TO yugioh_user;
\q
```

### 3. Configurar Backend
```bash
cd backend
npm install
cp .env.example .env
nano .env  # Configurar DATABASE_URL, JWT_SECRET, etc

# Build
npm run build

# Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Configurar Frontend
```bash
cd frontend
npm install
cp .env.example .env
nano .env  # Configurar VITE_API_URL

# Build
npm run build

# Servir com Nginx (ver configuração abaixo)
```

### 5. Configurar Nginx
```bash
sudo nano /etc/nginx/sites-available/yugioh-game
# (Cole configuração do DEPLOYMENT_GUIDE.md)

sudo ln -s /etc/nginx/sites-available/yugioh-game /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL com Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com
```

---

## 🔧 Configuração Rápida do Domínio

### 1. No Provedor de Domínio (GoDaddy, Namecheap, etc)
```
Tipo: A
Nome: @
Valor: IP_DO_SEU_SERVIDOR
TTL: 3600

Tipo: A
Nome: www
Valor: IP_DO_SEU_SERVIDOR
TTL: 3600
```

### 2. Aguardar Propagação DNS (5-30 minutos)
```bash
# Verificar se DNS propagou
dig seu-dominio.com
nslookup seu-dominio.com
```

### 3. Atualizar .env do Frontend
```env
VITE_API_URL=https://seu-dominio.com/api
```

### 4. Atualizar .env do Backend
```env
CORS_ORIGIN=https://seu-dominio.com
```

---

## 📊 Verificar se Está Funcionando

```bash
# Backend
curl http://localhost:3000/duels/health

# Frontend
curl http://localhost:5173

# Banco de dados
sudo -u postgres psql -d yugioh_db -c "SELECT COUNT(*) FROM users;"

# Redis
redis-cli ping  # Deve retornar PONG

# PM2
pm2 status
pm2 logs
```

---

## 🎯 Próximos Passos

1. ✅ Configurar backup automático
2. ✅ Configurar monitoramento
3. ✅ Otimizar PostgreSQL para produção
4. ✅ Configurar CDN para imagens
5. ✅ Setup de staging environment
