#!/bin/bash

# Script de setup inicial do servidor
# Uso: ./setup-server.sh

set -e

echo "🚀 Configurando servidor para Yu-Gi-Oh! Online..."

# Atualizar sistema
echo "📦 Atualizando sistema..."
sudo apt update && sudo apt upgrade -y

# Instalar dependências básicas
echo "📦 Instalando dependências básicas..."
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Instalar Node.js 20
echo "📦 Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PostgreSQL
echo "📦 Instalando PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Instalar Redis
echo "📦 Instalando Redis..."
sudo apt install -y redis-server

# Instalar Nginx
echo "📦 Instalando Nginx..."
sudo apt install -y nginx

# Instalar PM2
echo "📦 Instalando PM2..."
sudo npm install -g pm2

# Instalar Docker (opcional)
read -p "Deseja instalar Docker? (s/n): " install_docker
if [ "$install_docker" = "s" ]; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    sudo apt install -y docker-compose
    rm get-docker.sh
fi

# Configurar firewall
echo "🔥 Configurando firewall..."
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable

# Otimizar PostgreSQL
echo "⚙️ Otimizando PostgreSQL..."
sudo sed -i "s/#shared_buffers = 128MB/shared_buffers = 256MB/" /etc/postgresql/*/main/postgresql.conf
sudo systemctl restart postgresql

# Otimizar Redis
echo "⚙️ Otimizando Redis..."
sudo sed -i "s/# maxmemory <bytes>/maxmemory 2gb/" /etc/redis/redis.conf
sudo sed -i "s/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/" /etc/redis/redis.conf
sudo systemctl restart redis-server

# Criar diretórios necessários
echo "📁 Criando diretórios..."
sudo mkdir -p /var/backups/postgres
sudo mkdir -p /var/www/yugioh/backend/uploads
sudo chown -R $USER:$USER /var/www/yugioh

echo "✅ Setup concluído!"
echo ""
echo "📝 Próximos passos:"
echo "1. Configure o banco de dados: sudo -u postgres psql"
echo "2. Clone o repositório: git clone SEU_REPO"
echo "3. Configure variáveis de ambiente: cp .env.example .env"
echo "4. Execute o deploy seguindo DEPLOY_QUICK_START.md"
