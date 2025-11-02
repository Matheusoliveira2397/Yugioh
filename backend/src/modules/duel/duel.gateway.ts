import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DuelService } from './duel.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
export class DuelGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private duelService: DuelService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinDuel')
  async handleJoinDuel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { duelId: string; userId: string },
  ) {
    client.join(data.duelId);
    const duel = await this.duelService.getDuel(data.duelId);
    
    this.server.to(data.duelId).emit('duelUpdate', duel);
    console.log(`User ${data.userId} joined duel ${data.duelId}`);
  }

  @SubscribeMessage('playCard')
  async handlePlayCard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { duelId: string; cardId: string; position: string },
  ) {
    // Lógica de jogar carta
    this.server.to(data.duelId).emit('cardPlayed', {
      cardId: data.cardId,
      position: data.position,
      playerId: client.id,
    });
  }

  @SubscribeMessage('attack')
  async handleAttack(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { duelId: string; attackerId: string; targetId?: string },
  ) {
    const duel = await this.duelService.getDuel(data.duelId);
    
    // Lógica de ataque (simplificada)
    if (duel) {
      this.server.to(data.duelId).emit('attackPerformed', {
        attackerId: data.attackerId,
        targetId: data.targetId,
      });
    }
  }

  @SubscribeMessage('endTurn')
  async handleEndTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { duelId: string },
  ) {
    const updatedDuel = await this.duelService.switchTurn(data.duelId);
    this.server.to(data.duelId).emit('turnChanged', updatedDuel);
  }

  @SubscribeMessage('surrender')
  async handleSurrender(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { duelId: string; userId: string },
  ) {
    const duel = await this.duelService.getDuel(data.duelId);
    
    if (duel) {
      const winnerId = duel.player1Id === data.userId 
        ? duel.player2Id 
        : duel.player1Id;
      
      await this.duelService.endDuel(data.duelId, winnerId);
      
      this.server.to(data.duelId).emit('duelEnded', {
        winnerId,
        reason: 'surrender',
      });
    }
  }
}
