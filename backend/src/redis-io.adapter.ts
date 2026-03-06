/**
 * Adapter Socket.IO com Redis para produção com múltiplas instâncias.
 * Quando REDIS_URL está definido e o pacote @socket.io/redis-adapter está instalado,
 * as salas (duel_*, user_*) são compartilhadas entre instâncias; caso contrário usa o adapter em memória.
 * Opcional: o build passa mesmo sem npm install @socket.io/redis-adapter.
 */
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private redisAdapter: any = null;

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url || url.trim() === '') {
      return;
    }
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');
      const pubClient = createClient({ url });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.redisAdapter = createAdapter(pubClient, subClient);
      console.log('✅ [RedisIoAdapter] Redis adapter conectado - salas Socket.IO compartilhadas entre instâncias');
    } catch (err: any) {
      console.warn(
        '⚠️ [RedisIoAdapter] Redis não disponível (instale @socket.io/redis-adapter e redis). Usando adapter em memória:',
        err?.message || err,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.redisAdapter) {
      server.adapter(this.redisAdapter);
    }
    return server;
  }
}
