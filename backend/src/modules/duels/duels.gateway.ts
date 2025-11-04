import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DuelsService } from './duels.service';
import { DuelActionType } from './entities/duel-log.entity';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DuelsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSocketMap: Map<string, string> = new Map(); // userId -> socketId

  constructor(private duelsService: DuelsService) {}

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
    
    // Remover da fila se estava procurando duelo
    const userId = Array.from(this.userSocketMap.entries())
      .find(([, socketId]) => socketId === client.id)?.[0];
    
    if (userId) {
      this.duelsService.removeFromQueue(userId);
      this.userSocketMap.delete(userId);
    }
  }

  @SubscribeMessage('searchDuel')
  async handleSearchDuel(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = data;
    
    console.log(`Usuário ${userId} procurando duelo...`);
    
    // Mapear socket ID
    this.userSocketMap.set(userId, client.id);
    
    // Adicionar na fila
    this.duelsService.addToQueue(userId, client.id);
    
    // Notificar que entrou na fila
    client.emit('searchingDuel', { 
      message: 'Procurando oponente...',
      queueSize: this.duelsService.getQueueSize()
    });
    
    // Tentar encontrar oponente
    const match = await this.duelsService.findOpponent(userId);
    
    if (match) {
      const { opponent, duel } = match;
      
      // Notificar ambos os jogadores
      const player1Socket = this.server.sockets.sockets.get(client.id);
      const player2Socket = this.server.sockets.sockets.get(opponent.socketId);
      
      if (player1Socket) {
        player1Socket.emit('duelFound', {
          duelId: duel.id,
          opponent: {
            id: duel.player2.id,
            username: duel.player2.username,
            clanTag: (duel.player2 as any).clanTag || null,
            level: (duel.player2 as any).level || 1,
            avatar: (duel.player2 as any).avatar || null,
          },
          yourTurn: duel.currentTurn === 1,
          lifePoints: duel.player1LifePoints,
          opponentLifePoints: duel.player2LifePoints,
        });
      }
      
      if (player2Socket) {
        player2Socket.emit('duelFound', {
          duelId: duel.id,
          opponent: {
            id: duel.player1.id,
            username: duel.player1.username,
            clanTag: (duel.player1 as any).clanTag || null,
            level: (duel.player1 as any).level || 1,
            avatar: (duel.player1 as any).avatar || null,
          },
          yourTurn: duel.currentTurn === 2,
          lifePoints: duel.player2LifePoints,
          opponentLifePoints: duel.player1LifePoints,
        });
      }
    }
  }

  @SubscribeMessage('cancelSearch')
  handleCancelSearch(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = data;
    this.duelsService.removeFromQueue(userId);
    this.userSocketMap.delete(userId);
    
    client.emit('searchCancelled', { message: 'Busca cancelada' });
  }

  @SubscribeMessage('duelAction')
  async handleDuelAction(
    @MessageBody() data: { duelId: string; userId: string; actionType: string; actionData?: any },
    @ConnectedSocket() client: Socket,
  ) {
    const { duelId, userId, actionType, actionData } = data;
    
    const duel = await this.duelsService.findDuelById(duelId);
    if (!duel) return;
    
    // Criar log da ação
    let message = '';
    let actionTypeEnum: DuelActionType;
    
    switch (actionType) {
      case 'DRAW_CARD':
        message = `${userId === duel.player1.id ? duel.player1.username : duel.player2.username} comprou uma carta`;
        actionTypeEnum = DuelActionType.DRAW_CARD;
        break;
      case 'SUMMON_MONSTER':
        message = `${userId === duel.player1.id ? duel.player1.username : duel.player2.username} invocou ${actionData?.cardName}`;
        actionTypeEnum = DuelActionType.SUMMON_MONSTER;
        break;
      case 'ATTACK':
        message = `${userId === duel.player1.id ? duel.player1.username : duel.player2.username} atacou com ${actionData?.attackerName}`;
        actionTypeEnum = DuelActionType.ATTACK;
        break;
      case 'END_TURN':
        message = `${userId === duel.player1.id ? duel.player1.username : duel.player2.username} finalizou o turno`;
        actionTypeEnum = DuelActionType.END_TURN;
        break;
      default:
        return;
    }
    
    const log = await this.duelsService.createLog(duelId, userId, actionTypeEnum, message, actionData);
    
    // Notificar ambos os jogadores
    this.server.to(duelId).emit('duelLog', {
      log: {
        id: log.id,
        username: log.user.username,
        actionType: log.actionType,
        message: log.message,
        createdAt: log.createdAt,
      }
    });
    
    // Se foi ação que afeta o estado, notificar atualização
    this.server.to(duelId).emit('duelStateUpdate', {
      actionType,
      actionData,
    });
  }

  @SubscribeMessage('duelChat')
  async handleDuelChat(
    @MessageBody() data: { duelId: string; userId: string; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { duelId, userId, message } = data;
    
    const duel = await this.duelsService.findDuelById(duelId);
    if (!duel) {
      console.log('Duelo não encontrado:', duelId);
      return;
    }
    
    const player = userId === duel.player1.id ? duel.player1 : duel.player2;
    const displayName = player.nickname || player.username;
    
    console.log(`💬 Chat do duelo ${duelId}: ${displayName} disse: ${message}`);
    
    // Enviar mensagem para todos na sala
    this.server.to(duelId).emit('chatMessage', {
      username: displayName,
      message,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('joinDuelRoom')
  handleJoinDuelRoom(
    @MessageBody() data: { duelId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { duelId } = data;
    client.join(duelId);
    console.log(`Cliente ${client.id} entrou na sala do duelo ${duelId}`);
  }

  @SubscribeMessage('lifePointsChange')
  async handleLifePointsChange(
    @MessageBody() data: { duelId: string; userId: string; newLifePoints: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { duelId, userId, newLifePoints } = data;
    
    const duel = await this.duelsService.findDuelById(duelId);
    if (!duel) return;
    
    const player = userId === duel.player1.id ? 1 : 2;
    await this.duelsService.updateLifePoints(duelId, player, newLifePoints);
    
    // Criar log
    const username = player === 1 ? duel.player1.username : duel.player2.username;
    await this.duelsService.createLog(
      duelId,
      userId,
      DuelActionType.LIFE_CHANGE,
      `${username} agora tem ${newLifePoints} pontos de vida`,
      { oldLifePoints: player === 1 ? duel.player1LifePoints : duel.player2LifePoints, newLifePoints }
    );
    
    // Notificar todos
    this.server.to(duelId).emit('lifePointsUpdate', {
      player,
      newLifePoints,
    });
    
    // Verificar vitória
    if (newLifePoints <= 0) {
      const winnerId = player === 1 ? duel.player2.id : duel.player1.id;
      await this.duelsService.finishDuel(
        duelId,
        player === 1 ? 'PLAYER2_WIN' as any : 'PLAYER1_WIN' as any,
        winnerId
      );
      
      this.server.to(duelId).emit('duelEnd', {
        winnerId,
        reason: 'life_points',
      });
    }
  }

  @SubscribeMessage('endTurn')
  async handleEndTurn(
    @MessageBody() data: { duelId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { duelId, userId } = data;
    
    console.log(`🔄 Finalizando turno no duelo ${duelId} pelo usuário ${userId}`);
    
    const duel = await this.duelsService.findDuelById(duelId);
    if (!duel) {
      console.log('❌ Duelo não encontrado');
      return;
    }
    
    // Verificar se é o turno do jogador
    const isPlayer1 = userId === duel.player1.id;
    const currentPlayer = isPlayer1 ? 1 : 2;
    
    if (duel.currentTurn !== currentPlayer) {
      console.log('❌ Não é o turno deste jogador');
      client.emit('error', { message: 'Não é seu turno!' });
      return;
    }
    
    // Alternar turno
    const newTurn = duel.currentTurn === 1 ? 2 : 1;
    await this.duelsService.changeTurn(duelId, newTurn);
    
    // Criar log
    const username = isPlayer1 ? duel.player1.username : duel.player2.username;
    await this.duelsService.createLog(
      duelId,
      userId,
      DuelActionType.END_TURN,
      `${username} finalizou o turno`,
      { previousTurn: currentPlayer, newTurn }
    );
    
    console.log(`✅ Turno alterado de ${currentPlayer} para ${newTurn}`);
    
    // Notificar ambos os jogadores sobre a mudança de turno
    this.server.to(duelId).emit('turnChanged', {
      newTurn,
      currentPlayerId: newTurn === 1 ? duel.player1.id : duel.player2.id,
      turnTimeLimit: 90, // 90 segundos por turno
    });
  }
}
