import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from './matchmaking.service';
import { DuelService } from '../duel/duel.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
export class MatchmakingGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private matchmakingService: MatchmakingService,
    private duelService: DuelService,
  ) {}

  @SubscribeMessage('joinQueue')
  async handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; rating: number },
  ) {
    const player = {
      userId: data.userId,
      socketId: client.id,
      rating: data.rating,
      joinedAt: Date.now(),
    };

    await this.matchmakingService.addToQueue(player);
    
    client.emit('queueJoined', { 
      message: 'Procurando por oponente...',
      queueSize: await this.matchmakingService.getQueueSize(),
    });

    // Tentar encontrar um match imediatamente
    const opponent = await this.matchmakingService.findMatch(player);
    
    if (opponent) {
      // Match encontrado!
      await this.matchmakingService.removeFromQueue(player.userId);
      await this.matchmakingService.removeFromQueue(opponent.userId);

      // Criar duelo
      const duel = await this.duelService.createDuel(
        player.userId,
        opponent.userId,
      );

      // Notificar ambos os jogadores
      this.server.to(client.id).emit('matchFound', {
        duelId: duel.id,
        opponent: { userId: opponent.userId },
      });

      this.server.to(opponent.socketId).emit('matchFound', {
        duelId: duel.id,
        opponent: { userId: player.userId },
      });
    }
  }

  @SubscribeMessage('leaveQueue')
  async handleLeaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    await this.matchmakingService.removeFromQueue(data.userId);
    client.emit('queueLeft', { message: 'Você saiu da fila' });
  }
}
