# 🌐 CONFIGURAÇÃO WEBSOCKET - GUIA COMPLETO

## **1. NGINX - LOAD BALANCER COM WEBSOCKET**

### **Arquivo: `/etc/nginx/sites-available/yugioh`**

```nginx
# UPSTREAM - SERVIDORES BACKEND
upstream backend_http {
    # Para requisições HTTP normais
    least_conn;
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=30s;
}

upstream backend_websocket {
    # Para WebSocket - IP HASH garante mesma conexão
    ip_hash;  # ← CRÍTICO: Cliente sempre vai para o mesmo servidor
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

# RATE LIMITING
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=websocket:10m rate=10r/s;

server {
    listen 80;
    server_name api.yugiohgame.com;

    # TIMEOUTS LONGOS PARA WEBSOCKET
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;

    # ===================================
    # WEBSOCKET - ROTA ESPECÍFICA
    # ===================================
    location /socket.io/ {
        limit_req zone=websocket burst=20 nodelay;
        
        proxy_pass http://backend_websocket;
        proxy_http_version 1.1;
        
        # HEADERS CRÍTICOS PARA WEBSOCKET
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # DESABILITAR BUFFERING (Importante!)
        proxy_buffering off;
        proxy_cache off;
        
        # KEEP-ALIVE
        proxy_set_header Connection "keep-alive";
        proxy_http_version 1.1;
        
        # TIMEOUTS LONGOS
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # ===================================
    # API REST - ROTAS NORMAIS
    # ===================================
    location /api {
        limit_req zone=api burst=50 nodelay;
        
        proxy_pass http://backend_http;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # TIMEOUTS NORMAIS
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ===================================
    # STATIC FILES (IMAGENS)
    # ===================================
    location /images {
        root /var/www/yugioh;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # COMPRESSION
    gzip on;
    gzip_types application/json text/plain text/css application/javascript;
    gzip_min_length 1000;

    # SECURITY
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# ===================================
# HTTPS (SSL) - PRODUÇÃO
# ===================================
server {
    listen 443 ssl http2;
    server_name api.yugiohgame.com;

    # SSL CERTIFICATES (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yugiohgame.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yugiohgame.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    
    # TIMEOUTS LONGOS PARA WEBSOCKET
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;

    # WEBSOCKET (WSS)
    location /socket.io/ {
        proxy_pass http://backend_websocket;
        proxy_http_version 1.1;
        
        # WEBSOCKET HEADERS
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        
        proxy_buffering off;
        proxy_cache off;
        
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # API REST
    location /api {
        proxy_pass http://backend_http;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # STATIC FILES
    location /images {
        root /var/www/yugioh;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# REDIRECT HTTP → HTTPS
server {
    listen 80;
    server_name api.yugiohgame.com;
    return 301 https://$server_name$request_uri;
}
```

---

## **2. NESTJS - CONFIGURAÇÃO DO SOCKET.IO**

### **Arquivo: `duel.gateway.ts`**

```typescript
import { 
  WebSocketGateway, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  // CONFIGURAÇÕES IMPORTANTES
  namespace: 'duel',
  
  // CORS
  cors: {
    origin: [
      'http://localhost:5173',           // Dev
      'https://yugiohgame.com',          // Produção
      'https://www.yugiohgame.com',
    ],
    credentials: true,
  },
  
  // TRANSPORTS
  transports: ['websocket', 'polling'], // Fallback para polling
  
  // TIMEOUTS E LIMITES
  pingTimeout: 60000,        // 60s
  pingInterval: 25000,       // 25s heartbeat
  upgradeTimeout: 10000,     // 10s para upgrade
  maxHttpBufferSize: 1e6,    // 1MB
  
  // RECONNECTION
  allowEIO3: true,
})
export class DuelGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DuelGateway.name);
  private connectedClients = new Map<string, string>(); // socketId → userId

  afterInit(server: Server) {
    this.logger.log('🔌 WebSocket Gateway Initialized');
    
    // MIDDLEWARE DE AUTENTICAÇÃO
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error('Authentication error'));
        }

        // Validar JWT
        const decoded = await this.jwtService.verifyAsync(token);
        socket.data.userId = decoded.userId;
        
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    // CONFIGURAÇÕES DE CLUSTER
    if (process.env.NODE_ENV === 'production') {
      // Redis Adapter para múltiplos servidores
      const redisAdapter = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');
      
      const pubClient = createClient({ 
        url: process.env.REDIS_URL 
      });
      const subClient = pubClient.duplicate();

      Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
        server.adapter(redisAdapter.createAdapter(pubClient, subClient));
        this.logger.log('🔴 Redis Adapter Connected');
      });
    }
  }

  handleConnection(client: Socket) {
    const userId = client.data.userId;
    this.connectedClients.set(client.id, userId);
    
    this.logger.log(`✅ Client connected: ${client.id} (User: ${userId})`);
    this.logger.log(`📊 Total connections: ${this.connectedClients.size}`);
    
    // Entrar em sala do usuário
    client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedClients.get(client.id);
    this.connectedClients.delete(client.id);
    
    this.logger.log(`❌ Client disconnected: ${client.id} (User: ${userId})`);
    this.logger.log(`📊 Total connections: ${this.connectedClients.size}`);
  }

  // ENVIAR PARA USUÁRIO ESPECÍFICO
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // ENVIAR PARA SALA DE DUELO
  sendToDuel(duelId: string, event: string, data: any) {
    this.server.to(`duel:${duelId}`).emit(event, data);
  }

  // BROADCAST GLOBAL
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  // MÉTRICAS
  getConnectionCount(): number {
    return this.connectedClients.size;
  }

  getUserConnections(userId: string): number {
    return Array.from(this.connectedClients.values())
      .filter(id => id === userId)
      .length;
  }
}
```

---

## **3. REDIS ADAPTER (Para Múltiplos Servidores)**

### **Instalar dependência:**

```bash
npm install @socket.io/redis-adapter redis
```

### **Por que Redis Adapter?**

```
SEM Redis Adapter:
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Server1 │     │ Server2 │     │ Server3 │
│ Player1 │     │ Player2 │     │ Player3 │
└─────────┘     └─────────┘     └─────────┘
   ❌              ❌              ❌
Player1 não consegue se comunicar com Player2 (servidores diferentes)

COM Redis Adapter:
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Server1 │←────│ Server2 │────→│ Server3 │
│ Player1 │  ↓  │ Player2 │  ↓  │ Player3 │
└─────────┘  │  └─────────┘  │  └─────────┘
             └────→ REDIS ←───┘
                ✅ Todos se comunicam!
```

---

## **4. PM2 - CLUSTER MODE COM WEBSOCKET**

### **Arquivo: `ecosystem.config.js`**

```javascript
module.exports = {
  apps: [{
    name: 'yugioh-backend',
    script: 'dist/main.js',
    
    // CLUSTER MODE
    instances: 3,  // 3 instâncias
    exec_mode: 'cluster',
    
    // PORTAS DIFERENTES PARA CADA INSTÂNCIA
    env_instance_1: {
      PORT: 3001,
      NODE_ENV: 'production',
    },
    env_instance_2: {
      PORT: 3002,
      NODE_ENV: 'production',
    },
    env_instance_3: {
      PORT: 3003,
      NODE_ENV: 'production',
    },
    
    // AUTO RESTART
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // LOGS
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
```

---

## **5. FRONTEND - CONEXÃO WEBSOCKET**

### **Arquivo: `useSocket.ts`**

```typescript
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

let socket: Socket | null = null;

export const useSocket = () => {
  const { token } = useAuthStore();

  const connect = () => {
    if (socket?.connected) return socket;

    socket = io('wss://api.yugiohgame.com', {
      path: '/socket.io/',
      transports: ['websocket', 'polling'], // Tenta WebSocket primeiro
      
      // AUTENTICAÇÃO
      auth: {
        token: token,
      },
      
      // RECONNECTION
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      
      // TIMEOUTS
      timeout: 10000,
      
      // AUTO CONNECT
      autoConnect: true,
    });

    // EVENTOS DE CONEXÃO
    socket.on('connect', () => {
      console.log('✅ WebSocket Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('❌ WebSocket Disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Servidor fechou - reconectar manualmente
        socket?.connect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection Error:', error.message);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
    });

    socket.on('reconnect_failed', () => {
      console.error('❌ Reconnection failed');
    });

    return socket;
  };

  const disconnect = () => {
    socket?.disconnect();
    socket = null;
  };

  return {
    socket: connect(),
    connect,
    disconnect,
  };
};
```

---

## **6. TESTES - VERIFICAR SE FUNCIONA**

### **Teste 1: Conexão Básica**

```bash
# Terminal 1 - Iniciar backend
npm run start:prod

# Terminal 2 - Testar WebSocket
wscat -c ws://localhost:3000/socket.io/?EIO=4&transport=websocket
```

### **Teste 2: Múltiplos Servidores**

```bash
# Iniciar 3 instâncias
pm2 start ecosystem.config.js

# Verificar
pm2 list
pm2 monit

# Testar load balancing
for i in {1..10}; do
  curl http://localhost/api/health
done
```

### **Teste 3: WebSocket através do Nginx**

```bash
wscat -c wss://api.yugiohgame.com/socket.io/?EIO=4&transport=websocket
```

---

## **7. TROUBLESHOOTING**

### **Problema: WebSocket não conecta**

```nginx
# Verificar logs do Nginx
tail -f /var/log/nginx/error.log

# Verificar se Upgrade está chegando
grep "Upgrade" /var/log/nginx/access.log
```

### **Problema: Conexão cai após 60 segundos**

```nginx
# Aumentar timeouts no Nginx
proxy_read_timeout 86400s;
proxy_send_timeout 86400s;
```

### **Problema: WebSocket funciona no dev mas não em produção**

```typescript
// Verificar CORS
cors: {
  origin: process.env.FRONTEND_URL,
  credentials: true,
}
```

---

## **8. MONITORAMENTO WEBSOCKET**

### **Dashboard de Métricas:**

```typescript
@Controller('metrics/websocket')
export class WebSocketMetricsController {
  constructor(private duelGateway: DuelGateway) {}

  @Get()
  getMetrics() {
    return {
      totalConnections: this.duelGateway.getConnectionCount(),
      connectedUsers: this.duelGateway.getConnectedUsers(),
      rooms: this.duelGateway.getRooms(),
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

## **📋 CHECKLIST - WEBSOCKET EM PRODUÇÃO**

- [x] Nginx configurado com `proxy_set_header Upgrade`
- [x] `ip_hash` no upstream do WebSocket
- [x] Timeouts longos (86400s)
- [x] `proxy_buffering off`
- [x] Redis Adapter instalado
- [x] CORS configurado
- [x] SSL/TLS (wss://)
- [x] Autenticação via JWT
- [x] Heartbeat/ping configurado
- [x] Reconnection automática
- [x] Logs de conexão/desconexão
- [x] Monitoramento de métricas

---

## **💡 DICA IMPORTANTE**

Se você usar **apenas 1 servidor** (sem cluster), **NÃO precisa** do Redis Adapter!

```typescript
// Single Server (1 instância)
@WebSocketGateway({
  // ... configurações normais
})
// ✅ Funciona perfeitamente!

// Multiple Servers (2+ instâncias)
@WebSocketGateway({
  // ... configurações normais
})
// ❌ Precisa Redis Adapter!
```

**Seu jogo está pronto para WebSocket em produção!** 🚀
