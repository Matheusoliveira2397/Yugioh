import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service';
import { DuelsService } from './duels.service';
import { DuelQueueService } from './duel-queue.service';
import { TurnPhase, DuelOrigin } from './entities/duel.entity';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 300000,
  pingInterval: 60000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  allowEIO3: true,
  connectTimeout: 45000,
})
export class DuelsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map<userId, Map<clientInstanceId, socket>> - múltiplas conexões por usuário
  private userSocketMap: Map<number, Map<string, Socket>> = new Map();

  constructor(
    private jwtService: JwtService,
    private matchmakingService: MatchmakingService,
    private duelsService: DuelsService,
    private duelQueueService: DuelQueueService,
  ) {}

  afterInit(server: Server) {
    this.matchmakingService.setServer(server);
    this.duelQueueService.setServer(server);
    
    // Middleware de autenticação
    server.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token || 
                     socket.handshake.headers?.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Token não fornecido'));
        }

        const decoded = await this.jwtService.verifyAsync(token);
        const userId = typeof decoded.sub === 'string' ? parseInt(decoded.sub, 10) : Number(decoded.sub);
        
        if (isNaN(userId)) {
          return next(new Error('Token inválido: userId não encontrado'));
        }

        const clientInstanceId = socket.handshake.auth?.clientInstanceId || 
                                 socket.handshake.query?.clientInstanceId as string ||
                                 `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

        socket.data.userId = userId;
        socket.data.clientInstanceId = clientInstanceId;
        next();
      } catch (error) {
        next(new Error('Token inválido ou expirado'));
      }
    });
  }

  handleConnection(client: Socket) {
    try {
      const userId = client.data.userId;
      const clientInstanceId = client.data.clientInstanceId;
      
      if (!userId || !clientInstanceId) {
        client.disconnect();
        return;
      }

      // Criar Map de instâncias se não existir
      if (!this.userSocketMap.has(userId)) {
        this.userSocketMap.set(userId, new Map());
      }
      
      const userInstances = this.userSocketMap.get(userId)!;
      
      // Limpar sockets desconectados
      userInstances.forEach((socket, instanceId) => {
        if (!socket || !socket.connected) {
          userInstances.delete(instanceId);
        }
      });
      
      // Limite de conexões
      if (userInstances.size >= 20) {
        client.emit('connectionLimitReached', { 
          message: 'Limite de conexões atingido. Feche outras abas.' 
        });
        client.disconnect(true);
        return;
      }
      
      // Substituir socket antigo se mesma instância
      if (userInstances.has(clientInstanceId)) {
        const existingSocket = userInstances.get(clientInstanceId);
        if (existingSocket && existingSocket.connected) {
          existingSocket.disconnect(true);
        }
      }
      
      // Adicionar nova conexão
      userInstances.set(clientInstanceId, client);
      client.join(`user_${userId}`);
    } catch (error) {
      console.error(`❌ Erro ao conectar:`, error);
    }
  }

  handleDisconnect(client: Socket) {
    try {
      const userId = client.data.userId;
      const clientInstanceId = client.data.clientInstanceId;
      
      if (userId && clientInstanceId) {
        const userInstances = this.userSocketMap.get(userId);
        if (userInstances) {
          userInstances.delete(clientInstanceId);
          
          if (userInstances.size === 0) {
            this.userSocketMap.delete(userId);
            this.matchmakingService.removeFromQueue(userId);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao desconectar:`, error);
    }
  }

  @SubscribeMessage('searchDuel')
  handleSearchDuel(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId || data.userId;
      if (!userId) {
        console.error(`❌ [handleSearchDuel] ID de usuário inválido`);
        client.emit('duelError', { message: 'ID de usuário inválido' });
        return;
      }
      
      console.log(`🔍 [handleSearchDuel] Usuário ${userId} procurando duelo (Socket: ${client.id})`);
      this.matchmakingService.addToQueue(userId, client.id);
      client.join(`user_${userId}`);
      client.emit('searchingDuel', { message: 'Procurando oponente...' });
    } catch (error) {
      console.error(`❌ [handleSearchDuel] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao processar busca' });
    }
  }

  @SubscribeMessage('cancelSearch')
  handleCancelSearch(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId || data.userId;
      this.matchmakingService.removeFromQueue(userId);
      client.emit('searchCancelled');
    } catch (error) {
      // Ignorar erro
    }
  }

  @SubscribeMessage('createDuelFromMatch')
  async handleCreateDuelFromMatch(
    @MessageBody() data: { player1Id: number; player2Id: number; origin?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { player1Id, player2Id, origin } = data;
      const userId = client.data.userId;
      
      if (userId !== player1Id && userId !== player2Id) {
        client.emit('duelError', { message: 'Você não é um dos jogadores deste match' });
        return;
      }

      client.join(`user_${userId}`);
      
      // Determinar origem do duelo (CHAT, ARENA, TOURNAMENT, ou OTHER)
      let duelOrigin = DuelOrigin.OTHER;
      if (origin) {
        const originUpper = origin.toUpperCase();
        if (originUpper === 'CHAT') duelOrigin = DuelOrigin.CHAT;
        else if (originUpper === 'ARENA') duelOrigin = DuelOrigin.ARENA;
        else if (originUpper === 'TOURNAMENT') duelOrigin = DuelOrigin.TOURNAMENT;
      }
      
      // Adicionar à fila (não bloqueia)
      this.duelQueueService.enqueueDuelCreation(player1Id, player2Id, client.id, duelOrigin)
        .catch((error) => {
          client.emit('duelError', { message: 'Erro ao criar duelo' });
        });
    } catch (error) {
      client.emit('duelError', { message: 'Erro ao processar criação de duelo' });
    }
  }

  @SubscribeMessage('joinDuelRoom')
  async handleJoinDuelRoom(
    @MessageBody() data: { duelId: number | string; userId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Yield ao Event Loop ANTES de processar (prioriza HTTP)
      await new Promise(resolve => setImmediate(resolve));
      
      // UUID pode ser string, não precisa converter para number
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const userId = data.userId || client.data.userId;

      if (!duelId || !userId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      console.log(`🔍 [handleJoinDuelRoom] ==========================================`);
      console.log(`🔍 [handleJoinDuelRoom] Buscando duelo: ${duelId} (tipo: ${typeof duelId})`);
      console.log(`🔍 [handleJoinDuelRoom] UserId: ${userId} (tipo: ${typeof userId})`);
      
      // Buscar duelo (primeiro em memória, depois no banco)
      let duel = this.duelsService.findDuelByIdLight(duelId);
      console.log(`🔍 [handleJoinDuelRoom] Busca em memória: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
      
      // Se não encontrou em memória, buscar no banco
      if (!duel) {
        console.log(`🔍 [handleJoinDuelRoom] Buscando no banco...`);
        duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        console.log(`🔍 [handleJoinDuelRoom] Busca no banco: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
      }
      
      // Retry simples se não encontrou
      if (!duel) {
        console.log(`🔍 [handleJoinDuelRoom] Retry após 100ms...`);
        await new Promise(resolve => setTimeout(resolve, 100));
        duel = this.duelsService.findDuelByIdLight(duelId);
        if (!duel) {
          duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        }
        console.log(`🔍 [handleJoinDuelRoom] Após retry: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
      }

      if (!duel) {
        console.error(`❌ [handleJoinDuelRoom] Duelo ${duelId} NÃO encontrado após todas as tentativas!`);
        client.emit('duelError', { message: 'Duelo não encontrado' });
        return;
      }
      
      console.log(`✅ [handleJoinDuelRoom] Duelo encontrado! ID: ${duel.id}`);

      // Verificar permissão
      const duelPlayer1Id = Number(duel.player1Id);
      const duelPlayer2Id = Number(duel.player2Id);
      const numericUserId = Number(userId);
      
      if (duelPlayer1Id !== numericUserId && duelPlayer2Id !== numericUserId) {
        client.emit('duelError', { message: 'Você não é um dos jogadores deste duelo' });
        return;
      }

      // Entrar nas rooms
      client.join(`duel_${duelId}`);
      client.join(`user_${userId}`);

      // Yield antes de processar campos (prioriza HTTP)
      await new Promise(resolve => setImmediate(resolve));

      // Preparar dados (simplificado - sem remoção pesada de base64)
      const isPlayer1 = duelPlayer1Id === numericUserId;
      const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

      console.log(`📤 [handleJoinDuelRoom] Preparando dados do duelo...`);
      console.log(`📤 [handleJoinDuelRoom] isPlayer1: ${isPlayer1}`);
      console.log(`📤 [handleJoinDuelRoom] playerField existe: ${!!playerField}`);
      console.log(`📤 [handleJoinDuelRoom] opponentField existe: ${!!opponentField}`);
      
      if (playerField) {
        console.log(`📤 [handleJoinDuelRoom] playerField - Deck: ${playerField.deck?.length || 0} cartas, Hand: ${playerField.hand?.length || 0} cartas`);
      }
      if (opponentField) {
        console.log(`📤 [handleJoinDuelRoom] opponentField - Deck: ${opponentField.deck?.length || 0} cartas, Hand: ${opponentField.hand?.length || 0} cartas`);
      }

      // Calcular tempo restante do turno
      const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(duel);

      // Enviar dados do duelo
      const duelData = {
        id: duel.id,
        player1Id: duel.player1Id,
        player2Id: duel.player2Id,
        player1: (duel as any).player1,
        player2: (duel as any).player2,
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
        currentTurn: duel.currentTurn,
        currentPhase: duel.currentPhase || 'DRAW',
        status: duel.status,
        duelTime: (duel as any).duelTime || 0,
        turnTime: (duel as any).turnTime || 90,
        turnTimeRemaining: turnTimeRemaining, // Tempo restante calculado
        turnStartedAt: (duel as any).turnStartedAt, // Timestamp de quando o turno começou
        player1Field: isPlayer1 ? playerField : opponentField,
        player2Field: isPlayer1 ? opponentField : playerField,
        createdAt: duel.createdAt,
        updatedAt: duel.updatedAt,
      };

      console.log(`📤 [handleJoinDuelRoom] Enviando duelUpdate para cliente...`);
      console.log(`📤 [handleJoinDuelRoom] DuelData:`, {
        id: duelData.id,
        player1Id: duelData.player1Id,
        player2Id: duelData.player2Id,
        currentTurn: duelData.currentTurn,
        status: duelData.status,
        hasPlayer1Field: !!duelData.player1Field,
        hasPlayer2Field: !!duelData.player2Field,
      });

      client.emit('duelUpdate', duelData);
      console.log(`✅ [handleJoinDuelRoom] duelUpdate enviado com sucesso!`);
      console.log(`✅ [handleJoinDuelRoom] ==========================================`);
    } catch (error) {
      console.error(`❌ [handleJoinDuelRoom] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao entrar na room do duelo' });
    }
  }

  @SubscribeMessage('nextPhase')
  async handleNextPhase(
    @MessageBody() data: { duelId: number | string; userId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // UUID pode ser string, não precisa converter para number
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const userId = data.userId || client.data.userId;

      if (!duelId || !userId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se é o turno do jogador
      const duel = this.duelsService.findDuelByIdLight(duelId);
      if (!duel) {
        client.emit('duelError', { message: 'Duelo não encontrado' });
        return;
      }

      const numericUserId = Number(userId);
      const isPlayer1 = duel.player1Id === numericUserId;
      const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

      if (!isCurrentTurn) {
        client.emit('duelError', { message: 'Não é seu turno' });
        return;
      }

      // Avançar fase
      const updatedDuel = await this.duelsService.nextPhase(duelId);
      if (!updatedDuel) {
        client.emit('duelError', { message: 'Erro ao avançar fase' });
        return;
      }

      // Preparar dados atualizados
      const isPlayer1Updated = updatedDuel.player1Id === numericUserId;
      const playerField = isPlayer1Updated ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
      const opponentField = isPlayer1Updated ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;

      // Calcular tempo restante do turno
      const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

      const duelData = {
        id: updatedDuel.id,
        player1Id: updatedDuel.player1Id,
        player2Id: updatedDuel.player2Id,
        player1: (updatedDuel as any).player1,
        player2: (updatedDuel as any).player2,
        player1LifePoints: updatedDuel.player1LifePoints,
        player2LifePoints: updatedDuel.player2LifePoints,
        currentTurn: updatedDuel.currentTurn,
        currentPhase: updatedDuel.currentPhase || 'DRAW',
        status: updatedDuel.status,
        duelTime: (updatedDuel as any).duelTime || 0,
        turnTime: (updatedDuel as any).turnTime || 90,
        turnTimeRemaining: turnTimeRemaining, // Tempo restante calculado
        turnStartedAt: (updatedDuel as any).turnStartedAt, // Timestamp de quando o turno começou
        player1Field: isPlayer1Updated ? playerField : opponentField,
        player2Field: isPlayer1Updated ? opponentField : playerField,
        createdAt: updatedDuel.createdAt,
        updatedAt: updatedDuel.updatedAt,
      };

      // Emitir atualização para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
    } catch (error) {
      console.error(`❌ [handleNextPhase] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao avançar fase' });
    }
  }

  @SubscribeMessage('timeExpired')
  async handleTimeExpired(
    @MessageBody() data: { duelId: number | string; userId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // UUID pode ser string, não precisa converter para number
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const userId = data.userId || client.data.userId;

      if (!duelId || !userId) {
        return;
      }

      // Notificar o oponente que o tempo expirou
      const duel = this.duelsService.findDuelByIdLight(duelId);
      if (!duel) {
        return;
      }

      const numericUserId = Number(userId);
      const isPlayer1 = duel.player1Id === numericUserId;
      const opponentId = isPlayer1 ? duel.player2Id : duel.player1Id;

      // Emitir evento para o oponente
      this.server.to(`user_${opponentId}`).emit('timeExpired', { duelId });
    } catch (error) {
      console.error(`❌ [handleTimeExpired] Erro:`, error);
    }
  }

  @SubscribeMessage('stealTurn')
  async handleStealTurn(
    @MessageBody() data: { duelId: number | string; userId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // UUID pode ser string, não precisa converter para number
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const userId = data.userId || client.data.userId;

      if (!duelId || !userId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se é o turno do oponente (não do jogador atual)
      const duel = this.duelsService.findDuelByIdLight(duelId);
      if (!duel) {
        client.emit('duelError', { message: 'Duelo não encontrado' });
        return;
      }

      const numericUserId = Number(userId);
      const isPlayer1 = duel.player1Id === numericUserId;
      const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

      // Só pode roubar turno se NÃO for seu turno
      if (isCurrentTurn) {
        client.emit('duelError', { message: 'É seu turno, não pode roubar' });
        return;
      }

      // Trocar turno (roubar o turno do oponente)
      duel.currentTurn = duel.currentTurn === 1 ? 2 : 1;
      duel.currentPhase = TurnPhase.DRAW; // Resetar para fase inicial
      (duel as any).turnTime = 90; // Resetar tempo do turno
      (duel as any).turnStartedAt = new Date(); // Resetar timestamp do turno

      // Atualizar no banco de dados
      await this.duelsService.updateDuelInDatabase(duelId, {
        currentTurn: duel.currentTurn,
        currentPhase: duel.currentPhase,
        turnTime: 90,
        turnStartedAt: new Date(),
      } as any);

      // Preparar dados atualizados
      const isPlayer1Updated = duel.player1Id === numericUserId;
      const playerField = isPlayer1Updated ? (duel as any).player1Field : (duel as any).player2Field;
      const opponentField = isPlayer1Updated ? (duel as any).player2Field : (duel as any).player1Field;

      // Calcular tempo restante do turno
      const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(duel);

      const duelData = {
        id: duel.id,
        player1Id: duel.player1Id,
        player2Id: duel.player2Id,
        player1: (duel as any).player1,
        player2: (duel as any).player2,
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
        currentTurn: duel.currentTurn,
        currentPhase: duel.currentPhase || 'DRAW',
        status: duel.status,
        duelTime: (duel as any).duelTime || 0,
        turnTime: (duel as any).turnTime || 90,
        turnTimeRemaining: turnTimeRemaining, // Tempo restante calculado
        turnStartedAt: (duel as any).turnStartedAt, // Timestamp de quando o turno começou
        player1Field: isPlayer1Updated ? playerField : opponentField,
        player2Field: isPlayer1Updated ? opponentField : playerField,
        createdAt: duel.createdAt,
        updatedAt: duel.updatedAt,
      };

      // Emitir atualização para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
    } catch (error) {
      console.error(`❌ [handleStealTurn] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao roubar turno' });
    }
  }

  @SubscribeMessage('updateDuelTime')
  async handleUpdateDuelTime(
    @MessageBody() data: { duelId: number | string; timeInSeconds: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // UUID pode ser string, não precisa converter para number
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const timeInSeconds = data.timeInSeconds;

      if (!duelId || timeInSeconds === undefined) {
        return; // Silenciosamente ignorar se dados inválidos
      }

      // Atualizar tempo no banco de dados (assíncrono)
      this.duelsService.updateDuelTime(duelId, timeInSeconds).catch((error) => {
        console.error(`❌ [handleUpdateDuelTime] Erro ao atualizar tempo:`, error);
      });
    } catch (error) {
      // Silenciosamente ignorar erros
    }
  }

  // Helper para emitir para todas as abas de um usuário
  private emitToUser(userId: number, event: string, data: any): void {
    const userInstances = this.userSocketMap.get(userId);
    if (!userInstances) return;
    
    userInstances.forEach((socket) => {
      if (socket && socket.connected) {
        socket.emit(event, data);
      }
    });
  }
}
