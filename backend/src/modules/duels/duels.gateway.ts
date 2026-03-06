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
import { Inject, forwardRef } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { DuelsService } from './duels.service';
import { DuelQueueService } from './duel-queue.service';
import { TurnPhase, DuelOrigin, DuelStatus } from './entities/duel.entity';
import { UsersService } from '../users/users.service';
import { CardEffectHandlersService } from './services/card-effect-handlers.service';
import { CardEffectsService } from './services/card-effects.service';
import { ArenaMatchmakingService } from '../arena/arena-matchmaking.service';
import { ArenaService } from '../arena/arena.service';
import { ArenaMatchmakingProcessorService } from '../arena/arena-matchmaking-processor.service';

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
    private usersService: UsersService,
    private cardEffectHandlersService: CardEffectHandlersService,
    private cardEffectsService: CardEffectsService,
    @Inject(forwardRef(() => ArenaMatchmakingService))
    private arenaMatchmakingService: ArenaMatchmakingService,
    @Inject(forwardRef(() => ArenaService))
    private arenaService: ArenaService,
    @Inject(forwardRef(() => ArenaMatchmakingProcessorService))
    private arenaMatchmakingProcessorService: ArenaMatchmakingProcessorService,
  ) {}

  /** Emite notificação do sistema para um usuário (ex.: premiação da arena). O frontend escuta 'systemMessage'. */
  emitSystemMessageToUser(userId: number, data: { id: string; type: string; content: string; createdAt: string }) {
    this.server.to(`user_${userId}`).emit('systemMessage', data);
  }

  /** Emite notificação do sistema para todos os clientes conectados (ex.: arena abriu). */
  emitSystemMessageToAll(data: { id: string; type: string; content: string; createdAt: string }) {
    this.server.emit('systemMessage', data);
  }

  afterInit(server: Server) {
    this.matchmakingService.setServer(server);
    this.duelQueueService.setServer(server);
    this.arenaMatchmakingProcessorService.setServer(server);
    
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
      
      // Marcar como online quando conectar (se for primeira conexão e não estiver banido)
      if (userInstances.size === 1) {
        this.usersService.getUserById(userId).then((user) => {
          if (user && !user.isBanned) {
            this.usersService.updateOnlineStatus(userId, true).catch((error) => {
              console.error(`❌ [DuelsGateway] Erro ao atualizar status online para usuário ${userId}:`, error);
            });
          }
        }).catch((error) => {
          console.error(`❌ [DuelsGateway] Erro ao verificar usuário ${userId}:`, error);
        });
      }
    } catch (error) {
      console.error(`❌ Erro ao conectar:`, error);
    }
  }

  /**
   * Retorna os IDs dos usuários que realmente têm conexões ativas
   */
  getActiveUserIds(): number[] {
    const activeUserIds: number[] = [];
    this.userSocketMap.forEach((instances, userId) => {
      // Verificar se há pelo menos uma conexão ativa
      let hasActiveConnection = false;
      instances.forEach((socket) => {
        if (socket && socket.connected) {
          hasActiveConnection = true;
        }
      });
      if (hasActiveConnection) {
        activeUserIds.push(userId);
      }
    });
    return activeUserIds;
  }

  /**
   * Retorna o servidor Socket.IO para verificação de conexões
   */
  getServer(): Server {
    return this.server;
  }

  handleDisconnect(client: Socket) {
    try {
      const userId = client.data.userId;
      const clientInstanceId = client.data.clientInstanceId;
      
      if (!userId) {
        return;
      }

      // Se temos clientInstanceId, usar a lógica de múltiplas instâncias
      if (clientInstanceId) {
        const userInstances = this.userSocketMap.get(userId);
        if (userInstances) {
          userInstances.delete(clientInstanceId);
          
          // Limpar sockets desconectados
          userInstances.forEach((socket, instanceId) => {
            if (!socket || !socket.connected) {
              userInstances.delete(instanceId);
            }
          });
          
          if (userInstances.size === 0) {
            this.userSocketMap.delete(userId);
            this.matchmakingService.removeFromQueue(userId);
            
            // Verificar se ainda há conexões Socket.IO ativas antes de marcar como offline
            // Usar um pequeno delay para garantir que a desconexão foi processada
            setTimeout(() => {
              // Verificar se há sockets realmente conectados para este usuário
              let hasActiveConnections = false;
              
              // Verificar na sala user_${userId}
              const socketsInRoom = this.server.sockets.adapter.rooms.get(`user_${userId}`);
              if (socketsInRoom && socketsInRoom.size > 0) {
                // Verificar se pelo menos um socket está realmente conectado
                for (const socketId of socketsInRoom) {
                  const socket = this.server.sockets.sockets.get(socketId);
                  if (socket && socket.connected && !socket.disconnected) {
                    hasActiveConnections = true;
                    break;
                  }
                }
              }
              
              // Também verificar diretamente nos sockets conectados
              if (!hasActiveConnections) {
                this.server.sockets.sockets.forEach((socket) => {
                  if (socket && socket.connected && !socket.disconnected) {
                    const socketUserId = socket.data?.userId;
                    if (socketUserId === userId) {
                      hasActiveConnections = true;
                    }
                  }
                });
              }
              
              if (!hasActiveConnections) {
                // Não há mais conexões ativas, marcar como offline
                console.log(`🔴 [DuelsGateway] Usuário ${userId} desconectado - marcando como offline`);
                this.usersService.updateOnlineStatus(userId, false).catch((error) => {
                  console.error(`❌ [DuelsGateway] Erro ao atualizar status offline para usuário ${userId}:`, error);
                });
              } else {
                console.log(`🟢 [DuelsGateway] Usuário ${userId} ainda tem conexões ativas, mantendo online`);
              }
            }, 200); // Aumentar delay para 200ms para garantir sincronização
          }
        }
      } else {
        // Se não temos clientInstanceId, verificar se ainda há outras conexões
        const userInstances = this.userSocketMap.get(userId);
        if (userInstances) {
          // Remover todas as instâncias que apontam para este socket
          let removed = false;
          userInstances.forEach((socket, instanceId) => {
            if (socket === client || socket.id === client.id || !socket.connected) {
              userInstances.delete(instanceId);
              removed = true;
            }
          });

          // Limpar sockets desconectados
          userInstances.forEach((socket, instanceId) => {
            if (!socket || !socket.connected) {
              userInstances.delete(instanceId);
            }
          });

          if (removed && userInstances.size === 0) {
            this.userSocketMap.delete(userId);
            this.matchmakingService.removeFromQueue(userId);
            
            // Verificar se ainda há conexões Socket.IO ativas
            setTimeout(() => {
              // Verificar se há sockets realmente conectados para este usuário
              let hasActiveConnections = false;
              
              // Verificar na sala user_${userId}
              const socketsInRoom = this.server.sockets.adapter.rooms.get(`user_${userId}`);
              if (socketsInRoom && socketsInRoom.size > 0) {
                // Verificar se pelo menos um socket está realmente conectado
                for (const socketId of socketsInRoom) {
                  const socket = this.server.sockets.sockets.get(socketId);
                  if (socket && socket.connected && !socket.disconnected) {
                    hasActiveConnections = true;
                    break;
                  }
                }
              }
              
              // Também verificar diretamente nos sockets conectados
              if (!hasActiveConnections) {
                this.server.sockets.sockets.forEach((socket) => {
                  if (socket && socket.connected && !socket.disconnected) {
                    const socketUserId = socket.data?.userId;
                    if (socketUserId === userId) {
                      hasActiveConnections = true;
                    }
                  }
                });
              }
              
              if (!hasActiveConnections) {
                // Não há mais conexões ativas, marcar como offline
                console.log(`🔴 [DuelsGateway] Usuário ${userId} desconectado (sem clientInstanceId) - marcando como offline`);
                this.usersService.updateOnlineStatus(userId, false).catch((error) => {
                  console.error(`❌ [DuelsGateway] Erro ao atualizar status offline para usuário ${userId}:`, error);
                });
              } else {
                console.log(`🟢 [DuelsGateway] Usuário ${userId} ainda tem conexões ativas, mantendo online`);
              }
            }, 200);
          }
        } else {
          // Se não há instâncias no mapa, verificar conexões Socket.IO antes de marcar como offline
          setTimeout(() => {
            const socketsInRoom = this.server.sockets.adapter.rooms.get(`user_${userId}`);
            const hasActiveConnections = socketsInRoom && socketsInRoom.size > 0;
            
            if (!hasActiveConnections) {
              // Não há mais conexões ativas, marcar como offline
              this.usersService.updateOnlineStatus(userId, false).catch((error) => {
                console.error(`❌ [DuelsGateway] Erro ao atualizar status offline para usuário ${userId}:`, error);
              });
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao desconectar:`, error);
    }
  }

  @SubscribeMessage('searchDuel')
  async handleSearchDuel(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Segurança: usar APENAS o userId do JWT (client.data.userId). Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      if (!userId) {
        console.error(`❌ [handleSearchDuel] ID de usuário inválido`);
        client.emit('duelError', { message: 'ID de usuário inválido' });
        return;
      }

      // Verificar se o jogador tem deck equipado antes de procurar duelo
      const hasDeck = await this.duelsService.hasEquippedDeck(userId);
      if (!hasDeck) {
        console.error(`❌ [handleSearchDuel] Usuário ${userId} não tem deck equipado`);
        client.emit('duelError', { 
          message: 'Você não tem deck equipado. Por favor, equipe um deck antes de procurar duelo.' 
        });
        return;
      }
      
      // Verificar se o jogador já tem um duelo ativo
      const activeDuel = await this.duelsService.getActiveDuelForUser(userId);
      if (activeDuel) {
        console.error(`❌ [handleSearchDuel] Usuário ${userId} já tem duelo ativo (ID: ${activeDuel.id})`);
        client.emit('duelError', { 
          message: 'Você já tem um duelo em andamento. Finalize o duelo atual antes de procurar um novo.',
          activeDuelId: activeDuel.id
        });
        return;
      }

      // Verificar se o jogador está na fila da arena e remover se estiver
      // (garantir que não está em ambas as filas)
      if (this.arenaMatchmakingService.isInArenaQueue(userId)) {
        console.log(`🔄 [handleSearchDuel] Removendo usuário ${userId} da fila da arena antes de adicionar à fila normal`);
        this.arenaMatchmakingService.removeFromArenaQueue(userId);
      }
      
      console.log(`🔍 [handleSearchDuel] Usuário ${userId} procurando duelo (Socket: ${client.id})`);
      this.matchmakingService.addToQueue(userId, client.id);
      client.join(`user_${userId}`);
      client.emit('searchingDuel', { message: 'Procurando oponente...' });
    } catch (error) {
      console.error(`❌ [handleSearchDuel] Erro:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar busca';
      client.emit('duelError', { message: errorMessage });
    }
  }

  @SubscribeMessage('searchArenaDuel')
  async handleSearchArenaDuel(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Segurança: usar APENAS o userId do JWT (client.data.userId). Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      if (!userId) {
        console.error(`❌ [handleSearchArenaDuel] ID de usuário inválido`);
        client.emit('duelError', { message: 'ID de usuário inválido' });
        return;
      }

      // Verificar se há arena ativa
      const currentArena = await this.arenaService.getCurrentArena();
      if (!currentArena) {
        console.error(`❌ [handleSearchArenaDuel] Nenhuma arena ativa no momento`);
        client.emit('duelError', { 
          message: 'Nenhuma arena ativa no momento. Aguarde a próxima arena!' 
        });
        return;
      }

      // Verificar se o jogador tem deck equipado
      const hasDeck = await this.duelsService.hasEquippedDeck(userId);
      if (!hasDeck) {
        console.error(`❌ [handleSearchArenaDuel] Usuário ${userId} não tem deck equipado`);
        client.emit('duelError', { 
          message: 'Você não tem deck equipado. Por favor, equipe um deck antes de procurar duelo na arena.' 
        });
        return;
      }
      
      // Verificar se o jogador já tem um duelo ativo
      const activeDuel = await this.duelsService.getActiveDuelForUser(userId);
      if (activeDuel) {
        console.error(`❌ [handleSearchArenaDuel] Usuário ${userId} já tem duelo ativo (ID: ${activeDuel.id})`);
        client.emit('duelError', { 
          message: 'Você já tem um duelo em andamento. Finalize o duelo atual antes de procurar um novo.',
          activeDuelId: activeDuel.id
        });
        return;
      }

      // Verificar se o jogador está na fila de busca normal e remover se estiver
      // (garantir que não está em ambas as filas)
      if (this.matchmakingService.isInQueue(userId)) {
        console.log(`🔄 [handleSearchArenaDuel] Removendo usuário ${userId} da fila normal antes de adicionar à arena`);
        this.matchmakingService.removeFromQueue(userId);
      }

      // Buscar informações do usuário para determinar divisão
      const user = await this.usersService.findById(userId);
      if (!user) {
        console.error(`❌ [handleSearchArenaDuel] Usuário ${userId} não encontrado`);
        client.emit('duelError', { message: 'Usuário não encontrado' });
        return;
      }

      const userLevel = user.level ?? 1;

      // Adicionar à fila da arena por faixa de nível (só encontra duelo com jogadores da mesma faixa)
      const levelRange = await this.arenaMatchmakingService.addToArenaQueue(userId, client.id, userLevel);
      if (levelRange === null) {
        client.emit('duelError', { message: 'Não foi possível entrar na fila. Verifique se a arena tem faixas de nível configuradas.' });
        return;
      }

      client.join(`user_${userId}`);
      const queueSize = this.arenaMatchmakingService.getQueueSize(levelRange);

      console.log(`🔍 [handleSearchArenaDuel] Usuário ${userId} (Nível ${userLevel}, faixa ${levelRange}) procurando duelo na arena`);
      client.emit('searchingArenaDuel', {
        message: 'Procurando oponente na sua faixa de nível...',
        queueSize,
        levelRange,
      });

      // Disparar matchmaking na próxima tick para não esperar o intervalo (até 1.5s)
      this.arenaMatchmakingProcessorService.triggerProcess();
    } catch (error) {
      console.error(`❌ [handleSearchArenaDuel] Erro:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar busca na arena';
      client.emit('duelError', { message: errorMessage });
    }
  }

  @SubscribeMessage('cancelSearch')
  handleCancelSearch(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Segurança: usar APENAS o userId do JWT (client.data.userId). Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      if (!userId) {
        console.error(`❌ [handleCancelSearch] ID de usuário inválido`);
        return;
      }
      
      // Remover da fila normal
      this.matchmakingService.removeFromQueue(userId);
      
      // Remover da fila da arena também
      this.arenaMatchmakingService.removeFromArenaQueue(userId);
      
      console.log(`🚫 [handleCancelSearch] Usuário ${userId} cancelou busca de duelo`);
      client.emit('searchCancelled', { message: 'Busca cancelada' });
    } catch (error) {
      console.error(`❌ [handleCancelSearch] Erro:`, error);
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
      
      // Validação: não permitir duelo contra si mesmo
      if (player1Id === player2Id) {
        client.emit('duelError', { message: 'Você não pode criar um duelo contra si mesmo!' });
        return;
      }
      
      if (userId !== player1Id && userId !== player2Id) {
        client.emit('duelError', { message: 'Você não é um dos jogadores deste match' });
        return;
      }

      // Verificar se ambos os jogadores têm deck equipado antes de criar duelo
      const player1HasDeck = await this.duelsService.hasEquippedDeck(player1Id);
      const player2HasDeck = await this.duelsService.hasEquippedDeck(player2Id);
      
      if (!player1HasDeck) {
        client.emit('duelError', { 
          message: `Jogador 1 não tem deck equipado. Por favor, equipe um deck antes de criar o duelo.` 
        });
        return;
      }
      
      if (!player2HasDeck) {
        client.emit('duelError', { 
          message: `Jogador 2 não tem deck equipado. Por favor, equipe um deck antes de criar o duelo.` 
        });
        return;
      }

      // Verificar se algum dos jogadores já tem duelo em andamento
      const activeDuelP1 = await this.duelsService.getActiveDuelForUser(player1Id);
      const activeDuelP2 = await this.duelsService.getActiveDuelForUser(player2Id);
      if (activeDuelP1) {
        console.error(`❌ [handleCreateDuelFromMatch] Jogador 1 (${player1Id}) já tem duelo ativo (ID: ${activeDuelP1.id})`);
        client.emit('duelError', {
          message: 'Um dos jogadores já tem um duelo em andamento. Finalize o duelo atual antes de iniciar outro.',
          activeDuelId: activeDuelP1.id,
        });
        return;
      }
      if (activeDuelP2) {
        console.error(`❌ [handleCreateDuelFromMatch] Jogador 2 (${player2Id}) já tem duelo ativo (ID: ${activeDuelP2.id})`);
        client.emit('duelError', {
          message: 'Um dos jogadores já tem um duelo em andamento. Finalize o duelo atual antes de iniciar outro.',
          activeDuelId: activeDuelP2.id,
        });
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
          const errorMessage = error instanceof Error ? error.message : 'Erro ao criar duelo';
          client.emit('duelError', { message: errorMessage });
        });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar criação de duelo';
      client.emit('duelError', { message: errorMessage });
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
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;

      if (!duelId || !userId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      console.log(`🔍 [handleJoinDuelRoom] ==========================================`);
      console.log(`🔍 [handleJoinDuelRoom] Buscando duelo: ${duelId} (tipo: ${typeof duelId})`);
      console.log(`🔍 [handleJoinDuelRoom] UserId: ${userId} (tipo: ${typeof userId})`);
      
      // SEMPRE buscar do banco primeiro para garantir dados atualizados (com forceFromDatabase: true)
      let duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
      console.log(`🔍 [handleJoinDuelRoom] Busca no banco: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
      
      // Se não encontrou no banco, tentar em memória (pode estar sendo criado)
      if (!duel) {
        console.log(`🔍 [handleJoinDuelRoom] Buscando em memória...`);
        duel = this.duelsService.findDuelByIdLight(duelId);
        console.log(`🔍 [handleJoinDuelRoom] Busca em memória: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
      }
      
      // Retry simples se não encontrou
      if (!duel) {
        console.log(`🔍 [handleJoinDuelRoom] Retry após 100ms...`);
        await new Promise(resolve => setTimeout(resolve, 100));
        duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          duel = this.duelsService.findDuelByIdLight(duelId);
        }
        console.log(`🔍 [handleJoinDuelRoom] Após retry: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
      }

      if (!duel) {
        console.error(`❌ [handleJoinDuelRoom] Duelo ${duelId} NÃO encontrado após todas as tentativas!`);
        console.error(`❌ [handleJoinDuelRoom] Possíveis causas:`);
        console.error(`   - Duelo não existe no banco de dados`);
        console.error(`   - Servidor foi reiniciado e duelo não foi recarregado`);
        console.error(`   - Campos player1Field ou player2Field estão vazios no banco`);
        client.emit('duelError', { message: 'Duelo não encontrado. O duelo pode ter sido finalizado ou o servidor foi reiniciado.' });
        return;
      }
      

      // Verificar se o duelo está encerrado ou cancelado - emitir evento especial para popup
      if (duel.status === DuelStatus.FINISHED || duel.status === DuelStatus.CANCELLED) {
        console.warn(`⚠️ [handleJoinDuelRoom] Duelo ${duel.status} - emitindo evento duelEnded`);
        client.emit('duelEnded', { 
          duelId: duel.id,
          status: duel.status,
          result: duel.result,
          winnerId: duel.winnerId,
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
          player1: (duel as any).player1,
          player2: (duel as any).player2,
          player1Id: duel.player1Id,
          player2Id: duel.player2Id,
          turnCounter: duel.turnCounter || 0,
          currentTurn: duel.currentTurn,
          duelTime: (duel as any).duelTime || 0,
          message: duel.status === DuelStatus.FINISHED 
            ? 'Este duelo já foi finalizado' 
            : 'Este duelo foi cancelado'
        });
        return;
      }

      // Verificar se o duelo está aguardando início
      if (duel.status === DuelStatus.WAITING) {
        console.warn(`⚠️ [handleJoinDuelRoom] Duelo ainda está aguardando início`);
        client.emit('duelError', { message: 'Este duelo ainda está aguardando início' });
        return;
      }

      // Verificar se o duelo está em progresso
      if (duel.status !== DuelStatus.IN_PROGRESS) {
        console.warn(`⚠️ [handleJoinDuelRoom] Status desconhecido: ${duel.status}`);
        client.emit('duelError', { message: `Este duelo está com status: ${duel.status}` });
        return;
      }

      const duelPlayer1Id = Number(duel.player1Id);
      const duelPlayer2Id = Number(duel.player2Id);
      const numericUserId = Number(userId);

      // Permitir ADMIN/MASTER assistir qualquer duelo como espectador
      let isSpectator = false;
      const joiningUser = await this.usersService.getUserById(numericUserId);
      if (joiningUser && (joiningUser.role === 'ADMIN' || joiningUser.role === 'MASTER')) {
        if (duelPlayer1Id !== numericUserId && duelPlayer2Id !== numericUserId) {
          isSpectator = true;
        }
      }

      // Verificar permissão (jogador ou espectador admin)
      if (!isSpectator && duelPlayer1Id !== numericUserId && duelPlayer2Id !== numericUserId) {
        client.emit('duelError', { message: 'Você não é um dos jogadores deste duelo' });
        return;
      }

      // Verificar se o jogador tem deck equipado antes de entrar no duelo (não exigir para espectador)
      if (!isSpectator) {
        const hasDeck = await this.duelsService.hasEquippedDeck(numericUserId);
        if (!hasDeck) {
          client.emit('duelError', { 
            message: 'Você não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.' 
          });
          return;
        }
      }

      // Entrar nas rooms
      client.join(`duel_${duelId}`);
      client.join(`user_${userId}`);

      // Yield antes de processar campos (prioriza HTTP)
      await new Promise(resolve => setImmediate(resolve));

      // Preparar dados - SEMPRE enviar player1Field do player1 e player2Field do player2
      // O frontend determina qual campo usar baseado no userId
      let player1Field = (duel as any).player1Field;
      let player2Field = (duel as any).player2Field;
      
      console.log(`🔍 [handleJoinDuelRoom] Campos ANTES do processamento:`);
      console.log(`  - player1Field tipo: ${typeof player1Field}, existe: ${!!player1Field}`);
      console.log(`  - player1Field.deck tipo: ${typeof player1Field?.deck}, length: ${player1Field?.deck?.length || 0}`);
      console.log(`  - player2Field tipo: ${typeof player2Field}, existe: ${!!player2Field}`);
      console.log(`  - player2Field.deck tipo: ${typeof player2Field?.deck}, length: ${player2Field?.deck?.length || 0}`);
      
      // Verificar se os campos são strings (JSON não parseado) e fazer parse se necessário
      if (player1Field && typeof player1Field === 'string') {
        console.log(`🔄 [handleJoinDuelRoom] player1Field é string, fazendo parse...`);
        try {
          player1Field = JSON.parse(player1Field);
        } catch (e) {
          console.error(`❌ [handleJoinDuelRoom] Erro ao fazer parse do player1Field:`, e);
        }
      }
      if (player2Field && typeof player2Field === 'string') {
        console.log(`🔄 [handleJoinDuelRoom] player2Field é string, fazendo parse...`);
        try {
          player2Field = JSON.parse(player2Field);
        } catch (e) {
          console.error(`❌ [handleJoinDuelRoom] Erro ao fazer parse do player2Field:`, e);
        }
      }
      
      // Se algum campo estiver vazio ou não tiver deck, buscar do banco novamente
      if (!player1Field || !player1Field.deck || player1Field.deck.length === 0) {
        console.error(`❌ [handleJoinDuelRoom] player1Field está vazio ou sem deck! Buscando do banco...`);
        const duelFromDb = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (duelFromDb) {
          const dbPlayer1Field = (duelFromDb as any).player1Field;
          if (dbPlayer1Field && dbPlayer1Field.deck && dbPlayer1Field.deck.length > 0) {
            player1Field = dbPlayer1Field;
            console.log(`✅ [handleJoinDuelRoom] player1Field recuperado do banco: ${player1Field.deck.length} cartas`);
          }
        }
      }
      if (!player2Field || !player2Field.deck || player2Field.deck.length === 0) {
        console.error(`❌ [handleJoinDuelRoom] player2Field está vazio ou sem deck! Buscando do banco...`);
        const duelFromDb = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (duelFromDb) {
          const dbPlayer2Field = (duelFromDb as any).player2Field;
          if (dbPlayer2Field && dbPlayer2Field.deck && dbPlayer2Field.deck.length > 0) {
            player2Field = dbPlayer2Field;
            console.log(`✅ [handleJoinDuelRoom] player2Field recuperado do banco: ${player2Field.deck.length} cartas`);
          }
        }
      }

      console.log(`📤 [handleJoinDuelRoom] Preparando dados do duelo...`);
      console.log(`📤 [handleJoinDuelRoom] userId: ${numericUserId}, player1Id: ${duelPlayer1Id}, player2Id: ${duelPlayer2Id}`);
      console.log(`📤 [handleJoinDuelRoom] player1Field existe: ${!!player1Field}`);
      console.log(`📤 [handleJoinDuelRoom] player2Field existe: ${!!player2Field}`);
      
      if (player1Field) {
        console.log(`📤 [handleJoinDuelRoom] player1Field - Deck: ${player1Field.deck?.length || 0} cartas, Hand: ${player1Field.hand?.length || 0} cartas`);
      }
      if (player2Field) {
        console.log(`📤 [handleJoinDuelRoom] player2Field - Deck: ${player2Field.deck?.length || 0} cartas, Hand: ${player2Field.hand?.length || 0} cartas`);
      }
      
      // Log após processamento
      console.log(`🔍 [handleJoinDuelRoom] Campos APÓS processamento:`);
      console.log(`  - player1Field existe: ${!!player1Field}, deck.length: ${player1Field?.deck?.length || 0}`);
      console.log(`  - player2Field existe: ${!!player2Field}, deck.length: ${player2Field?.deck?.length || 0}`);
      
      // Validar que ambos os campos existem e têm cartas antes de enviar
      if (!player1Field || !player1Field.deck || player1Field.deck.length === 0) {
        console.error(`❌ [handleJoinDuelRoom] ERRO CRÍTICO: player1Field ainda está vazio após buscar do banco!`);
        client.emit('duelError', { message: 'Erro ao carregar deck do jogador 1. Por favor, recarregue a página.' });
        return;
      }
      if (!player2Field || !player2Field.deck || player2Field.deck.length === 0) {
        console.error(`❌ [handleJoinDuelRoom] ERRO CRÍTICO: player2Field ainda está vazio após buscar do banco!`);
        client.emit('duelError', { message: 'Erro ao carregar deck do jogador 2. Por favor, recarregue a página.' });
        return;
      }

      // Processar fase DRAW automaticamente se for o turno do jogador e estiver na fase DRAW
      const isPlayer1 = duelPlayer1Id === numericUserId;
      const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
      if (isCurrentTurn && duel.currentPhase === TurnPhase.DRAW) {
        // Emitir DRAW phase primeiro para mostrar o popup
        const drawPhaseDuelData = {
          id: duel.id,
          player1Id: duel.player1Id,
          player2Id: duel.player2Id,
          player1: (duel as any).player1,
          player2: (duel as any).player2,
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
          currentTurn: duel.currentTurn,
          currentPhase: TurnPhase.DRAW,
          status: duel.status,
          duelTime: (duel as any).duelTime || 0,
          turnTime: (duel as any).turnTime || 90,
          turnTimeRemaining: this.duelsService.calculateTurnTimeRemaining(duel),
          turnStartedAt: (duel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (duel as any).pendingChoice || null, // Escolha pendente para restaurar modais
          createdAt: duel.createdAt,
          updatedAt: duel.updatedAt,
        };
        // Emitir apenas para o cliente que está entrando primeiro
        client.emit('duelUpdate', drawPhaseDuelData);
        // Depois emitir para todos na room
        this.server.to(`duel_${duelId}`).emit('duelUpdate', drawPhaseDuelData);
        
        // Delay curto para o frontend mostrar "Draw Phase" antes de processar (evitar travar)
        await new Promise(resolve => setTimeout(resolve, 200));
        const updatedDuel = await this.duelsService.processDrawPhase(duelId);
        
        if (updatedDuel) {
          duel = updatedDuel;
          player1Field = (duel as any).player1Field;
          player2Field = (duel as any).player2Field;
          
          // Emitir atualização: primeiro turno do P1 → MAIN2; demais → STANDBY
          const nextPhaseDuelData = {
            id: duel.id,
            player1Id: duel.player1Id,
            player2Id: duel.player2Id,
            player1: (duel as any).player1,
            player2: (duel as any).player2,
            player1LifePoints: duel.player1LifePoints,
            player2LifePoints: duel.player2LifePoints,
            currentTurn: duel.currentTurn,
            currentPhase: duel.currentPhase, // Usar a fase atual do duelo (BATTLE ou STANDBY)
            status: duel.status,
            duelTime: (duel as any).duelTime || 0,
            turnTime: (duel as any).turnTime || 90,
            turnTimeRemaining: this.duelsService.calculateTurnTimeRemaining(duel),
            turnStartedAt: (duel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (duel as any).pendingChoice || null, // Escolha pendente para restaurar modais
            createdAt: duel.createdAt,
            updatedAt: duel.updatedAt,
          };
          // Emitir para todos na room do duelo
          this.server.to(`duel_${duelId}`).emit('duelUpdate', nextPhaseDuelData);
        }
      } else if (isCurrentTurn && duel.currentPhase !== TurnPhase.DRAW) {
        // Se não está em DRAW mas é o turno do jogador, o duelo já foi processado
        // A fase atual já está correta (STANDBY, MAIN1, BATTLE, MAIN2, etc.)
        // Não precisa de lógica especial - o duelo já está na fase correta
        console.log(`🔄 [handleJoinDuelRoom] Turno do jogador já em andamento - fase atual: ${duel.currentPhase}`);
      }

      // Calcular tempo restante do turno
      const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(duel);

      // Enviar dados do duelo - SEMPRE player1Field do player1 e player2Field do player2
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
        player1Field: player1Field, // SEMPRE do player1
        player2Field: player2Field, // SEMPRE do player2
        pendingChoice: (duel as any).pendingChoice || null, // Escolha pendente para restaurar modais
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
        player1FieldDeckLength: duelData.player1Field?.deck?.length || 0,
        player1FieldHandLength: duelData.player1Field?.hand?.length || 0,
        player2FieldDeckLength: duelData.player2Field?.deck?.length || 0,
        player2FieldHandLength: duelData.player2Field?.hand?.length || 0,
      });
      
      // CRÍTICO: Garantir que o deck está presente antes de enviar
      if (!duelData.player1Field?.deck || duelData.player1Field.deck.length === 0) {
        console.error(`❌ [handleJoinDuelRoom] ERRO: player1Field.deck está vazio antes de enviar!`);
        console.error(`❌ [handleJoinDuelRoom] player1Field completo:`, JSON.stringify(duelData.player1Field, null, 2));
      }
      if (!duelData.player2Field?.deck || duelData.player2Field.deck.length === 0) {
        console.error(`❌ [handleJoinDuelRoom] ERRO: player2Field.deck está vazio antes de enviar!`);
        console.error(`❌ [handleJoinDuelRoom] player2Field completo:`, JSON.stringify(duelData.player2Field, null, 2));
      }
      
      // Garantir que deck é um array válido (não null/undefined)
      if (duelData.player1Field && (!duelData.player1Field.deck || !Array.isArray(duelData.player1Field.deck))) {
        console.warn(`⚠️ [handleJoinDuelRoom] player1Field.deck não é um array válido, inicializando...`);
        duelData.player1Field.deck = [];
      }
      if (duelData.player2Field && (!duelData.player2Field.deck || !Array.isArray(duelData.player2Field.deck))) {
        console.warn(`⚠️ [handleJoinDuelRoom] player2Field.deck não é um array válido, inicializando...`);
        duelData.player2Field.deck = [];
      }

      client.emit('duelUpdate', duelData);
      
      // Carregar logs do duelo do banco de dados e enviar para o cliente (persistência ao fechar/reabrir duelo)
      try {
        const savedLogs = await this.duelsService.getDuelLogs(duel.id);
        const formattedLogs = (savedLogs && savedLogs.length > 0)
          ? savedLogs.map((log: any) => ({
              id: log.id,
              username: log.user?.clanTag ? `|${log.user.clanTag}| ${log.user.nickname}` : log.user?.nickname || 'Jogador',
              actionType: log.actionType,
              message: log.message,
              createdAt: log.createdAt,
            }))
          : [];
        client.emit('duelLogsLoaded', { logs: formattedLogs });
        console.log(`📋 [handleJoinDuelRoom] ${formattedLogs.length} logs carregados do banco e enviados`);
      } catch (logError) {
        console.error(`❌ [handleJoinDuelRoom] Erro ao carregar logs:`, logError);
        client.emit('duelLogsLoaded', { logs: [] });
      }
      
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
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;

      if (!duelId || !userId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se é o turno do jogador
      // Tentar buscar do cache primeiro, depois do banco se não encontrar
      let duel = this.duelsService.findDuelByIdLight(duelId);
      if (!duel) {
        // Se não encontrou no cache, buscar do banco
        console.log(`⚠️ [handleNextPhase] Duelo não encontrado no cache, buscando do banco...`);
        duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
      }

      const numericUserId = Number(userId);
      const isPlayer1 = duel.player1Id === numericUserId;
      const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

      if (!isCurrentTurn) {
        client.emit('duelError', { message: 'Não é seu turno' });
        return;
      }

      // Verificar se está mudando de turno (END -> próximo turno)
      // Verificar se está em MAIN2 (próximo será mudança de turno automática)
      const isChangingTurn = duel.currentPhase === TurnPhase.MAIN2;
      
      // Se está em DRAW, não permitir avançar - DRAW é processada automaticamente
      if (duel.currentPhase === TurnPhase.DRAW) {
        client.emit('duelError', { message: 'A fase DRAW é processada automaticamente. Aguarde...' });
        return;
      }
      
      // Avançar fase
      const oldPhase = duel.currentPhase;
      const updatedDuel = await this.duelsService.nextPhase(duelId);
      if (!updatedDuel) {
        client.emit('duelError', { message: 'Erro ao avançar fase' });
        return;
      }
      
      // Criar log de mudança de fase
      if (updatedDuel.currentPhase !== oldPhase) {
        const phaseNames: { [key: string]: string } = {
          'DRAW': 'Draw',
          'STANDBY': 'Standby',
          'MAIN1': 'Main 1',
          'BATTLE': 'Battle',
          'MAIN2': 'Main 2',
          'END': 'End'
        };
        const oldPhaseName = phaseNames[oldPhase] || oldPhase;
        const newPhaseName = phaseNames[updatedDuel.currentPhase] || updatedDuel.currentPhase;
        await this.createAndEmitDuelLog(duelId, numericUserId, 'PHASE_CHANGE', `Fase mudou de ${oldPhaseName} para ${newPhaseName}`);
      }

      // Se mudou de turno, verificar se há escolha pendente do jogador que PERDEU o turno
      if (isChangingTurn && updatedDuel.currentPhase === TurnPhase.DRAW) {
        // O jogador que PERDEU o turno é o oponente do jogador atual
        const playerWhoLostTurn = isPlayer1 ? updatedDuel.player2Id : updatedDuel.player1Id;
        
        // Buscar duelo atualizado do banco para ter pendingChoice
        const duelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (duelWithPendingChoice && (duelWithPendingChoice as any).pendingChoice) {
          const pendingChoice = (duelWithPendingChoice as any).pendingChoice;
          if (pendingChoice.userId === playerWhoLostTurn) {
            console.log(`⚠️ [handleNextPhase] Turno mudou - fechando modal e fazendo escolha automática para jogador ${playerWhoLostTurn}`);
            
            // 1. Fechar modal imediatamente
            this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { 
              duelId, 
              userId: playerWhoLostTurn,
              reason: 'turn_changed' 
            });
            
            // 2. Fazer escolha automática
            await this.handleAutoChoice(duelId, playerWhoLostTurn, pendingChoice);
            
            // Buscar duelo atualizado após escolha automática
            const updatedDuelAfterAutoChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
            if (updatedDuelAfterAutoChoice) {
              Object.assign(updatedDuel, updatedDuelAfterAutoChoice);
            }
          }
        }
        // Buscar pendingChoice atualizado
        const drawDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        const drawPendingChoice = drawDuelWithPendingChoice ? (drawDuelWithPendingChoice as any).pendingChoice : null;
        
        // Emitir DRAW phase primeiro para mostrar o popup
        const drawPhaseDuelData = {
          id: updatedDuel.id,
          player1Id: updatedDuel.player1Id,
          player2Id: updatedDuel.player2Id,
          player1: (updatedDuel as any).player1,
          player2: (updatedDuel as any).player2,
          player1LifePoints: updatedDuel.player1LifePoints,
          player2LifePoints: updatedDuel.player2LifePoints,
          currentTurn: updatedDuel.currentTurn,
          currentPhase: TurnPhase.DRAW,
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: this.duelsService.calculateTurnTimeRemaining(updatedDuel),
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: (updatedDuel as any).player1Field,
          player2Field: (updatedDuel as any).player2Field,
          pendingChoice: drawPendingChoice,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        this.server.to(`duel_${duelId}`).emit('duelUpdate', drawPhaseDuelData);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const finalDuel = await this.duelsService.processDrawPhase(duelId);
        if (finalDuel) {
          const player1Field = (finalDuel as any).player1Field;
          const player2Field = (finalDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(finalDuel);

          const standbyDuelData = {
            id: finalDuel.id,
            player1Id: finalDuel.player1Id,
            player2Id: finalDuel.player2Id,
            player1: (finalDuel as any).player1,
            player2: (finalDuel as any).player2,
            player1LifePoints: finalDuel.player1LifePoints,
            player2LifePoints: finalDuel.player2LifePoints,
            currentTurn: finalDuel.currentTurn,
            currentPhase: finalDuel.currentPhase,
            status: finalDuel.status,
            duelTime: (finalDuel as any).duelTime || 0,
            turnTime: (finalDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (finalDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            createdAt: finalDuel.createdAt,
            updatedAt: finalDuel.updatedAt,
          };
          this.server.to(`duel_${duelId}`).emit('duelUpdate', standbyDuelData);
        }
        return;
      }

      // Para outras fases, emitir normalmente
      const player1Field = (updatedDuel as any).player1Field;
      const player2Field = (updatedDuel as any).player2Field;
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
        turnTimeRemaining: turnTimeRemaining,
        turnStartedAt: (updatedDuel as any).turnStartedAt,
        player1Field: player1Field,
        player2Field: player2Field,
        pendingChoice: (updatedDuel as any).pendingChoice || null,
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

  @SubscribeMessage('goToPhase')
  async handleGoToPhase(
    @MessageBody() data: { duelId: number | string; userId?: number; targetPhase: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      const targetPhase = data.targetPhase as TurnPhase;

      if (!duelId || !userId || !targetPhase) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se é o turno do jogador
      let duel = this.duelsService.findDuelByIdLight(duelId);
      if (!duel) {
        duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
      }

      const numericUserId = Number(userId);
      const isPlayer1 = duel.player1Id === numericUserId;
      const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

      if (!isCurrentTurn) {
        client.emit('duelError', { message: 'Não é seu turno' });
        return;
      }

      // Se está em DRAW, não permitir mudar fase - DRAW é processada automaticamente
      if (duel.currentPhase === TurnPhase.DRAW) {
        client.emit('duelError', { message: 'A fase DRAW é processada automaticamente. Aguarde...' });
        return;
      }

      // Ir para a fase alvo
      const updatedDuel = await this.duelsService.goToPhase(duelId, targetPhase);
      if (!updatedDuel) {
        client.emit('duelError', { message: 'Erro ao mudar de fase ou fase inválida' });
        return;
      }

      // Se mudou de turno (END -> próximo turno)
      // Verificar se está em DRAW (pode já ter sido processado automaticamente pelo advanceToNextTurn)
      if (duel.currentPhase === TurnPhase.MAIN2 && updatedDuel.currentPhase === TurnPhase.DRAW) {
        // O jogador que PERDEU o turno é o oponente do jogador atual
        const playerWhoLostTurn = isPlayer1 ? updatedDuel.player2Id : updatedDuel.player1Id;
        
        // Buscar duelo atualizado do banco para ter pendingChoice
        const duelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (duelWithPendingChoice && (duelWithPendingChoice as any).pendingChoice) {
          const pendingChoice = (duelWithPendingChoice as any).pendingChoice;
          if (pendingChoice.userId === playerWhoLostTurn) {
            console.log(`⚠️ [handleGoToPhase] Turno mudou - fechando modal e fazendo escolha automática para jogador ${playerWhoLostTurn}`);
            
            // Fechar modal imediatamente
            this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { 
              duelId, 
              userId: playerWhoLostTurn,
              reason: 'turn_changed' 
            });
            
            // Fazer escolha automática
            await this.handleAutoChoice(duelId, playerWhoLostTurn, pendingChoice);
            
            // Buscar duelo atualizado após escolha automática
            const updatedDuelAfterAutoChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
            if (updatedDuelAfterAutoChoice) {
              Object.assign(updatedDuel, updatedDuelAfterAutoChoice);
            }
          }
        }
        
        // Buscar pendingChoice atualizado
        const drawDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        const drawPendingChoice = drawDuelWithPendingChoice ? (drawDuelWithPendingChoice as any).pendingChoice : null;
        
        // Emitir DRAW phase primeiro
        const drawPhaseDuelData = {
          id: updatedDuel.id,
          player1Id: updatedDuel.player1Id,
          player2Id: updatedDuel.player2Id,
          player1: (updatedDuel as any).player1,
          player2: (updatedDuel as any).player2,
          player1LifePoints: updatedDuel.player1LifePoints,
          player2LifePoints: updatedDuel.player2LifePoints,
          currentTurn: updatedDuel.currentTurn,
          currentPhase: TurnPhase.DRAW,
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: this.duelsService.calculateTurnTimeRemaining(updatedDuel),
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: (updatedDuel as any).player1Field,
          player2Field: (updatedDuel as any).player2Field,
          pendingChoice: drawPendingChoice,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        this.server.to(`duel_${duelId}`).emit('duelUpdate', drawPhaseDuelData);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const finalDuel = await this.duelsService.processDrawPhase(duelId);
        if (finalDuel) {
          const player1Field = (finalDuel as any).player1Field;
          const player2Field = (finalDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(finalDuel);

          const standbyDuelData = {
            id: finalDuel.id,
            player1Id: finalDuel.player1Id,
            player2Id: finalDuel.player2Id,
            player1: (finalDuel as any).player1,
            player2: (finalDuel as any).player2,
            player1LifePoints: finalDuel.player1LifePoints,
            player2LifePoints: finalDuel.player2LifePoints,
            currentTurn: finalDuel.currentTurn,
            currentPhase: finalDuel.currentPhase,
            status: finalDuel.status,
            duelTime: (finalDuel as any).duelTime || 0,
            turnTime: (finalDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (finalDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            createdAt: finalDuel.createdAt,
            updatedAt: finalDuel.updatedAt,
          };
          this.server.to(`duel_${duelId}`).emit('duelUpdate', standbyDuelData);
        } else {
          // Buscar duelo atualizado do banco
          const currentDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          if (currentDuel) {
            const player1Field = (currentDuel as any).player1Field;
            const player2Field = (currentDuel as any).player2Field;
            const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(currentDuel);

            const standbyDuelData = {
              id: currentDuel.id,
              player1Id: currentDuel.player1Id,
              player2Id: currentDuel.player2Id,
              player1: (currentDuel as any).player1,
              player2: (currentDuel as any).player2,
              player1LifePoints: currentDuel.player1LifePoints,
              player2LifePoints: currentDuel.player2LifePoints,
              currentTurn: currentDuel.currentTurn,
              currentPhase: currentDuel.currentPhase,
              status: currentDuel.status,
              duelTime: (currentDuel as any).duelTime || 0,
              turnTime: (currentDuel as any).turnTime || 90,
              turnTimeRemaining: turnTimeRemaining,
              turnStartedAt: (currentDuel as any).turnStartedAt,
              player1Field: player1Field,
              player2Field: player2Field,
              pendingChoice: (currentDuel as any).pendingChoice || null,
              createdAt: currentDuel.createdAt,
              updatedAt: currentDuel.updatedAt,
            };
            this.server.to(`duel_${duelId}`).emit('duelUpdate', standbyDuelData);
          }
        }
        return;
      }

      // Para outras fases, emitir normalmente
      const player1Field = (updatedDuel as any).player1Field;
      const player2Field = (updatedDuel as any).player2Field;
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
        turnTimeRemaining: turnTimeRemaining,
        turnStartedAt: (updatedDuel as any).turnStartedAt,
        player1Field: player1Field,
        player2Field: player2Field,
        pendingChoice: (updatedDuel as any).pendingChoice || null,
        createdAt: updatedDuel.createdAt,
        updatedAt: updatedDuel.updatedAt,
      };

      // Emitir atualização para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
    } catch (error) {
      console.error(`❌ [handleGoToPhase] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao mudar de fase' });
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
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;

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

  @SubscribeMessage('endTurn')
  async handleEndTurn(
    @MessageBody() data: { duelId: number | string; userId?: number; cardIdsToDiscard?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      const cardIdsToDiscard = data.cardIdsToDiscard || [];

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

      // Tentar finalizar o turno (o descarte será automático se necessário)
      const result = await this.duelsService.endTurn(duelId, numericUserId);

      // Criar log de finalização de turno
      await this.createAndEmitDuelLog(duelId, numericUserId, 'END_TURN', 'Finalizou o turno');
      
      // Turno finalizado com sucesso - o próximo turno está em DRAW
      // Buscar do banco para garantir dados atualizados
      let updatedDuel: any = result.duel;
      if (!updatedDuel) {
        updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
      }
      if (!updatedDuel) {
        updatedDuel = this.duelsService.findDuelByIdLight(duelId) || undefined;
      }
      if (!updatedDuel) {
        client.emit('duelError', { message: 'Erro ao finalizar turno' });
        return;
      }

      // Verificar se o próximo turno está em DRAW (pode já ter sido processado automaticamente pelo advanceToNextTurn)
      // Se ainda está em DRAW, processar. Se não, a Draw Phase já foi processada automaticamente.
      if (updatedDuel.currentPhase === TurnPhase.DRAW) {
        
        // O jogador que PERDEU o turno é o jogador atual (quem finalizou o turno)
        const playerWhoLostTurn = numericUserId;
        
        // Buscar duelo atualizado do banco para ter pendingChoice
        const duelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (duelWithPendingChoice && (duelWithPendingChoice as any).pendingChoice) {
          const pendingChoice = (duelWithPendingChoice as any).pendingChoice;
          if (pendingChoice.userId === playerWhoLostTurn) {
            console.log(`⚠️ [handleEndTurn] Turno mudou - fechando modal e fazendo escolha automática para jogador ${playerWhoLostTurn}`);
            
            // 1. Fechar modal imediatamente
            this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { 
              duelId, 
              userId: playerWhoLostTurn,
              reason: 'turn_ended' 
            });
            
            // 2. Fazer escolha automática
            await this.handleAutoChoice(duelId, playerWhoLostTurn, pendingChoice);
            
            // Buscar duelo atualizado após escolha automática
            const updatedDuelAfterAutoChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
            if (updatedDuelAfterAutoChoice) {
              Object.assign(updatedDuel, updatedDuelAfterAutoChoice);
            }
          }
        }
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

        // Buscar pendingChoice atualizado
        const endTurnDrawDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        const endTurnDrawPendingChoice = endTurnDrawDuelWithPendingChoice ? (endTurnDrawDuelWithPendingChoice as any).pendingChoice : null;
        
        // Emitir DRAW phase primeiro para mostrar o popup
        const drawPhaseDuelData = {
          id: updatedDuel.id,
          player1Id: updatedDuel.player1Id,
          player2Id: updatedDuel.player2Id,
          player1: (updatedDuel as any).player1,
          player2: (updatedDuel as any).player2,
          player1LifePoints: updatedDuel.player1LifePoints,
          player2LifePoints: updatedDuel.player2LifePoints,
          currentTurn: updatedDuel.currentTurn,
          currentPhase: TurnPhase.DRAW,
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: endTurnDrawPendingChoice,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        this.server.to(`duel_${duelId}`).emit('duelUpdate', drawPhaseDuelData);

        // Pequeno delay para mostrar o popup da fase
        await new Promise(resolve => setTimeout(resolve, 400));

        // Processar DRAW phase (comprar carta e avançar para próxima fase)
        const finalDuel = await this.duelsService.processDrawPhase(duelId);
        if (finalDuel) {
          console.log(`✅ [handleEndTurn] Fase DRAW processada, avançando para ${finalDuel.currentPhase}`);
          const finalPlayer1Field = (finalDuel as any).player1Field;
          const finalPlayer2Field = (finalDuel as any).player2Field;
          const finalTurnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(finalDuel);

          // Buscar pendingChoice atualizado
          const endTurnStandbyDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          const endTurnStandbyPendingChoice = endTurnStandbyDuelWithPendingChoice ? (endTurnStandbyDuelWithPendingChoice as any).pendingChoice : null;

          const standbyDuelData = {
            id: finalDuel.id,
            player1Id: finalDuel.player1Id,
            player2Id: finalDuel.player2Id,
            player1: (finalDuel as any).player1,
            player2: (finalDuel as any).player2,
            player1LifePoints: finalDuel.player1LifePoints,
            player2LifePoints: finalDuel.player2LifePoints,
            currentTurn: finalDuel.currentTurn,
            currentPhase: finalDuel.currentPhase, // Usar a fase atual (BATTLE ou STANDBY)
            status: finalDuel.status,
            duelTime: (finalDuel as any).duelTime || 0,
            turnTime: (finalDuel as any).turnTime || 90,
            turnTimeRemaining: finalTurnTimeRemaining,
            turnStartedAt: (finalDuel as any).turnStartedAt,
            player1Field: finalPlayer1Field,
            player2Field: finalPlayer2Field,
            pendingChoice: endTurnStandbyPendingChoice,
            createdAt: finalDuel.createdAt,
            updatedAt: finalDuel.updatedAt,
          };
          this.server.to(`duel_${duelId}`).emit('duelUpdate', standbyDuelData);
        } else {
          console.error(`❌ [handleEndTurn] processDrawPhase retornou null`);
        }
        return;
      } else {
        // Draw Phase já foi processada automaticamente pelo advanceToNextTurn
        // Apenas emitir o duelo atualizado
      }

      // Se não está em DRAW, emitir normalmente
      const player1Field = (updatedDuel as any).player1Field;
      const player2Field = (updatedDuel as any).player2Field;
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
        turnTimeRemaining: turnTimeRemaining,
        turnStartedAt: (updatedDuel as any).turnStartedAt,
        player1Field: player1Field,
        player2Field: player2Field,
        pendingChoice: (updatedDuel as any).pendingChoice || null,
        createdAt: updatedDuel.createdAt,
        updatedAt: updatedDuel.updatedAt,
      };

      // Emitir atualização para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
    } catch (error) {
      console.error(`❌ [handleEndTurn] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao finalizar turno' });
    }
  }

  @SubscribeMessage('discardCard')
  async handleDiscardCard(
    @MessageBody() data: { duelId: number | string; userId?: number; cardId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      const cardId = data.cardId;

      if (!duelId || !userId || !cardId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se é o turno do jogador e está na fase END
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

      if (duel.currentPhase !== TurnPhase.END) {
        client.emit('duelError', { message: 'Só é possível descartar cartas na fase END' });
        return;
      }

      const player = isPlayer1 ? 1 : 2;
      const updatedDuel = await this.duelsService.discardSingleCard(duelId, player, cardId);

      if (!updatedDuel) {
        client.emit('duelError', { message: 'Erro ao descartar carta' });
        return;
      }

      // Verificar se após descartar ficou com 6 ou menos cartas na fase END
      // Se sim, avançar o turno automaticamente
      const playerField = player === 1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
      const hand = playerField?.hand || [];
      
      if (updatedDuel.currentPhase === TurnPhase.END && hand.length <= 6) {
        console.log(`✅ [handleDiscardCard] Player ${player} agora tem ${hand.length} cartas (≤6). Avançando turno automaticamente.`);
        
        // Avançar turno automaticamente
        const advanceResult = await this.duelsService.advanceToNextTurn(duelId);
        
        // Buscar duelo atualizado após avançar turno
        let finalDuel: any = advanceResult.duel;
        if (!finalDuel) {
          finalDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        }
        if (!finalDuel) {
          finalDuel = this.duelsService.findDuelByIdLight(duelId) || updatedDuel;
        }
        
        // Verificar se o próximo turno está em DRAW (pode já ter sido processado automaticamente pelo advanceToNextTurn)
        // Se ainda está em DRAW, processar. Se não, a Draw Phase já foi processada automaticamente.
        if (finalDuel.currentPhase === TurnPhase.DRAW) {
          console.log(`🔄 [handleDiscardCard] Processando fase DRAW automaticamente após avançar turno...`);
          
          // Processar fase DRAW (comprar carta automaticamente e avançar para próxima fase)
          const drawPhaseDuel = await this.duelsService.processDrawPhase(duelId);
          
          if (!drawPhaseDuel) {
            console.error(`❌ [handleDiscardCard] processDrawPhase retornou null`);
            // Continuar com o duelo que temos
          } else {
            finalDuel = drawPhaseDuel;
          }
        } else {
          // Draw Phase já foi processada automaticamente pelo advanceToNextTurn
          console.log(`✅ [handleDiscardCard] Draw Phase já foi processada automaticamente. Fase atual: ${finalDuel.currentPhase}`);
        }
        
        // Preparar dados atualizados com o novo turno
        const player1Field = (finalDuel as any).player1Field;
        const player2Field = (finalDuel as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(finalDuel);

        const duelData = {
          id: finalDuel.id,
          player1Id: finalDuel.player1Id,
          player2Id: finalDuel.player2Id,
          player1: (finalDuel as any).player1,
          player2: (finalDuel as any).player2,
          player1LifePoints: finalDuel.player1LifePoints,
          player2LifePoints: finalDuel.player2LifePoints,
          currentTurn: finalDuel.currentTurn,
          currentPhase: finalDuel.currentPhase || TurnPhase.STANDBY, // Usar a fase atual (BATTLE ou STANDBY)
          status: finalDuel.status,
          duelTime: (finalDuel as any).duelTime || 0,
          turnTime: (finalDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (finalDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (finalDuel as any).pendingChoice || null,
          createdAt: finalDuel.createdAt,
          updatedAt: finalDuel.updatedAt,
        };

        // Emitir atualização para todos na room do duelo
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        return;
      }

      // Se ainda tem mais de 6 cartas ou não está em END, apenas atualizar normalmente
      // Preparar dados atualizados
      const player1Field = (updatedDuel as any).player1Field;
      const player2Field = (updatedDuel as any).player2Field;
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
        currentPhase: updatedDuel.currentPhase || 'END',
        status: updatedDuel.status,
        duelTime: (updatedDuel as any).duelTime || 0,
        turnTime: (updatedDuel as any).turnTime || 90,
        turnTimeRemaining: turnTimeRemaining,
        turnStartedAt: (updatedDuel as any).turnStartedAt,
        player1Field: player1Field,
        player2Field: player2Field,
        pendingChoice: (updatedDuel as any).pendingChoice || null,
        createdAt: updatedDuel.createdAt,
        updatedAt: updatedDuel.updatedAt,
      };

      // Emitir atualização para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
    } catch (error) {
      console.error(`❌ [handleDiscardCard] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao descartar carta' });
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
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;

      if (!duelId || !userId) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se é o turno do oponente (não do jogador atual)
      // SEMPRE buscar do banco para garantir que temos o pendingChoice atualizado E o tempo real
      let duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
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

      // Calcular tempo restante REAL baseado no banco de dados
      const actualTurnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(duel);
      console.log(`⏰ [handleStealTurn] Tempo restante REAL no banco: ${actualTurnTimeRemaining}s (Turno atual: ${duel.currentTurn}, Quem está roubando: Player ${isPlayer1 ? 1 : 2})`);

      // Só permitir roubar turno se o tempo REALMENTE expirou no banco de dados
      if (actualTurnTimeRemaining > 0) {
        console.log(`❌ [handleStealTurn] Tempo não expirou no banco. Restam ${actualTurnTimeRemaining}s`);
        client.emit('duelError', { 
          message: `O turno do oponente ainda não expirou. Restam ${actualTurnTimeRemaining} segundos.`,
          turnTimeRemaining: actualTurnTimeRemaining 
        });
        return;
      }

      console.log(`✅ [handleStealTurn] Validações passaram. Tempo expirou (${actualTurnTimeRemaining}s) e é o turno do oponente. Processando roubo de turno...`);

      // Descobrir qual jogador está perdendo o turno (o oponente de quem está roubando)
      const opponentPlayer = isPlayer1 ? 2 : 1;
      const playerLosingTurn = isPlayer1 ? duel.player2Id : duel.player1Id; // Jogador que está PERDENDO o turno
      
      console.log(`🔍 [handleStealTurn] ==========================================`);
      console.log(`🔍 [handleStealTurn] Turno sendo roubado!`);
      console.log(`🔍 [handleStealTurn] Quem está roubando (userId): ${numericUserId}`);
      console.log(`🔍 [handleStealTurn] Quem está perdendo o turno (playerLosingTurn): ${playerLosingTurn}`);
      console.log(`🔍 [handleStealTurn] pendingChoice no duelo:`, (duel as any).pendingChoice);
      
      // Verificar se há escolha pendente do jogador que está PERDENDO o turno
      // Se houver, fazer escolha automática ANTES de mudar o turno
      if ((duel as any).pendingChoice) {
        const pendingChoice = (duel as any).pendingChoice;
        // Converter ambos para número para garantir comparação correta
        const pendingChoiceUserId = typeof pendingChoice.userId === 'string' ? parseInt(pendingChoice.userId, 10) : Number(pendingChoice.userId);
        const playerLosingTurnNum = typeof playerLosingTurn === 'string' ? parseInt(playerLosingTurn, 10) : Number(playerLosingTurn);
        
        console.log(`🔍 [handleStealTurn] Escolha pendente encontrada:`, {
          type: pendingChoice.type,
          pendingChoiceUserId: pendingChoice.userId,
          pendingChoiceUserIdNum: pendingChoiceUserId,
          playerLosingTurn: playerLosingTurn,
          playerLosingTurnNum: playerLosingTurnNum,
          match: pendingChoiceUserId === playerLosingTurnNum,
          turnWhenStarted: pendingChoice.turnWhenStarted,
          currentTurn: duel.currentTurn
        });
        
        // Verificar se a escolha pendente é do jogador que está PERDENDO o turno
        if (pendingChoiceUserId === playerLosingTurnNum) {
          console.log(`⚠️ [handleStealTurn] ⚠️ TURNO SENDO ROUBADO - FECHANDO MODAL E PROCESSANDO ESCOLHA AUTOMÁTICA ⚠️`);
          console.log(`⚠️ [handleStealTurn] Jogador ${playerLosingTurn} tem escolha pendente (${pendingChoice.type}) e está perdendo o turno`);
          
          // 1. Primeiro, emitir evento para fechar o modal no frontend IMEDIATAMENTE
          console.log(`🔒 [handleStealTurn] Emitindo evento para fechar modal do jogador ${playerLosingTurn}`);
          const closeModalEvent = { 
            duelId, 
            userId: playerLosingTurn,
            reason: 'turn_stolen' 
          };
          console.log(`🔒 [handleStealTurn] Evento closePendingChoiceModal:`, closeModalEvent);
          
          // Emitir para a sala do duelo
          this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', closeModalEvent);
          
          // Também emitir diretamente para o cliente que está perdendo o turno (se estiver conectado)
          const losingTurnClient = Array.from(this.server.sockets.sockets.values()).find(
            (socket: any) => socket.data?.userId === playerLosingTurn
          );
          if (losingTurnClient) {
            console.log(`🔒 [handleStealTurn] Emitindo evento diretamente para o cliente do jogador ${playerLosingTurn}`);
            losingTurnClient.emit('closePendingChoiceModal', closeModalEvent);
          } else {
            console.log(`⚠️ [handleStealTurn] Cliente do jogador ${playerLosingTurn} não encontrado na lista de sockets`);
          }
          
          // 2. Depois fazer escolha automática (isso já emite duelUpdate com pendingChoice: null)
          await this.handleAutoChoice(duelId, playerLosingTurn, pendingChoice);
          
          // Pequeno delay para garantir que o duelUpdate seja processado antes de continuar
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Buscar duelo atualizado após a escolha automática
          duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          if (!duel) {
            client.emit('duelError', { message: 'Erro ao buscar duelo após escolha automática' });
            return;
          }
          console.log(`✅ [handleStealTurn] Escolha automática processada, continuando com roubo de turno`);
        } else {
          console.log(`ℹ️ [handleStealTurn] Escolha pendente não é do jogador que está perdendo o turno`);
          console.log(`ℹ️ [handleStealTurn] pendingChoice.userId (${pendingChoice.userId}) !== playerLosingTurn (${playerLosingTurn})`);
        }
      } else {
        console.log(`ℹ️ [handleStealTurn] Nenhuma escolha pendente encontrada no duelo`);
      }
      console.log(`🔍 [handleStealTurn] ==========================================`);
      
      // Descartar cartas aleatoriamente do oponente se ele tiver mais de 6 cartas na mão
      // O método discardCards já verifica se tem mais de 6 cartas antes de descartar
      const updatedDuelAfterDiscard = await this.duelsService.discardCards(duelId, opponentPlayer, undefined, true);
      
      // Buscar o duelo atualizado após o descarte
      let duelAfterDiscard = updatedDuelAfterDiscard || this.duelsService.findDuelByIdLight(duelId);
      if (!duelAfterDiscard) {
        duelAfterDiscard = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (!duelAfterDiscard) {
          client.emit('duelError', { message: 'Erro ao atualizar duelo após descarte' });
          return;
        }
      }

      // Trocar turno (roubar o turno do oponente)
      // Resetar flag de invocação normal e mudança de posição para ambos os jogadores ao mudar de turno
      if ((duelAfterDiscard as any).player1Field) {
        (duelAfterDiscard as any).player1Field.normalSummonUsed = false;
        // Resetar flags de mudança de posição e ataque de cada monstro
        if ((duelAfterDiscard as any).player1Field.monsters && Array.isArray((duelAfterDiscard as any).player1Field.monsters)) {
          (duelAfterDiscard as any).player1Field.monsters.forEach((monster: any) => {
            if (monster) {
              monster.positionChangedThisTurn = false;
              monster.attackedThisTurn = false;
            }
          });
        }
      }
      if ((duelAfterDiscard as any).player2Field) {
        (duelAfterDiscard as any).player2Field.normalSummonUsed = false;
        // Resetar flags de mudança de posição e ataque de cada monstro
        if ((duelAfterDiscard as any).player2Field.monsters && Array.isArray((duelAfterDiscard as any).player2Field.monsters)) {
          (duelAfterDiscard as any).player2Field.monsters.forEach((monster: any) => {
            if (monster) {
              monster.positionChangedThisTurn = false;
              monster.attackedThisTurn = false;
            }
          });
        }
      }
      
      const newTurn = duelAfterDiscard.currentTurn === 1 ? 2 : 1;
      duelAfterDiscard.currentTurn = newTurn;
      duelAfterDiscard.currentPhase = TurnPhase.DRAW; // Resetar para fase inicial (DP)
      (duelAfterDiscard as any).turnTime = 90; // Resetar tempo do turno
      const turnStartedAt = new Date();
      (duelAfterDiscard as any).turnStartedAt = turnStartedAt; // Resetar timestamp do turno

      // Atualizar no banco ANTES de processar a fase DRAW
      await this.duelsService.updateDuelInDatabase(duelId, {
        currentTurn: newTurn,
        currentPhase: TurnPhase.DRAW,
        turnTime: 90,
        turnStartedAt: turnStartedAt,
        player1Field: (duelAfterDiscard as any).player1Field,
        player2Field: (duelAfterDiscard as any).player2Field,
      } as any);

      // Emitir atualização imediatamente para mostrar "Draw Phase" na tela
      const player1Field = (duelAfterDiscard as any).player1Field;
      const player2Field = (duelAfterDiscard as any).player2Field;
      const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(duelAfterDiscard);

      // Buscar duelo atualizado para garantir que temos o pendingChoice correto (deve ser null após escolha automática)
      const updatedDuelForPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
      const currentPendingChoice = updatedDuelForPendingChoice ? (updatedDuelForPendingChoice as any).pendingChoice : null;
      
      const drawPhaseDuelData = {
        id: duelAfterDiscard.id,
        player1Id: duelAfterDiscard.player1Id,
        player2Id: duelAfterDiscard.player2Id,
        player1: (duelAfterDiscard as any).player1,
        player2: (duelAfterDiscard as any).player2,
        player1LifePoints: duelAfterDiscard.player1LifePoints,
        player2LifePoints: duelAfterDiscard.player2LifePoints,
        currentTurn: newTurn,
        currentPhase: TurnPhase.DRAW, // Mostrar fase DRAW
        status: duelAfterDiscard.status,
        duelTime: (duelAfterDiscard as any).duelTime || 0,
        turnTime: 90,
        turnTimeRemaining: turnTimeRemaining,
        turnStartedAt: turnStartedAt,
        player1Field: player1Field,
        player2Field: player2Field,
        pendingChoice: currentPendingChoice, // Incluir pendingChoice atualizado (deve ser null após escolha automática)
        createdAt: duelAfterDiscard.createdAt,
        updatedAt: duelAfterDiscard.updatedAt,
      };

      // Emitir atualização para mostrar "Draw Phase" antes de processar
      this.server.to(`duel_${duelId}`).emit('duelUpdate', drawPhaseDuelData);

      // Processar fase DRAW automaticamente (comprar carta e avançar para próxima fase)
      // Pequeno delay para o frontend mostrar "Draw Phase" antes de processar
      await new Promise(resolve => setTimeout(resolve, 400));
      await this.duelsService.processDrawPhase(duelId);

      // Buscar o duelo atualizado após processar a fase DRAW
      // SEMPRE buscar do banco para garantir pendingChoice atualizado
      let finalDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
      if (!finalDuel) {
        client.emit('duelError', { message: 'Erro ao atualizar duelo após processar fase' });
        return;
      }

      // Atualizar no banco de dados com os dados finais
      await this.duelsService.updateDuelInDatabase(duelId, {
        currentTurn: finalDuel.currentTurn,
        currentPhase: finalDuel.currentPhase,
        turnTime: 90,
        turnStartedAt: turnStartedAt,
        player1Field: (finalDuel as any).player1Field,
        player2Field: (finalDuel as any).player2Field,
      } as any);

      // Preparar dados atualizados - SEMPRE player1Field do player1 e player2Field do player2
      const finalPlayer1Field = (finalDuel as any).player1Field;
      const finalPlayer2Field = (finalDuel as any).player2Field;

      // Calcular tempo restante do turno
      const finalTurnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(finalDuel);

      const duelData = {
        id: finalDuel.id,
        player1Id: finalDuel.player1Id,
        player2Id: finalDuel.player2Id,
        player1: (finalDuel as any).player1,
        player2: (finalDuel as any).player2,
        player1LifePoints: finalDuel.player1LifePoints,
        player2LifePoints: finalDuel.player2LifePoints,
        currentTurn: finalDuel.currentTurn,
        currentPhase: finalDuel.currentPhase || 'DRAW',
        status: finalDuel.status,
        duelTime: (finalDuel as any).duelTime || 0,
        turnTime: (finalDuel as any).turnTime || 90,
        turnTimeRemaining: finalTurnTimeRemaining, // Tempo restante calculado
        turnStartedAt: (finalDuel as any).turnStartedAt, // Timestamp de quando o turno começou
        player1Field: finalPlayer1Field, // SEMPRE do player1
        player2Field: finalPlayer2Field, // SEMPRE do player2
        pendingChoice: (finalDuel as any).pendingChoice || null,
        createdAt: finalDuel.createdAt,
        updatedAt: finalDuel.updatedAt,
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
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const timeInSeconds = data.timeInSeconds;
      // Segurança: usar APENAS o userId do JWT. Só jogadores do duelo podem atualizar o tempo.
      const userId = client.data.userId;

      if (!duelId || timeInSeconds === undefined || !userId) {
        return;
      }

      const duel = this.duelsService.findDuelByIdLight(duelId) ?? await this.duelsService.findDuelByIdFromDatabase(duelId);
      if (!duel) return;

      const numericUserId = Number(userId);
      const isPlayer = duel.player1Id === numericUserId || duel.player2Id === numericUserId;
      if (!isPlayer) {
        return; // Não é jogador deste duelo — ignorar silenciosamente
      }

      this.duelsService.updateDuelTime(duelId, timeInSeconds).catch((error) => {
        console.error(`❌ [handleUpdateDuelTime] Erro ao atualizar tempo:`, error);
      });
    } catch (error) {
      // Silenciosamente ignorar erros
    }
  }

  @SubscribeMessage('duelAction')
  async handleDuelAction(
    @MessageBody() data: { duelId: number | string; userId?: number; actionType: string; actionData?: any },
    @ConnectedSocket() client: Socket,
  ) {
    // Declarar variáveis fora do try para que estejam acessíveis no catch
    const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
    // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
    const userId = client.data.userId;
    const actionType = data.actionType;
    const actionData = data.actionData || {};
    
    try {

      if (!duelId || !userId || !actionType) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se há escolha pendente e bloquear outras ações (exceto a própria escolha)
      // IMPORTANTE: Buscar do banco ignorando cache para ter dados atualizados
      const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
      if (duel && (duel as any).pendingChoice) {
        const pendingChoice = (duel as any).pendingChoice;
        
        // Verificar se o pendingChoice é válido (não é null ou undefined)
        if (pendingChoice && pendingChoice !== null && pendingChoice !== undefined) {
          // Ações que podem ser executadas mesmo com pendingChoice ativo
        const isAllowedChoiceAction = actionType === 'CONFISCATION_CHOICE' ||
                                         actionType === 'GRACEFUL_CHARITY_CHOICE' ||
                                      actionType === 'FORCEFUL_SENTRY_CHOICE' ||
                                      actionType === 'UNITED_WE_STAND_CHOICE' ||
                                      actionType === 'MAGE_POWER_CHOICE' ||
                                      actionType === 'MYSTICAL_SPACE_TYPHOON_CHOICE' ||
                                      actionType === 'SOUL_TAKER_CHOICE' ||
                                      actionType === 'LIGHTNING_STORM_CHOICE' ||
                                      actionType === 'SNOWMAN_EATER_CHOICE' ||
                                      actionType === 'CHAOS_SORCERER_CHOICE' ||
                                      actionType === 'CHANGE_OF_HEART_CHOICE' ||
                                      actionType === 'BRAIN_CONTROL_CHOICE' ||
                                      actionType === 'MONSTER_REBORN_CHOICE' ||
                                      actionType === 'PREMATURE_BURIAL_CHOICE' ||
                                      actionType === 'AUTONOMOUS_ACTION_UNIT_CHOICE' ||
                                      actionType === 'LAST_WILL_CHOICE' ||
                                      actionType === 'MONSTER_REINCARNATION_DISCARD_CHOICE' ||
                                      actionType === 'MONSTER_REINCARNATION_GRAVEYARD_CHOICE' ||
                                      actionType === 'CANCEL_CARD_ACTIVATION' ||
                                      actionType === 'BREAKER_REMOVE_COUNTER';
          
          // Se há escolha pendente e não é uma ação de escolha permitida, bloquear
          if (!isAllowedChoiceAction && pendingChoice.userId === userId) {
            client.emit('duelError', { 
              message: 'Você precisa completar a escolha pendente antes de fazer outras ações',
              pendingChoice: pendingChoice
            });
            return;
          }
          
          // Se o turno mudou desde que a escolha foi iniciada, fechar modal primeiro e depois fazer escolha automática
          if (pendingChoice.userId === userId && 
              (duel.currentTurn !== pendingChoice.turnWhenStarted || 
               duel.currentPhase !== pendingChoice.phaseWhenStarted)) {
            console.log(`⚠️ [handleDuelAction] Turno mudou durante escolha pendente - fechando modal e fazendo escolha automática`);
            
            // 1. Primeiro, emitir evento para fechar o modal no frontend
            client.emit('closePendingChoiceModal', { duelId, reason: 'turn_changed' });
            // Também emitir para a room inteira caso o jogador tenha múltiplas abas
            this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { duelId, reason: 'turn_changed' });
            
            // 2. Depois fazer escolha automática
            await this.handleAutoChoice(duelId, userId, pendingChoice);
            return;
          }
        } else {
          // PendingChoice inválido - limpar do banco e continuar normalmente
          console.log(`ℹ️ [handleDuelAction] PendingChoice encontrado mas é inválido (null/undefined) - limpando e continuando`);
          await this.duelsService.clearPendingChoice(duelId, false);
        }
      }

      // Processar ação de invocação normal de monstro
      if (actionType === 'SUMMON_MONSTER') {
        const { cardId, zoneIndex, position, tributeZoneIndices } = actionData;
        
        if (!cardId || zoneIndex === undefined || !position) {
          client.emit('duelError', { message: 'Dados da invocação inválidos' });
          return;
        }

        const result = await this.duelsService.normalSummonMonster(duelId, userId, cardId, zoneIndex, position, tributeZoneIndices);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao invocar monstro' });
          return;
        }

        // Criar log de ação
        const positionText = position === 'attack' ? 'Ataque' : position === 'set' ? 'Set (face-down)' : 'Defesa';
        await this.createAndEmitDuelLog(duelId, userId, 'SUMMON_MONSTER', `Invocou um monstro em ${positionText}`);

        // Buscar duelo atualizado para enviar atualização
        let updatedDuel = this.duelsService.findDuelByIdLight(duelId);
        if (!updatedDuel) {
          updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
          if (!updatedDuel) {
            client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
            return;
          }
        }

        // Se está em STANDBY, mudar automaticamente para MAIN1
        if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
          updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
          if (!updatedDuel) {
            client.emit('duelError', { message: 'Erro ao mudar para fase MAIN1' });
            return;
          }
        }

        // Preparar dados atualizados
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };

        // Emitir atualização para todos na room do duelo
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'SPECIAL_SUMMON_CYBER_DRAGON') {
        const { cardId, zoneIndex, position } = actionData;

        if (!cardId || zoneIndex === undefined || !position) {
          client.emit('duelError', { message: 'Dados da invocação especial inválidos' });
          return;
        }

        const result = await this.duelsService.specialSummonCyberDragon(duelId, userId, cardId, zoneIndex, position);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao invocar Cyber Dragon' });
          return;
        }

        // Criar log de ação
        const positionText = position === 'attack' ? 'Ataque' : 'Defesa';
        await this.createAndEmitDuelLog(duelId, userId, 'SPECIAL_SUMMON_CYBER_DRAGON', `Invocou Cyber Dragon por invocação especial em ${positionText}`);

        // Buscar duelo atualizado para enviar atualização
        let updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          // Se está em STANDBY, mudar automaticamente para MAIN1
          if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
            updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
            if (!updatedDuel) {
              client.emit('duelError', { message: 'Erro ao mudar para fase MAIN1' });
              return;
            }
          }

          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_CHAOS_SORCERER_SUMMON') {
        // Iniciar invocação especial do ChaosSorcerer
        const { cardId } = actionData;

        if (!cardId) {
          client.emit('duelError', { message: 'ID da carta não fornecido' });
          return;
        }

        const result = await this.duelsService.startChaosSorcererSpecialSummon(duelId, userId, cardId);

        if (!result.success) {
          console.log(`❌ [DuelsGateway] Erro ao iniciar invocação especial do ChaosSorcerer: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao iniciar invocação especial do ChaosSorcerer' });
          return;
        }

        console.log(`✅ [DuelsGateway] startChaosSorcererSpecialSummon bem-sucedido, emitindo evento ao frontend...`);

        // Emitir evento direto ao frontend para mostrar modal
        client.emit('chaosSorcererSummonShowMonsters', {
          duelId,
          data: result.data,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'CHAOS_SORCERER_SUMMON_CHOICE') {
        // Processar escolha de monstros para invocação especial do ChaosSorcerer
        const { 
          lightMonsterIndex, 
          darkMonsterIndex, 
          lightMonsterInstanceId,
          darkMonsterInstanceId,
          lightMonsterGraveyardIndex,
          darkMonsterGraveyardIndex,
          zoneIndex, 
          position 
        } = actionData;

        if (lightMonsterIndex === undefined || darkMonsterIndex === undefined || 
            zoneIndex === undefined || !position) {
          client.emit('duelError', { message: 'Dados de invocação inválidos' });
          return;
        }

        // Obter cardId dos dados da ação
        const { cardId } = actionData;
        if (!cardId) {
          client.emit('duelError', { message: 'ID da carta não fornecido' });
          return;
        }

        console.log(`🔍 [DuelsGateway] Processando CHAOS_SORCERER_SUMMON_CHOICE:`, {
          duelId,
          userId,
          cardId,
          lightMonsterIndex,
          darkMonsterIndex,
          lightMonsterInstanceId,
          darkMonsterInstanceId,
          lightMonsterGraveyardIndex,
          darkMonsterGraveyardIndex,
          zoneIndex,
          position
        });

        const result = await this.duelsService.specialSummonChaosSorcerer(
          duelId, 
          userId, 
          cardId, 
          lightMonsterIndex, 
          darkMonsterIndex, 
          zoneIndex, 
          position,
          lightMonsterInstanceId,
          darkMonsterInstanceId,
          lightMonsterGraveyardIndex,
          darkMonsterGraveyardIndex
        );

        console.log(`🔍 [DuelsGateway] Resultado de specialSummonChaosSorcerer:`, result);

        if (!result.success) {
          console.log(`❌ [DuelsGateway] Erro ao invocar ChaosSorcerer: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao invocar ChaosSorcerer' });
          return;
        }

        console.log(`✅ [DuelsGateway] ChaosSorcerer invocado com sucesso`);

        // Criar log de ação
        const positionText = position === 'attack' ? 'Ataque' : 'Defesa';
        await this.createAndEmitDuelLog(duelId, userId, 'SPECIAL_SUMMON_CHAOS_SORCERER', `Invocou ChaosSorcerer por invocação especial em ${positionText}`);

        console.log(`🔍 [DuelsGateway] Buscando duelo atualizado após invocação...`);

        // Buscar duelo atualizado
        const updatedDuelAfterChaosSummon = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuelAfterChaosSummon) {
          console.log(`✅ [DuelsGateway] Duelo atualizado encontrado, emitindo duelUpdate...`);
          const player1Field = (updatedDuelAfterChaosSummon as any).player1Field;
          const player2Field = (updatedDuelAfterChaosSummon as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterChaosSummon);

          const duelData = {
            id: updatedDuelAfterChaosSummon.id,
            player1Id: updatedDuelAfterChaosSummon.player1Id,
            player2Id: updatedDuelAfterChaosSummon.player2Id,
            player1: (updatedDuelAfterChaosSummon as any).player1 || null,
            player2: (updatedDuelAfterChaosSummon as any).player2 || null,
            player1LifePoints: updatedDuelAfterChaosSummon.player1LifePoints,
            player2LifePoints: updatedDuelAfterChaosSummon.player2LifePoints,
            currentTurn: updatedDuelAfterChaosSummon.currentTurn,
            currentPhase: updatedDuelAfterChaosSummon.currentPhase,
            status: updatedDuelAfterChaosSummon.status,
            turnCounter: updatedDuelAfterChaosSummon.turnCounter || 1,
            duelTime: (updatedDuelAfterChaosSummon as any).duelTime || 0,
            turnTime: (updatedDuelAfterChaosSummon as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuelAfterChaosSummon as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuelAfterChaosSummon as any).pendingChoice || null,
            createdAt: updatedDuelAfterChaosSummon.createdAt,
            updatedAt: updatedDuelAfterChaosSummon.updatedAt,
          };

          console.log(`📤 [DuelsGateway] Emitindo duelUpdate após invocação do ChaosSorcerer...`);
          console.log(`🔍 [DuelsGateway] Verificando se o monstro está no campo:`, {
            isPlayer1: Number(updatedDuelAfterChaosSummon.player1Id) === Number(userId),
            zoneIndex,
            player1Monsters: player1Field?.monsters?.map((m: any, idx: number) => ({
              index: idx,
              hasMonster: !!m,
              name: m?.name || m?.cardName
            })),
            player2Monsters: player2Field?.monsters?.map((m: any, idx: number) => ({
              index: idx,
              hasMonster: !!m,
              name: m?.name || m?.cardName
            }))
          });

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
          console.log(`✅ [DuelsGateway] duelUpdate emitido com sucesso!`);
        } else {
          console.log(`❌ [DuelsGateway] Duelo não encontrado após invocação do ChaosSorcerer!`);
        }
      } else if (actionType === 'START_CHAOS_SORCERER_EFFECT') {
        // Iniciar efeito do ChaosSorcerer
        const { monsterZoneIndex } = actionData;

        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }

        const result = await this.duelsService.startChaosSorcererEffect(duelId, userId, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar efeito do ChaosSorcerer' });
          return;
        }

        // Buscar duelo atualizado antes de coletar monstros
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        // Coletar monstros face-up do campo para o modal
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
        const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
        const playerField = isPlayer1 ? player1Field : player2Field;
        const opponentField = isPlayer1 ? player2Field : player1Field;
        
        const availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];
        
        // Coletar monstros do próprio campo
        if (playerField && playerField.monsters && Array.isArray(playerField.monsters)) {
          playerField.monsters.forEach((monster: any, index: number) => {
            if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
              availableMonsters.push({ monster, zoneIndex: index, player: 'player' });
            }
          });
        }
        
        // Coletar monstros do campo do oponente
        if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
          opponentField.monsters.forEach((monster: any, index: number) => {
            if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
              availableMonsters.push({ monster, zoneIndex: index, player: 'opponent' });
            }
          });
        }

        // Emitir evento direto ao frontend para mostrar seleção de alvo
        client.emit('chaosSorcererEffectShowTargets', {
          duelId,
          availableMonsters: availableMonsters,
          data: result.data,
        });
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_CYBER_STEIN_EFFECT') {
        // Iniciar efeito do Cyber-Stein
        const { monsterZoneIndex } = actionData;

        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }

        const result = await this.duelsService.startCyberSteinEffect(duelId, userId, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar efeito do Cyber-Stein' });
          return;
        }

        // Emitir evento direto ao frontend para mostrar seleção do Extra Deck
        client.emit('cyberSteinEffectShowExtraDeck', {
          duelId,
          data: result.data,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_DARK_ARMED_DRAGON_SUMMON') {
        // Iniciar invocação especial do Dark Armed Dragon
        const { cardId } = actionData;

        if (!cardId) {
          client.emit('duelError', { message: 'ID da carta não fornecido' });
          return;
        }

        const result = await this.duelsService.startDarkArmedDragonSpecialSummon(duelId, userId, cardId);

        if (!result.success) {
          console.log(`❌ [DuelsGateway] Erro ao iniciar invocação especial do Dark Armed Dragon: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao iniciar invocação especial' });
          return;
        }

        // Emitir evento direto ao frontend para mostrar seleção de zona
        client.emit('darkArmedDragonSummonShowZones', {
          duelId,
          data: result.data,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'DARK_ARMED_DRAGON_SUMMON_CHOICE') {
        // Processar invocação especial do Dark Armed Dragon
        const { cardId, zoneIndex } = actionData;

        if (!cardId || zoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados da invocação inválidos' });
          return;
        }

        const result = await this.duelsService.specialSummonDarkArmedDragon(duelId, userId, cardId, zoneIndex);

        if (!result.success) {
          console.log(`❌ [DuelsGateway] Erro ao invocar Dark Armed Dragon: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao invocar' });
          return;
        }

        await this.createAndEmitDuelLog(duelId, userId, 'SPECIAL_SUMMON_DARK_ARMED_DRAGON', `Invocou Dark Armed Dragon por invocação especial em modo de ataque`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_DARK_ARMED_DRAGON_EFFECT') {
        // Iniciar efeito do Dark Armed Dragon
        const { monsterZoneIndex } = actionData;

        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }

        const result = await this.duelsService.startDarkArmedDragonEffect(duelId, userId, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar efeito do Dark Armed Dragon' });
          return;
        }

        // Emitir evento direto ao frontend para mostrar modal de seleção
        client.emit('darkArmedDragonEffectShowModal', {
          duelId,
          data: result.data,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'DARK_ARMED_DRAGON_EFFECT_CHOICE') {
        // Processar escolha do efeito do Dark Armed Dragon
        const { monsterZoneIndex, darkGraveyardIndex, targetPlayer, targetType, targetZoneIndex } = actionData;

        if (monsterZoneIndex === undefined || darkGraveyardIndex === undefined || !targetPlayer || !targetType || targetZoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados do efeito inválidos' });
          return;
        }

        const result = await this.duelsService.processDarkArmedDragonEffect(duelId, userId, monsterZoneIndex, darkGraveyardIndex, targetPlayer, targetType, targetZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar efeito do Dark Armed Dragon' });
          return;
        }

        await this.createAndEmitDuelLog(duelId, userId, 'DARK_ARMED_DRAGON_EFFECT', `Dark Armed Dragon baniu um monstro Dark e destruiu uma carta`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_BLS_EFFECT') {
        const { monsterZoneIndex } = actionData;
        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }
        const result = await this.duelsService.startBlackLusterSoldierEffect(duelId, userId, monsterZoneIndex);
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar efeito do Black Luster Soldier' });
          return;
        }
        client.emit('blsEffectShowTargets', { duelId, data: result.data });
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: this.duelsService.calculateTurnTimeRemaining(updatedDuel),
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: (updatedDuel as any).player1Field,
            player2Field: (updatedDuel as any).player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'BLS_EFFECT_CHOICE') {
        const { monsterZoneIndex, effectNumber, targetPlayer, targetZoneIndex } = actionData;
        if (monsterZoneIndex === undefined || effectNumber === undefined) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }
        const result = await this.duelsService.processBlackLusterSoldierEffect(
          duelId,
          userId,
          monsterZoneIndex,
          effectNumber as 1 | 2,
          targetPlayer,
          targetZoneIndex,
        );
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar efeito do BLS' });
          return;
        }
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: this.duelsService.calculateTurnTimeRemaining(updatedDuel),
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: (updatedDuel as any).player1Field,
            player2Field: (updatedDuel as any).player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'CHAOS_SORCERER_EFFECT_CHOICE') {
        // Processar escolha de alvo do efeito do ChaosSorcerer
        const { monsterZoneIndex, targetPlayer, targetZoneIndex } = actionData;

        if (monsterZoneIndex === undefined || targetPlayer === undefined || targetZoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }

        const result = await this.duelsService.processChaosSorcererEffect(duelId, userId, monsterZoneIndex, targetPlayer, targetZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar efeito do ChaosSorcerer' });
          return;
        }

        // Criar log de ação
        await this.createAndEmitDuelLog(duelId, userId, 'CHAOS_SORCERER_EFFECT', `ChaosSorcerer baniu um monstro face-up`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'ACTIVATE_CHAOS_EMPEROR_DRAGON_EFFECT') {
        // Ativar efeito do Chaos Emperor Dragon (descartar todas as cartas e causar dano)
        const { monsterZoneIndex } = actionData;

        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }

        const result = await this.duelsService.processChaosEmperorDragonEffect(duelId, userId, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao ativar efeito do Chaos Emperor Dragon' });
          return;
        }

        // Criar log de ação
        await this.createAndEmitDuelLog(duelId, userId, 'CHAOS_EMPEROR_DRAGON_EFFECT', `Chaos Emperor Dragon descartou todas as cartas e causou ${result.damage || 0} de dano`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_EXILED_FORCE_EFFECT') {
        // Iniciar efeito do Exiled Force
        const { monsterZoneIndex } = actionData;

        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }

        const result = await this.duelsService.startExiledForceEffect(duelId, userId, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar efeito do Exiled Force' });
          return;
        }

        // Emitir evento direto ao frontend para mostrar seleção de alvo
        client.emit('exiledForceShowTargets', {
          duelId,
          availableMonsters: result.data?.availableMonsters || [],
          monsterZoneIndex: result.data?.monsterZoneIndex,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'EXILED_FORCE_CHOICE') {
        // Processar escolha do Exiled Force
        const { monsterZoneIndex, targetPlayer, targetZoneIndex } = actionData;

        if (monsterZoneIndex === undefined || targetPlayer === undefined || targetZoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }

        const result = await this.duelsService.processExiledForceChoice(duelId, userId, monsterZoneIndex, targetPlayer, targetZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar efeito do Exiled Force' });
          return;
        }

        // Criar log de ação
        await this.createAndEmitDuelLog(duelId, userId, 'EXILED_FORCE_EFFECT', `Exiled Force foi tributado e destruiu um monstro`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON') {
        // Iniciar invocação especial do Red-Eyes Darkness Metal Dragon
        const { cardId } = actionData;

        if (!cardId) {
          client.emit('duelError', { message: 'ID da carta não fornecido' });
          return;
        }

        const result = await this.duelsService.startRedEyesDarknessMetalDragonSpecialSummon(duelId, userId, cardId);

        if (!result.success) {
          console.log(`❌ [DuelsGateway] Erro ao iniciar invocação especial do Red-Eyes Darkness Metal Dragon: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao iniciar invocação especial' });
          return;
        }

        // Emitir evento direto ao frontend para mostrar seleção de dragão
        client.emit('redEyesDarknessMetalDragonSummonShowDragons', {
          duelId,
          data: result.data,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'RED_EYES_DARKNESS_METAL_DRAGON_SUMMON_CHOICE') {
        // Processar escolha de dragão para invocação especial
        const { cardId, dragonZoneIndex, zoneIndex, position } = actionData;

        if (!cardId || dragonZoneIndex === undefined || zoneIndex === undefined || !position) {
          client.emit('duelError', { message: 'Dados da invocação inválidos' });
          return;
        }

        const result = await this.duelsService.specialSummonRedEyesDarknessMetalDragon(duelId, userId, cardId, dragonZoneIndex, zoneIndex, position);

        if (!result.success) {
          console.log(`❌ [DuelsGateway] Erro ao invocar Red-Eyes Darkness Metal Dragon: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao invocar' });
          return;
        }

        const positionText = position === 'attack' ? 'Ataque' : 'Defesa';
        await this.createAndEmitDuelLog(duelId, userId, 'SPECIAL_SUMMON_RED_EYES_DARKNESS_METAL_DRAGON', `Invocou Red-Eyes Darkness Metal Dragon por invocação especial em ${positionText}`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);
          
          // Verificar se o monstro está no campo antes de emitir
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? player1Field : player2Field;
          const summonedMonster = playerField?.monsters?.[zoneIndex];
          
          console.log(`🔍 [DuelsGateway] Verificando invocação antes de emitir:`, {
            zoneIndex,
            hasMonster: !!summonedMonster,
            monsterName: summonedMonster?.name || summonedMonster?.cardName,
            position: summonedMonster?.position,
            isPlayer1,
            pendingChoice: updatedDuel.pendingChoice ? updatedDuel.pendingChoice.type : 'null'
          });

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: updatedDuel.pendingChoice || null, // Usar o valor do banco, não forçar null
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          console.log(`📤 [DuelsGateway] Emitindo duelUpdate após invocação especial do Red-Eyes Darkness Metal Dragon - pendingChoice: ${duelData.pendingChoice ? duelData.pendingChoice.type : 'null'}`);
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        } else {
          console.error(`❌ [DuelsGateway] Duelo não encontrado após invocação especial do Red-Eyes Darkness Metal Dragon`);
        }
      } else if (actionType === 'START_RED_EYES_DARKNESS_METAL_DRAGON_EFFECT') {
        // Iniciar efeito do Red-Eyes Darkness Metal Dragon
        const { monsterZoneIndex } = actionData;

        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do monstro não fornecida' });
          return;
        }

        const result = await this.duelsService.startRedEyesDarknessMetalDragonEffect(duelId, userId, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar efeito' });
          return;
        }

        // Emitir evento direto ao frontend para mostrar seleção de dragão
        client.emit('redEyesDarknessMetalDragonEffectShowDragons', {
          duelId,
          data: result.data,
        });

        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT_CHOICE') {
        // Processar escolha do efeito do Red-Eyes Darkness Metal Dragon
        const { monsterZoneIndex, source, cardIndex, zoneIndex, position } = actionData;

        if (monsterZoneIndex === undefined || !source || cardIndex === undefined || zoneIndex === undefined || !position) {
          client.emit('duelError', { message: 'Dados do efeito inválidos' });
          return;
        }

        const result = await this.duelsService.processRedEyesDarknessMetalDragonEffect(duelId, userId, monsterZoneIndex, source, cardIndex, zoneIndex, position);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar efeito' });
          return;
        }

        await this.createAndEmitDuelLog(duelId, userId, 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT', `Red-Eyes Darkness Metal Dragon invocou um dragão por invocação especial`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'CYBER_STEIN_EFFECT_CHOICE') {
        // Processar escolha do efeito do Cyber-Stein
        const { monsterZoneIndex, extraDeckIndex } = actionData;

        if (monsterZoneIndex === undefined || extraDeckIndex === undefined) {
          client.emit('duelError', { message: 'Dados do efeito inválidos' });
          return;
        }

        const result = await this.duelsService.processCyberSteinEffectChoice(duelId, userId, monsterZoneIndex, extraDeckIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar efeito do Cyber-Stein' });
          return;
        }

        await this.createAndEmitDuelLog(duelId, userId, 'CYBER_STEIN_EFFECT', `Cyber-Stein pagou 5000 LP e invocou um monstro do Extra Deck`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);

          const duelData = {
            id: updatedDuel.id,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            player1: (updatedDuel as any).player1 || null,
            player2: (updatedDuel as any).player2 || null,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            currentTurn: updatedDuel.currentTurn,
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'EQUIP_SPELL') {
        // Equipar spell equip diretamente da mão para um monstro
        const { cardId, monsterZoneIndex, spellTrapZoneIndex } = actionData;
        if (!cardId || monsterZoneIndex === undefined || spellTrapZoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados inválidos para equipar spell' });
          return;
        }

        const result = await this.duelsService.equipSpellFromHand(duelId, userId, cardId, monsterZoneIndex, spellTrapZoneIndex);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao equipar spell' });
          return;
        }

        // Buscar duelo atualizado
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };

        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'EQUIP_SPELL_FROM_FIELD') {
        // Equipar spell equip que já está no campo para um monstro
        const { spellTrapZoneIndex, monsterZoneIndex } = actionData;
        if (spellTrapZoneIndex === undefined || monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados inválidos para equipar spell do campo' });
          return;
        }

        const result = await this.duelsService.equipSpellFromField(duelId, userId, spellTrapZoneIndex, monsterZoneIndex);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao equipar spell do campo' });
          return;
        }

        // Buscar duelo atualizado
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };

        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'SET_MONSTER' || actionType === 'SET_SPELL_TRAP' || actionType === 'ACTIVATE_SPELL_TRAP') {
        // Colocar monstro, spell ou trap no campo
        const { cardId, zoneIndex, position } = actionData;
        // IMPORTANTE: Para ACTIVATE_SPELL_TRAP, zoneIndex pode ser undefined/null se a carta está na mão
        // e precisa de modal (como Mystical Space Typhoon) - a carta não vai para o campo
        if (!cardId) {
          client.emit('duelError', { message: 'Dados inválidos' });
          return;
        }
        if (actionType !== 'ACTIVATE_SPELL_TRAP' && zoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados inválidos' });
          return;
        }
        
        // Determinar o tipo da carta baseado na actionType
        let cardType: string | undefined;
        if (actionType === 'SET_MONSTER') {
          cardType = 'Monster';
        } else if (actionType === 'SET_SPELL_TRAP' || actionType === 'ACTIVATE_SPELL_TRAP') {
          // Buscar a carta para determinar se é Spell ou Trap
          // Primeiro verificar se a carta está no campo (para ativação de cartas já colocadas)
          // Forçar busca do banco para garantir dados atualizados
          const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          if (duel) {
            const isPlayer1 = duel.player1Id === userId;
            const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
            let card = null;
            let cardOnField = null; // Variável para armazenar a carta no campo (se existir)
            
            // Se for ACTIVATE_SPELL_TRAP, primeiro procurar no campo (carta já está lá)
            // IMPORTANTE: Só verificar no campo se zoneIndex é válido
            if (actionType === 'ACTIVATE_SPELL_TRAP' && playerField && playerField.spellTrap && 
                zoneIndex !== undefined && zoneIndex !== null && zoneIndex >= 0 && zoneIndex < 5) {
              // Garantir que spellTrap é um array válido
              if (!Array.isArray(playerField.spellTrap)) {
                playerField.spellTrap = [null, null, null, null, null];
              }
              while (playerField.spellTrap.length < 5) {
                playerField.spellTrap.push(null);
              }
              playerField.spellTrap = playerField.spellTrap.slice(0, 5);
              
              cardOnField = playerField.spellTrap[zoneIndex];
              if (cardOnField) {
                // Comparar por múltiplos identificadores e também por nome
                const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
                const cardOnFieldName = cardOnField.name || cardOnField.cardName;
                const requestedCardName = actionData.cardName;
                
                const isSameCardById = cardOnFieldId === cardId || 
                                      String(cardOnFieldId) === String(cardId) ||
                                      cardOnField.idCarta === cardId ||
                                      cardOnField.id === cardId ||
                                      cardOnField.cardId === cardId;
                
                const isSameCardByName = requestedCardName && cardOnFieldName && 
                                        (cardOnFieldName === requestedCardName ||
                                         cardOnFieldName.toLowerCase() === requestedCardName.toLowerCase());
                
                if ((isSameCardById || isSameCardByName) && cardOnField.position === 'set') {
                  card = cardOnField;
                  console.log(`🔍 [handleDuelAction] Carta encontrada no campo (para ativação):`, {
                    name: card.name || card.cardName,
                    idCarta: card.idCarta || card.id || card.cardId,
                    cardId: card.cardId,
                    position: card.position,
                    type: card.type,
                    cardType: card.cardType,
                    zoneIndex: zoneIndex,
                    requestedCardId: cardId,
                    requestedCardName: requestedCardName,
                    matchedById: isSameCardById,
                    matchedByName: isSameCardByName
                  });
                } else {
                  console.log(`⚠️ [handleDuelAction] Carta no campo não corresponde:`, {
                    zoneIndex: zoneIndex,
                    cardOnFieldId: cardOnFieldId,
                    cardOnFieldName: cardOnFieldName,
                    requestedCardId: cardId,
                    requestedCardName: requestedCardName,
                    cardOnFieldPosition: cardOnField.position,
                    isSameCardById: isSameCardById,
                    isSameCardByName: isSameCardByName
                  });
                }
              } else {
                console.log(`⚠️ [handleDuelAction] Nenhuma carta encontrada no zoneIndex ${zoneIndex}`);
              }
            }
            
            // Se não encontrou no campo, procurar na mão (carta sendo colocada pela primeira vez)
            if (!card && playerField && playerField.hand && Array.isArray(playerField.hand)) {
              console.log(`🔍 [handleDuelAction] Procurando carta na mão - cardId: ${cardId}, instanceId: ${actionData.instanceId}, handLength: ${playerField.hand.length}`);
              card = playerField.hand.find((c: any) => {
                if (!c) return false;
                
                // Se temos instanceId e a carta também tem, comparar por instanceId primeiro
                if (actionData.instanceId && c.instanceId) {
                  if (c.instanceId === actionData.instanceId) {
                    return true;
                  }
                }
                
                const cIdCarta = c.idCarta;
                const cId = c.id;
                const cCardId = c.cardId;
                const cName = (c.name || c.cardName || '').trim().toLowerCase();
                const searchName = actionData.cardName ? String(actionData.cardName).trim().toLowerCase() : '';
                
                // Comparar por nome primeiro (cartas com mesmo nome são tratadas como iguais)
                if (cName && searchName && cName === searchName) {
                  return true;
                }
                
                // Comparar por todos os identificadores possíveis
                const matchesById = cIdCarta === cardId || 
                                   cId === cardId || 
                                   cCardId === cardId ||
                                   String(cIdCarta) === String(cardId) ||
                                   String(cId) === String(cardId) ||
                                   String(cCardId) === String(cardId);
                
                return matchesById;
              });
              
              if (card) {
                console.log(`✅ [handleDuelAction] Carta encontrada na mão:`, {
                  name: card.name || card.cardName,
                  idCarta: card.idCarta,
                  id: card.id,
                  cardId: card.cardId,
                  type: card.type,
                  cardType: card.cardType,
                });
              } else {
                console.log(`⚠️ [handleDuelAction] Carta não encontrada na mão. IDs na mão:`, 
                  playerField.hand.map((c: any) => ({
                    name: c.name || c.cardName,
                    idCarta: c.idCarta,
                    id: c.id,
                    cardId: c.cardId
                  }))
                );
              }
            }
            
            if (card) {
              cardType = card.type === 'Spell' || card.cardType === 'Spell' ? 'Spell' : 'Trap';
              console.log(`✅ [handleDuelAction] Tipo da carta determinado: ${cardType}`);
              
              // Se cardOnField ainda não foi definido, verificar agora
              // IMPORTANTE: Só verificar se zoneIndex é válido
              if (!cardOnField && playerField && playerField.spellTrap && Array.isArray(playerField.spellTrap) &&
                  zoneIndex !== undefined && zoneIndex !== null && zoneIndex >= 0 && zoneIndex < 5) {
                // Garantir que spellTrap é um array válido
                if (!Array.isArray(playerField.spellTrap)) {
                  playerField.spellTrap = [null, null, null, null, null];
                }
                while (playerField.spellTrap.length < 5) {
                  playerField.spellTrap.push(null);
                }
                playerField.spellTrap = playerField.spellTrap.slice(0, 5);
                cardOnField = playerField.spellTrap[zoneIndex];
              }
              
              // REGRAS: Trap cards não podem ser ativadas manualmente
              // - Trap cards só podem ser colocadas em "set" no campo
              // - Trap cards não podem ser ativadas da mão
              // - Trap cards não podem ser ativadas manualmente do campo (só ativam automaticamente no turno do oponente)
              if (cardType === 'Trap' && actionType === 'ACTIVATE_SPELL_TRAP') {
                // Verificar se está tentando ativar da mão (card não está no campo ou não está em set)
                const isFromHand = !cardOnField || cardOnField.position !== 'set';
                if (isFromHand) {
                  client.emit('duelError', { message: 'Trap cards não podem ser ativadas da mão. Coloque-a no campo em posição "set".' });
                  return;
                }
                
                // Verificar se MirageDragon está bloqueando traps durante a Fase de Batalha
                // Buscar o duelo atualizado para verificar a fase
                const currentDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                if (currentDuel && currentDuel.currentPhase === TurnPhase.BATTLE) {
                  const player1IdNum = Number(currentDuel.player1Id);
                  const userIdNum = Number(userId);
                  const isPlayer1 = player1IdNum === userIdNum;
                  // Verificar se MirageDragon está no campo do oponente
                  const opponentField = isPlayer1 ? (currentDuel as any).player2Field : (currentDuel as any).player1Field;
                  if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
                    for (const monster of opponentField.monsters) {
                      if (monster && monster !== null) {
                        const monsterId = monster.idCarta || monster.id || monster.cardId;
                        const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                        const monsterPosition = monster.position || 'set';
                        
                        // MirageDragon deve estar face-up (attack ou defense)
                        if ((monsterPosition === 'attack' || monsterPosition === 'defense') &&
                            (monsterId === 'MirageDragon' ||
                             monsterId === 'miragedragon' ||
                             (typeof monsterId === 'string' && monsterId.toLowerCase().includes('miragedragon')) ||
                             monsterName === 'mirage dragon' ||
                             monsterName.includes('miragedragon'))) {
                          client.emit('duelError', { message: 'MirageDragon está no campo do oponente. Você não pode ativar Cards de Armadilha durante a Fase de Batalha.' });
                          return;
                        }
                      }
                    }
                  }
                }
                
                // Trap cards não podem ser ativadas manualmente do campo
                // Elas só ativam automaticamente no turno do oponente quando a condição é atendida
                client.emit('duelError', { message: 'Trap cards não podem ser ativadas manualmente. Elas só ativam automaticamente no turno do oponente quando a condição é atendida.' });
                return;
              }
              
              // REGRAS: Spell cards
              // - Spell cards podem ser ativadas da mão (ACTIVATE_SPELL_TRAP com position: 'face-up')
              // - Spell cards podem ser colocadas em "set" no campo (SET_SPELL_TRAP com position: 'set')
              // - Spell cards podem ser ativadas do campo se estiverem em "set" (ACTIVATE_SPELL_TRAP)
              if (cardType === 'Spell' && actionType === 'SET_SPELL_TRAP' && position === 'face-up') {
                // Se está tentando colocar Spell em face-up diretamente, deve usar ACTIVATE_SPELL_TRAP
                client.emit('duelError', { message: 'Para ativar uma Spell card da mão, use a opção "Ativar". Para colocá-la no campo, use "Setar".' });
                return;
              }
            } else {
              console.error(`❌ [handleDuelAction] Carta ${cardId} não encontrada na mão nem no campo do jogador!`);
            }
          } else {
            console.error(`❌ [handleDuelAction] Duelo não encontrado ao buscar tipo da carta!`);
          }
        }
        
        // Para SET_MONSTER, usar a posição fornecida (defense ou set)
        // Para SET_SPELL_TRAP: sempre 'set' (não pode ser face-up diretamente)
        // Para ACTIVATE_SPELL_TRAP: sempre 'face-up' (ativando da mão ou do campo)
        const finalPosition = actionType === 'SET_MONSTER' 
          ? (position || 'set')
          : actionType === 'SET_SPELL_TRAP'
          ? 'set' // Spell/Trap sempre em 'set' quando colocadas no campo
          : 'face-up'; // ACTIVATE_SPELL_TRAP sempre em 'face-up'
        
        console.log(`📤 [handleDuelAction] ${actionType} - cardId: ${cardId}, zoneIndex: ${zoneIndex}, position: ${finalPosition}, cardType: ${cardType}`);
        
        // Verificar se é Confiscation, GracefulCharity ou TheForcefulSentry ANTES de processar
        // Essas cartas têm comportamento especial (colocam no campo imediatamente)
        const originalCardId = cardId?.toString().toLowerCase();
        const originalCardName = actionData?.cardName?.toString().toLowerCase();
        
        const isConfiscationCard = originalCardId === 'confiscation' || originalCardName === 'confiscation' ||
            (typeof originalCardId === 'string' && originalCardId.includes('confiscation')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('confiscation'));
        
        const isGracefulCharityCard = originalCardId === 'gracefulcharity' || originalCardName === 'graceful charity' ||
            (typeof originalCardId === 'string' && originalCardId.includes('gracefulcharity')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('graceful charity'));
        
        const isForcefulSentryCard = originalCardId === 'theforcefulsentry' || originalCardName === 'the forceful sentry' ||
            (typeof originalCardId === 'string' && originalCardId.includes('forcefulsentry')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('forceful sentry'));
        
        // Verificar se é ChangeOfHeart ANTES de definir isSpecialCard
        // ChangeOfHeart é uma Normal Spell que vai direto para o cemitério, então não precisa de zoneIndex quando está na mão
        const isChangeOfHeartCardEarly = originalCardId === 'changeofheart' || originalCardName === 'change of heart' ||
            (typeof originalCardId === 'string' && originalCardId.includes('changeofheart')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('change of heart')) ||
            cardId === 'ChangeOfHeart' || 
            cardId === 'changeofheart' ||
            (typeof cardId === 'string' && cardId.toLowerCase().includes('changeofheart'));
        
        // Verificar se é BrainControl
        const isBrainControlCardEarly = cardId === 'BrainControl' ||
            cardId === 'braincontrol' ||
            (typeof cardId === 'string' && cardId.toLowerCase().includes('braincontrol')) ||
            originalCardName === 'brain control' ||
            (typeof originalCardName === 'string' && originalCardName.includes('brain control'));
        
        const isSpecialCard = isConfiscationCard || isGracefulCharityCard || isForcefulSentryCard;
        
        // Para cartas especiais, comportamento normal (coloca no campo imediatamente)
        // Para outras cartas, processar efeito primeiro antes de colocar no campo
        // Change Of Heart e Brain Control também precisam entrar neste bloco para verificar se precisam de modal
        let result;
        let updatedDuel;
        
        if (!isSpecialCard && actionType === 'ACTIVATE_SPELL_TRAP' && finalPosition === 'face-up') {
          // Para outras cartas, verificar se precisa de modal ANTES de colocar no campo
          console.log(`🔍 [handleDuelAction] Carta não é especial - verificando se precisa de modal antes de colocar no campo`);
          
          // Buscar duelo atual
          updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
          if (!updatedDuel) {
            client.emit('duelError', { message: 'Duelo não encontrado' });
            return;
          }
          
          // Encontrar a carta na mão
          const isPlayer1Check = Number(updatedDuel.player1Id) === Number(userId);
          const playerFieldCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          let cardToProcess = null;
          let cardIsOnField = false;
          
          // Verificar se está no campo (em set) - se estiver, pode ativar normalmente
          // IMPORTANTE: Se zoneIndex é válido e há carta nessa zona, verificar se é a carta que queremos ativar
          if (zoneIndex !== undefined && zoneIndex !== null && zoneIndex >= 0 && zoneIndex < 5 &&
              playerFieldCheck && playerFieldCheck.spellTrap && playerFieldCheck.spellTrap[zoneIndex]) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            if (cardOnFieldId === cardId || String(cardOnFieldId).toLowerCase() === String(cardId).toLowerCase()) {
              cardToProcess = cardOnField;
              cardIsOnField = true;
              // Se a carta está no campo em "set", marcar que estava no campo
              if (cardOnField.position === 'set') {
                // A carta já está no campo em "set" - quando cancelar, deve permanecer em "set"
                console.log(`🔍 [handleDuelAction] Carta ${cardToProcess.name || cardToProcess.cardName} está no campo em "set"`);
              }
            }
          }
          
          // Se não está no campo, buscar na mão
          if (!cardToProcess && playerFieldCheck && playerFieldCheck.hand) {
            cardToProcess = playerFieldCheck.hand.find((c: any) => {
              if (actionData.instanceId && c.instanceId) {
                if (c.instanceId === actionData.instanceId) {
                  return true;
                }
              }
              
              const cIdCarta = c.idCarta;
              const cId = c.id;
              const cCardId = c.cardId;
              const cName = c.name || c.cardName;
              
              const matchesById = cIdCarta === cardId || 
                                 cId === cardId || 
                                 cCardId === cardId ||
                                 String(cIdCarta) === String(cardId) ||
                                 String(cId) === String(cardId) ||
                                 String(cCardId) === String(cardId);
              
              const matchesByName = cName && actionData.cardName && 
                                  (cName === actionData.cardName || 
                                   cName.toLowerCase() === actionData.cardName.toLowerCase());
              
              return matchesById || matchesByName;
            });
          }
          
          if (!cardToProcess) {
            client.emit('duelError', { message: 'Carta não encontrada na mão nem no campo' });
            return;
          }
          
          // Se a carta precisa de modal (na mão OU no campo em "set"), NÃO colocar no campo ainda
          // Criar pendingChoice e abrir modal - a carta permanece onde estava
          const needsModal = this.duelsService.needsModalBeforeReveal(cardToProcess);
          console.log(`🔍 [handleDuelAction] Verificando se precisa de modal - cardId: ${cardId}, cardName: ${cardToProcess.name || cardToProcess.cardName}, needsModal: ${needsModal}, cardIsOnField: ${cardIsOnField}`);
          
          // IMPORTANTE: Se a carta está na mão e precisa de modal, não precisa de zoneIndex válido
          // porque a carta não vai para o campo - vai direto para o cemitério após a ativação
          // Nesse caso, podemos ignorar completamente o zoneIndex recebido do frontend
          if (needsModal && !cardIsOnField) {
            console.log(`✅ [handleDuelAction] Carta está na mão e precisa de modal - ignorando zoneIndex (carta não vai para o campo, vai direto para o cemitério)`);
            // Não fazer nada com zoneIndex - a carta não precisa ir para o campo
          }
          
          if (needsModal) {
            console.log(`🔒 [handleDuelAction] Spell ${cardToProcess.name || cardToProcess.cardName} precisa de modal - NÃO colocando no campo, criando pendingChoice`);
            console.log(`🔒 [handleDuelAction] Carta está no campo? ${cardIsOnField}`);
            
            // IMPORTANTE: Se a carta está no campo em "set", NÃO chamar processCardEffect
            // porque ele pode salvar o duelo com a carta em "face-up"
            // Apenas criar pendingChoice manualmente para Mystical Space Typhoon
            // Para outras cartas que criam pendingChoice automaticamente, processCardEffect será chamado depois
            
            // Verificar se é Mystical Space Typhoon, Soul Taker, Change Of Heart ou Brain Control ANTES de chamar processCardEffect
            const cardNameLower = (cardToProcess.name || cardToProcess.cardName || '').toLowerCase();
            const cardIdFromCard = cardToProcess.idCarta || cardToProcess.id || cardToProcess.cardId;
            const cardIdLower = String(cardId || '').toLowerCase();
            const cardIdFromCardLower = String(cardIdFromCard || '').toLowerCase();
            const isMysticalSpaceTyphoon = cardId === 'MysticalSpaceTyphoon' ||
                                          cardId === 'mysticalspacetyphoon' ||
                                          cardIdLower.includes('mysticalspacetyphoon') ||
                                          cardNameLower.includes('mystical space typhoon');
            const isSoulTaker = cardId === 'SoulTaker' ||
                               cardId === 'soultaker' ||
                               cardIdLower.includes('soultaker') ||
                               cardNameLower.includes('soul taker');
            const isChangeOfHeart = isChangeOfHeartCardEarly;
            const isBrainControl = cardId === 'BrainControl' ||
                                  cardId === 'braincontrol' ||
                                  cardIdLower.includes('braincontrol') ||
                                  cardNameLower.includes('brain control');
            const isMonsterReborn = cardId === 'MonsterReborn' ||
                                   cardId === 'monsterreborn' ||
                                   cardIdLower.includes('monsterreborn') ||
                                   cardNameLower.includes('monster reborn');
            const isLastWill = cardId === 'LastWill' ||
                              cardId === 'lastwill' ||
                              cardIdLower.includes('lastwill') ||
                              cardNameLower.includes('last will');
            const isMonsterReincarnation = cardId === 'MonsterReincarnation' ||
                                          cardId === 'monsterreincarnation' ||
                                          cardIdLower.includes('monsterreincarnation') ||
                                          cardNameLower.includes('monster reincarnation');
            const isPrematureBurial = cardId === 'PrematureBurial' ||
                                     cardId === 'prematureburial' ||
                                     cardIdLower.includes('prematureburial') ||
                                     cardNameLower.includes('premature burial');
            const isAutonomousActionUnit = cardId === 'AutonomousActionUnit' ||
                                          cardId === 'autonomousactionunit' ||
                                          cardIdLower.includes('autonomousactionunit') ||
                                          cardNameLower.includes('autonomous action unit');
            const isLightningStorm = cardId === 'LightningStorm' ||
                                     cardId === 'lightningstorm' ||
                                     cardIdLower.includes('lightningstorm') ||
                                     cardIdFromCardLower.includes('lightningstorm') ||
                                     cardNameLower.includes('lightning storm') ||
                                     cardIdFromCardLower.includes('ygopro_14532163');
            const needsModalBeforeField = isMysticalSpaceTyphoon || isSoulTaker || isChangeOfHeart || isBrainControl || isMonsterReborn || isLastWill || isMonsterReincarnation || isPrematureBurial || isAutonomousActionUnit || isLightningStorm;
            
            let createdPendingChoice = false;
            
            // Se NÃO precisa de modal antes de ir para o campo e a carta está na mão, pode chamar processCardEffect
            // Mas se está no campo em "set", não chamar para evitar revelar a carta
            if (!needsModalBeforeField && !cardIsOnField) {
            // Criar um duelo temporário para processar o efeito e criar pendingChoice
              // Mas sem colocar a carta no campo ainda (se estava na mão)
            const tempDuel = { ...updatedDuel };
            const tempPlayerField = isPlayer1Check ? (tempDuel as any).player1Field : (tempDuel as any).player2Field;
            
            // Colocar temporariamente no campo apenas para processCardEffect criar o pendingChoice
              // Depois vamos restaurar - a carta permanece onde estava até o modal ser confirmado
            const originalSpellTrap = tempPlayerField.spellTrap[zoneIndex];
            tempPlayerField.spellTrap[zoneIndex] = { ...cardToProcess, position: 'face-up' };
            
            // Processar efeito para criar pendingChoice (mas não vamos salvar isso)
            // CRÍTICO: Usar CardEffectsService para processar efeitos (novo sistema de registro)
              createdPendingChoice = await this.cardEffectsService.processCardEffect(
              duelId.toString(),
              tempDuel as any,
              isPlayer1Check,
              cardToProcess,
              zoneIndex
            );
            
              // Restaurar campo original (carta não foi colocada/movida ainda)
            tempPlayerField.spellTrap[zoneIndex] = originalSpellTrap;
            }
            
            // IMPORTANTE: Garantir que o duelo real não foi modificado
            // Buscar duelo atualizado do banco
            updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
            
            // Verificar se a carta no campo ainda está em "set" (não foi revelada)
            if (cardIsOnField && updatedDuel) {
              const realPlayerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              if (realPlayerField && realPlayerField.spellTrap && realPlayerField.spellTrap[zoneIndex]) {
                const realCard = realPlayerField.spellTrap[zoneIndex];
                // Se a carta foi alterada para face-up, restaurar para set
                if (realCard.position === 'face-up' && cardToProcess.position === 'set') {
                  realCard.position = 'set';
                  // Salvar a correção no banco
                  await this.duelsService.updateDuelInDatabase(duelId, {
                    player1Field: (updatedDuel as any).player1Field,
                    player2Field: (updatedDuel as any).player2Field,
                  } as any);
                  // Buscar novamente após correção
                  updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                }
              }
            }
            
            // Verificar se precisa de modal antes de ir para o campo (Mystical Space Typhoon ou Soul Taker)
            console.log(`🔍 [handleDuelAction] Verificando cartas com modal antes do campo - cardId: ${cardId}, cardName: ${cardToProcess.name || cardToProcess.cardName}, isMST: ${isMysticalSpaceTyphoon}, isSoulTaker: ${isSoulTaker}, createdPendingChoice: ${createdPendingChoice}`);
            
            if (isMysticalSpaceTyphoon) {
              // Mystical Space Typhoon precisa criar pendingChoice manualmente
              console.log(`✨ [handleDuelAction] Mystical Space Typhoon detectada - criando pendingChoice manualmente`);
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              // IMPORTANTE: Buscar duelo atualizado do banco para garantir que temos os dados mais recentes do oponente
              // PRIMEIRO: Tentar buscar do cache ativo (mais rápido e mais atualizado)
              const cachedDuel = this.duelsService.findDuelByIdLight(duelId);
              if (cachedDuel) {
                console.log(`✅ [handleDuelAction] Duelo encontrado no cache ativo`);
                updatedDuel = cachedDuel;
              } else {
                // Se não encontrou no cache, buscar do banco
                const latestDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                if (latestDuel) {
                  updatedDuel = latestDuel;
                  console.log(`✅ [handleDuelAction] Duelo atualizado do banco - player1Field existe: ${!!(updatedDuel as any).player1Field}, player2Field existe: ${!!(updatedDuel as any).player2Field}`);
                }
              }
              
              // Verificar se os campos são strings (JSON não parseado) e fazer parse se necessário
              if (updatedDuel) {
                if ((updatedDuel as any).player1Field && typeof (updatedDuel as any).player1Field === 'string') {
                  try {
                    (updatedDuel as any).player1Field = JSON.parse((updatedDuel as any).player1Field);
                    console.log(`✅ [handleDuelAction] player1Field parseado do JSON`);
                  } catch (e) {
                    console.error(`❌ [handleDuelAction] Erro ao fazer parse do player1Field:`, e);
                  }
                }
                if ((updatedDuel as any).player2Field && typeof (updatedDuel as any).player2Field === 'string') {
                  try {
                    (updatedDuel as any).player2Field = JSON.parse((updatedDuel as any).player2Field);
                    console.log(`✅ [handleDuelAction] player2Field parseado do JSON`);
                  } catch (e) {
                    console.error(`❌ [handleDuelAction] Erro ao fazer parse do player2Field:`, e);
                  }
                }
              }
              
              // Coletar spell/trap do campo (próprio e oponente) para o modal
              // CRÍTICO: Garantir que temos os dados mais recentes do oponente
              console.log(`🔍 [handleDuelAction] ========== IDENTIFICAÇÃO DE JOGADORES ==========`);
              console.log(`🔍 [handleDuelAction] userId: ${userId} (tipo: ${typeof userId})`);
              console.log(`🔍 [handleDuelAction] updatedDuel.player1Id: ${(updatedDuel as any).player1Id} (tipo: ${typeof (updatedDuel as any).player1Id})`);
              console.log(`🔍 [handleDuelAction] updatedDuel.player2Id: ${(updatedDuel as any).player2Id} (tipo: ${typeof (updatedDuel as any).player2Id})`);
              console.log(`🔍 [handleDuelAction] Number(userId): ${Number(userId)}`);
              console.log(`🔍 [handleDuelAction] Number(updatedDuel.player1Id): ${Number((updatedDuel as any).player1Id)}`);
              console.log(`🔍 [handleDuelAction] isPlayer1Check: ${isPlayer1Check}`);
              
              let playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              let opponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
              
              console.log(`🔍 [handleDuelAction] playerField obtido de: ${isPlayer1Check ? 'player1Field' : 'player2Field'}`);
              console.log(`🔍 [handleDuelAction] opponentField obtido de: ${isPlayer1Check ? 'player2Field' : 'player1Field'}`);
              console.log(`🔍 [handleDuelAction] playerField existe: ${!!playerField}`);
              console.log(`🔍 [handleDuelAction] opponentField existe: ${!!opponentField}`);
              
              // Se opponentField não existe ou não tem spellTrap, tentar buscar do cache ativo novamente
              if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
                console.warn(`⚠️ [handleDuelAction] opponentField inválido no updatedDuel, tentando buscar do cache ativo...`);
                const activeDuel = this.duelsService.findDuelByIdLight(duelId);
                if (activeDuel) {
                  console.log(`✅ [handleDuelAction] Duelo encontrado no cache ativo`);
                  const activeOpponentField = isPlayer1Check ? (activeDuel as any).player2Field : (activeDuel as any).player1Field;
                  console.log(`🔍 [handleDuelAction] activeOpponentField obtido de: ${isPlayer1Check ? 'player2Field' : 'player1Field'}`);
                  console.log(`🔍 [handleDuelAction] activeOpponentField existe: ${!!activeOpponentField}`);
                  console.log(`🔍 [handleDuelAction] activeOpponentField.spellTrap existe: ${!!(activeOpponentField?.spellTrap)}`);
                  console.log(`🔍 [handleDuelAction] activeOpponentField.spellTrap é array: ${Array.isArray(activeOpponentField?.spellTrap)}`);
                  if (activeOpponentField && activeOpponentField.spellTrap && Array.isArray(activeOpponentField.spellTrap)) {
                    const cardsCount = activeOpponentField.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
                    console.log(`✅ [handleDuelAction] opponentField encontrado no cache ativo com ${cardsCount} cartas`);
                    opponentField = activeOpponentField;
                    // Atualizar também o updatedDuel para manter consistência
                    if (isPlayer1Check) {
                      (updatedDuel as any).player2Field = activeOpponentField;
                      console.log(`✅ [handleDuelAction] Atualizado updatedDuel.player2Field com dados do cache`);
                    } else {
                      (updatedDuel as any).player1Field = activeOpponentField;
                      console.log(`✅ [handleDuelAction] Atualizado updatedDuel.player1Field com dados do cache`);
                    }
                  } else {
                    console.error(`❌ [handleDuelAction] activeOpponentField do cache também está inválido!`);
                  }
                } else {
                  console.error(`❌ [handleDuelAction] Duelo não encontrado no cache ativo!`);
                }
              }
              
              console.log(`🔍 [handleDuelAction] ========== VERIFICAÇÃO INICIAL DE CAMPOS ==========`);
              console.log(`🔍 [handleDuelAction] isPlayer1Check: ${isPlayer1Check}`);
              console.log(`🔍 [handleDuelAction] playerField existe: ${!!playerField}`);
              console.log(`🔍 [handleDuelAction] opponentField existe: ${!!opponentField}`);
              console.log(`🔍 [handleDuelAction] playerField.spellTrap existe: ${!!(playerField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap existe: ${!!(opponentField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap tipo: ${typeof opponentField?.spellTrap}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap é array: ${Array.isArray(opponentField?.spellTrap)}`);
              if (opponentField?.spellTrap && Array.isArray(opponentField.spellTrap)) {
                const opponentCardsCount = opponentField.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
                console.log(`🔍 [handleDuelAction] opponentField.spellTrap tem ${opponentCardsCount} cartas`);
              }
              
              // CRÍTICO: Verificar se opponentField existe e tem spellTrap
              if (!opponentField) {
                console.error(`❌ [handleDuelAction] opponentField é null ou undefined!`);
                console.error(`❌ [handleDuelAction] isPlayer1Check: ${isPlayer1Check}`);
                console.error(`❌ [handleDuelAction] updatedDuel.player1Field existe: ${!!(updatedDuel as any).player1Field}`);
                console.error(`❌ [handleDuelAction] updatedDuel.player2Field existe: ${!!(updatedDuel as any).player2Field}`);
              } else {
                console.log(`✅ [handleDuelAction] opponentField encontrado!`);
                console.log(`✅ [handleDuelAction] opponentField.spellTrap existe: ${!!opponentField.spellTrap}`);
                console.log(`✅ [handleDuelAction] opponentField.spellTrap é array: ${Array.isArray(opponentField.spellTrap)}`);
                if (opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
                  const opponentCardsCount = opponentField.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
                  console.log(`✅ [handleDuelAction] opponentField.spellTrap tem ${opponentCardsCount} cartas`);
                }
              }
              
              console.log(`🔍 [handleDuelAction] ========== VERIFICAÇÃO DE CAMPOS ==========`);
              console.log(`🔍 [handleDuelAction] isPlayer1Check: ${isPlayer1Check}`);
              console.log(`🔍 [handleDuelAction] playerField existe: ${!!playerField}`);
              console.log(`🔍 [handleDuelAction] opponentField existe: ${!!opponentField}`);
              console.log(`🔍 [handleDuelAction] playerField.spellTrap existe: ${!!(playerField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap existe: ${!!(opponentField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] playerField.spellTrap é array: ${Array.isArray(playerField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap é array: ${Array.isArray(opponentField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] playerField.spellTrap length: ${playerField?.spellTrap?.length || 0}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap length: ${opponentField?.spellTrap?.length || 0}`);
              
              // Garantir que opponentField.spellTrap é um array válido
              if (opponentField && (!opponentField.spellTrap || !Array.isArray(opponentField.spellTrap))) {
                console.warn(`⚠️ [handleDuelAction] opponentField.spellTrap não é um array válido! Inicializando...`);
                opponentField.spellTrap = [null, null, null, null, null];
              }
              
              // Garantir que playerField.spellTrap é um array válido
              if (playerField && (!playerField.spellTrap || !Array.isArray(playerField.spellTrap))) {
                console.warn(`⚠️ [handleDuelAction] playerField.spellTrap não é um array válido! Inicializando...`);
                playerField.spellTrap = [null, null, null, null, null];
              }
              
              console.log(`🔍 [handleDuelAction] ========== FIM DA VERIFICAÇÃO ==========`);
              
              console.log(`🔍 [handleDuelAction] Coletando spell/trap para Mystical Space Typhoon`);
              console.log(`🔍 [handleDuelAction] playerField existe: ${!!playerField}, opponentField existe: ${!!opponentField}`);
              console.log(`🔍 [handleDuelAction] playerField.spellTrap:`, playerField?.spellTrap);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap:`, opponentField?.spellTrap);
              
              const playerSpellTraps: Array<{ card: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];
              const opponentSpellTraps: Array<{ card: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];
              
              // Coletar do próprio campo
              if (playerField && playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
                playerField.spellTrap.forEach((card: any, index: number) => {
                  if (card && card !== null) {
                    // Não incluir a própria Mystical Space Typhoon se estiver no campo
                    const cardId = card.idCarta || card.id || card.cardId;
                    const isMST = cardId === 'MysticalSpaceTyphoon' || 
                                  cardId === 'mysticalspacetyphoon' ||
                                  (typeof cardId === 'string' && cardId.toLowerCase().includes('mysticalspacetyphoon'));
                    if (!isMST) {
                      playerSpellTraps.push({ card, zoneIndex: index, player: 'player' });
                    }
                  }
                });
              }
              
              // Coletar do campo do oponente
              // IMPORTANTE: Coletar TODAS as spell/trap do oponente, mesmo as que estão face-down (set)
              console.log(`🔍 [handleDuelAction] ========== COLETANDO SPELL/TRAP DO OPONENTE ==========`);
              
              // CRÍTICO: Buscar o campo do oponente novamente do duelo atualizado para garantir que temos os dados mais recentes
              if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
                console.warn(`⚠️ [handleDuelAction] opponentField inválido, buscando do duelo atualizado novamente...`);
                const freshDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                if (freshDuel) {
                  const freshOpponentField = isPlayer1Check ? (freshDuel as any).player2Field : (freshDuel as any).player1Field;
                  if (freshOpponentField && freshOpponentField.spellTrap && Array.isArray(freshOpponentField.spellTrap)) {
                    opponentField = freshOpponentField;
                    console.log(`✅ [handleDuelAction] opponentField atualizado do duelo fresco`);
                  }
                }
              }
              
              console.log(`🔍 [handleDuelAction] opponentField existe: ${!!opponentField}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap existe: ${!!(opponentField?.spellTrap)}`);
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap é array: ${Array.isArray(opponentField?.spellTrap)}`);
              
              // CRÍTICO: Garantir que opponentField.spellTrap é um array válido antes de iterar
              if (!opponentField) {
                console.error(`❌ [handleDuelAction] opponentField é null ou undefined!`);
              } else if (!opponentField.spellTrap) {
                console.warn(`⚠️ [handleDuelAction] opponentField.spellTrap não existe - inicializando...`);
                opponentField.spellTrap = [null, null, null, null, null];
              } else if (!Array.isArray(opponentField.spellTrap)) {
                console.warn(`⚠️ [handleDuelAction] opponentField.spellTrap não é array - convertendo...`);
                opponentField.spellTrap = [null, null, null, null, null];
              } else {
                // Garantir que tem 5 elementos
                while (opponentField.spellTrap.length < 5) {
                  opponentField.spellTrap.push(null);
                }
                opponentField.spellTrap = opponentField.spellTrap.slice(0, 5);
              }
              
              console.log(`🔍 [handleDuelAction] opponentField.spellTrap após inicialização:`, JSON.stringify(opponentField?.spellTrap, null, 2));
              
              // CRÍTICO: Verificar novamente se opponentField.spellTrap é válido antes de iterar
              if (!opponentField) {
                console.error(`❌ [handleDuelAction] opponentField ainda é null após inicialização!`);
              } else if (!opponentField.spellTrap) {
                console.error(`❌ [handleDuelAction] opponentField.spellTrap ainda não existe após inicialização!`);
                // Tentar inicializar novamente
                opponentField.spellTrap = [null, null, null, null, null];
              } else if (!Array.isArray(opponentField.spellTrap)) {
                console.error(`❌ [handleDuelAction] opponentField.spellTrap ainda não é array após inicialização! Tipo: ${typeof opponentField.spellTrap}`);
                // Tentar converter para array
                opponentField.spellTrap = [null, null, null, null, null];
              }
              
              // CRÍTICO: Antes de coletar, garantir que temos o opponentField mais atualizado
              // Buscar novamente do duelo atualizado para ter certeza
              if (updatedDuel) {
                const latestOpponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
                if (latestOpponentField && latestOpponentField.spellTrap && Array.isArray(latestOpponentField.spellTrap)) {
                  opponentField = latestOpponentField;
                  console.log(`✅ [handleDuelAction] opponentField atualizado com dados mais recentes antes da coleta`);
                }
              }
              
              if (opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
                console.log(`✅ [handleDuelAction] Coletando spell/trap do oponente - total de zonas: ${opponentField.spellTrap.length}`);
                // CRÍTICO: Garantir que o array tem 5 elementos
                while (opponentField.spellTrap.length < 5) {
                  opponentField.spellTrap.push(null);
                }
                opponentField.spellTrap = opponentField.spellTrap.slice(0, 5);
                
                console.log(`🔍 [handleDuelAction] Iniciando iteração sobre opponentField.spellTrap - total de elementos: ${opponentField.spellTrap.length}`);
                opponentField.spellTrap.forEach((card: any, index: number) => {
                  // IMPORTANTE: Verificar se card existe e não é null/undefined
                  console.log(`🔍 [handleDuelAction] Iterando zona ${index} - card existe: ${!!card}, card é null: ${card === null}, card é undefined: ${card === undefined}`);
                  if (card && card !== null && card !== undefined) {
                    const cardName = card.name || card.cardName || 'Desconhecida';
                    const cardPosition = card.position || 'set';
                    const cardId = card.idCarta || card.id || card.cardId;
                    console.log(`✅ [handleDuelAction] Oponente - Zona ${index}: ${cardName} (${cardPosition}) - ID: ${cardId}`);
                    console.log(`✅ [handleDuelAction] Adicionando carta do oponente ao array opponentSpellTraps`);
                    // IMPORTANTE: Garantir que o objeto card está completo antes de adicionar
                    const cardToAdd = { 
                      card: { ...card }, // Criar cópia para garantir que não há referências problemáticas
                      zoneIndex: index, 
                      player: 'opponent' as const
                    };
                    opponentSpellTraps.push(cardToAdd);
                    console.log(`✅ [handleDuelAction] Carta adicionada! opponentSpellTraps.length agora é: ${opponentSpellTraps.length}`);
                  } else {
                    console.log(`🔍 [handleDuelAction] Oponente - Zona ${index}: vazia (card: ${card}, tipo: ${typeof card})`);
                  }
                });
                console.log(`✅ [handleDuelAction] Iteração concluída - opponentSpellTraps.length: ${opponentSpellTraps.length}`);
                console.log(`✅ [handleDuelAction] Total de spell/trap do oponente coletadas: ${opponentSpellTraps.length}`);
                console.log(`✅ [handleDuelAction] Detalhes das cartas coletadas:`, opponentSpellTraps.map((st: any) => ({
                  name: st.card?.name || st.card?.cardName || 'Desconhecida',
                  zoneIndex: st.zoneIndex,
                  position: st.card?.position || 'unknown',
                  player: st.player
                })));
              } else {
                console.error(`❌ [handleDuelAction] opponentField ou opponentField.spellTrap ainda não é válido após inicialização`);
                console.error(`❌ [handleDuelAction] opponentField existe: ${!!opponentField}`);
                console.error(`❌ [handleDuelAction] opponentField.spellTrap existe: ${!!(opponentField?.spellTrap)}`);
                console.error(`❌ [handleDuelAction] opponentField.spellTrap é array: ${Array.isArray(opponentField?.spellTrap)}`);
                if (opponentField) {
                  console.error(`❌ [handleDuelAction] opponentField completo:`, JSON.stringify(opponentField, null, 2));
                }
              }
              console.log(`🔍 [handleDuelAction] ========== FIM DA COLETA DO OPONENTE ==========`);
              
              console.log(`✅ [handleDuelAction] playerSpellTraps coletadas: ${playerSpellTraps.length}`);
              console.log(`✅ [handleDuelAction] opponentSpellTraps coletadas: ${opponentSpellTraps.length}`);
              
              const allSpellTraps = [...playerSpellTraps, ...opponentSpellTraps];
              
              if (allSpellTraps.length > 0) {
                // Verificar se updatedDuel não é null
                if (!updatedDuel) {
                  console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar pendingChoice para Mystical Space Typhoon`);
                  client.emit('duelError', { message: 'Erro ao processar Mystical Space Typhoon' });
                  return;
                }
                
                // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo)
                // zoneIndex só é usado se a carta está no campo em "set"
                const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
                
                // Criar pendingChoice manualmente
                await this.duelsService.setPendingChoice(duelId, {
                  type: 'MYSTICAL_SPACE_TYPHOON',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: {
                    cardId: cardId,
                    cardName: cardToProcess.name || cardToProcess.cardName,
                    zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                    cardInstanceId: cardToProcess.instanceId,
                    cardData: cardToProcess,
                    cardWasOnField: cardIsOnField,
                    originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null
                  }
                });
                
                // Buscar duelo atualizado com pendingChoice
                updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                
                // CRÍTICO: Atualizar opponentField com os dados mais recentes do duelo atualizado
                if (updatedDuel) {
                  const freshOpponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
                  if (freshOpponentField) {
                    opponentField = freshOpponentField;
                    console.log(`✅ [handleDuelAction] opponentField atualizado com dados do duelo atualizado`);
                  }
                }
                
                console.log(`📤 [handleDuelAction] Emitindo mysticalSpaceTyphoonShowTargets apenas para quem ativou (com pendingChoice)`);
                console.log(`📤 [handleDuelAction] playerSpellTraps: ${playerSpellTraps.length}, opponentSpellTraps: ${opponentSpellTraps.length}`);
                console.log(`📤 [handleDuelAction] cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
                console.log(`📤 [handleDuelAction] Detalhes das cartas do oponente:`, opponentSpellTraps.map((st: any) => ({
                  cardName: st.card?.name || st.card?.cardName || 'Desconhecida',
                  zoneIndex: st.zoneIndex,
                  position: st.card?.position || 'unknown'
                })));
                
                // IMPORTANTE: Garantir que opponentSpellTraps não está vazio quando deveria ter cartas
                // Se opponentSpellTraps está vazio mas opponentField tem cartas, tentar coletar novamente
                if (opponentSpellTraps.length === 0 && opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
                  const hasOpponentCards = opponentField.spellTrap.some((card: any) => card !== null && card !== undefined);
                  if (hasOpponentCards) {
                    console.warn(`⚠️ [handleDuelAction] opponentSpellTraps está vazio mas opponentField tem cartas! Tentando coletar novamente...`);
                    opponentField.spellTrap.forEach((card: any, index: number) => {
                      if (card && card !== null) {
                        const cardName = card.name || card.cardName || 'Desconhecida';
                        const cardPosition = card.position || 'set';
                        const cardId = card.idCarta || card.id || card.cardId;
                        console.log(`🔍 [handleDuelAction] Re-coletando - Oponente - Zona ${index}: ${cardName} (${cardPosition}) - ID: ${cardId}`);
                        opponentSpellTraps.push({ card, zoneIndex: index, player: 'opponent' });
                      }
                    });
                    console.log(`✅ [handleDuelAction] Após re-coleta: ${opponentSpellTraps.length} cartas do oponente`);
                  }
                }
                
                // Emitir apenas para o cliente que ativou a carta
                // CRÍTICO: Garantir que opponentSpellTraps está sendo enviado corretamente
                // Se opponentSpellTraps ainda estiver vazio, tentar coletar uma última vez diretamente do updatedDuel
                if (opponentSpellTraps.length === 0 && updatedDuel) {
                  console.warn(`⚠️ [handleDuelAction] opponentSpellTraps ainda está vazio! Tentando coletar diretamente do updatedDuel...`);
                  const finalOpponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
                  if (finalOpponentField && finalOpponentField.spellTrap && Array.isArray(finalOpponentField.spellTrap)) {
                    console.log(`✅ [handleDuelAction] finalOpponentField encontrado com ${finalOpponentField.spellTrap.length} zonas`);
                    finalOpponentField.spellTrap.forEach((card: any, index: number) => {
                      if (card && card !== null && card !== undefined) {
                        const cardName = card.name || card.cardName || 'Desconhecida';
                        const cardPosition = card.position || 'set';
                        console.log(`🔍 [handleDuelAction] Coleta final - Oponente - Zona ${index}: ${cardName} (${cardPosition})`);
                        opponentSpellTraps.push({ 
                          card: { ...card }, 
                          zoneIndex: index, 
                          player: 'opponent' 
                        });
                      }
                    });
                    console.log(`✅ [handleDuelAction] Após coleta final: ${opponentSpellTraps.length} cartas do oponente`);
                  } else {
                    console.error(`❌ [handleDuelAction] Não foi possível coletar do finalOpponentField`);
                    console.error(`❌ [handleDuelAction] finalOpponentField existe: ${!!finalOpponentField}`);
                    console.error(`❌ [handleDuelAction] finalOpponentField.spellTrap existe: ${!!(finalOpponentField?.spellTrap)}`);
                    console.error(`❌ [handleDuelAction] finalOpponentField.spellTrap é array: ${Array.isArray(finalOpponentField?.spellTrap)}`);
                  }
                }
                
                // CRÍTICO: Verificar uma última vez se opponentSpellTraps está vazio quando não deveria estar
                console.log(`🔍 [handleDuelAction] ========== VERIFICAÇÃO FINAL ANTES DE ENVIAR ==========`);
                console.log(`🔍 [handleDuelAction] opponentSpellTraps.length: ${opponentSpellTraps.length}`);
                console.log(`🔍 [handleDuelAction] opponentField existe: ${!!opponentField}`);
                if (opponentField) {
                  console.log(`🔍 [handleDuelAction] opponentField.spellTrap existe: ${!!opponentField.spellTrap}`);
                  console.log(`🔍 [handleDuelAction] opponentField.spellTrap é array: ${Array.isArray(opponentField.spellTrap)}`);
                  if (opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
                    const totalCards = opponentField.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
                    console.log(`🔍 [handleDuelAction] opponentField.spellTrap tem ${totalCards} cartas no total`);
                    console.log(`🔍 [handleDuelAction] opponentField.spellTrap completo:`, JSON.stringify(opponentField.spellTrap.map((c: any, i: number) => ({
                      index: i,
                      hasCard: !!c,
                      cardName: c?.name || c?.cardName || 'null',
                      cardId: c?.idCarta || c?.id || c?.cardId || 'null'
                    })), null, 2));
                  }
                }
                console.log(`🔍 [handleDuelAction] opponentSpellTraps coletadas:`, opponentSpellTraps.map((st: any) => ({
                  cardName: st?.card?.name || st?.card?.cardName || 'Desconhecida',
                  zoneIndex: st?.zoneIndex,
                  position: st?.card?.position || 'unknown',
                  player: st?.player,
                  hasCard: !!st?.card
                })));
                
                const eventData = {
                  playerSpellTraps: playerSpellTraps || [],
                  opponentSpellTraps: opponentSpellTraps || [], // Garantir que sempre é um array
                  spellTrapZoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                  duelId: duelId,
                };
                
                console.log(`📤 [handleDuelAction] ========== EMITINDO EVENTO ==========`);
                console.log(`📤 [handleDuelAction] playerSpellTraps: ${playerSpellTraps.length}`);
                console.log(`📤 [handleDuelAction] opponentSpellTraps: ${opponentSpellTraps.length}`);
                console.log(`📤 [handleDuelAction] eventData.opponentSpellTraps: ${eventData.opponentSpellTraps.length}`);
                console.log(`📤 [handleDuelAction] eventData.opponentSpellTraps é array: ${Array.isArray(eventData.opponentSpellTraps)}`);
                console.log(`📤 [handleDuelAction] Detalhes finais das opponentSpellTraps no eventData:`, eventData.opponentSpellTraps.map((st: any) => ({
                  cardName: st?.card?.name || st?.card?.cardName || 'Desconhecida',
                  zoneIndex: st?.zoneIndex,
                  position: st?.card?.position || 'unknown',
                  player: st?.player,
                  hasCard: !!st?.card
                })));
                console.log(`📤 [handleDuelAction] eventData completo (JSON):`, JSON.stringify({
                  playerSpellTrapsCount: eventData.playerSpellTraps.length,
                  opponentSpellTrapsCount: eventData.opponentSpellTraps.length,
                  opponentSpellTraps: eventData.opponentSpellTraps.map((st: any) => ({
                    cardName: st?.card?.name || st?.card?.cardName || 'Desconhecida',
                    zoneIndex: st?.zoneIndex,
                    player: st?.player
                  }))
                }, null, 2));
                
                client.emit('mysticalSpaceTyphoonShowTargets', eventData);
                
                console.log(`✅ [handleDuelAction] Evento mysticalSpaceTyphoonShowTargets emitido apenas para o cliente que ativou`);
                console.log(`✅ [handleDuelAction] Dados enviados - playerSpellTraps: ${JSON.stringify(playerSpellTraps.map((st: any) => ({ name: st.card?.name, zoneIndex: st.zoneIndex })))}`);
                console.log(`✅ [handleDuelAction] Dados enviados - opponentSpellTraps: ${JSON.stringify(opponentSpellTraps.map((st: any) => ({ name: st.card?.name, zoneIndex: st.zoneIndex })))}`);
                console.log(`📤 [handleDuelAction] ========== FIM DA EMISSÃO ==========`);
                
                // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
                if (updatedDuel) {
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
                }
                return; // Aguardar escolha do usuário
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhuma spell/trap no campo para Mystical Space Typhoon destruir`);
                // Se não há spell/trap, não criar pendingChoice e não colocar carta no campo
                return;
              }
            }
            
            if (isSoulTaker) {
              // Soul Taker precisa criar pendingChoice manualmente (mesmo padrão do Mystical Space Typhoon)
              console.log(`✨ [handleDuelAction] Soul Taker detectada - criando pendingChoice manualmente`);
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              const playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const opponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
              
              // Coletar apenas monstros FACE-UP do campo do oponente (attack ou defense, não set)
              const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
              (opponentField?.monsters || []).forEach((m: any, index: number) => {
                if (m && m !== null && m !== undefined) {
                  const position = m.position || 'attack';
                  // Só pode destruir monstros face-up (attack ou defense, não set)
                  if (position === 'attack' || position === 'defense') {
                    opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
                  }
                }
              });
              
              const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
                ...om.monster,
                zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
              }));
              
              if (opponentMonsters.length > 0) {
                // Verificar se updatedDuel não é null
                if (!updatedDuel) {
                  console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar pendingChoice para Soul Taker`);
                  client.emit('duelError', { message: 'Erro ao processar Soul Taker' });
                  return;
                }
                
                // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo)
                // zoneIndex só é usado se a carta está no campo em "set"
                const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
                
                // Criar pendingChoice manualmente
                await this.duelsService.setPendingChoice(duelId, {
                  type: 'SOUL_TAKER',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: {
                    cardId: cardId,
                    cardName: cardToProcess.name || cardToProcess.cardName,
                    zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                    cardInstanceId: cardToProcess.instanceId,
                    cardData: cardToProcess,
                    cardWasOnField: cardIsOnField,
                    originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                    opponentMonsters: opponentMonsters, // Já inclui zoneIndex em cada monstro
                  }
                });
                
                // Buscar duelo atualizado com pendingChoice
                updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                
                console.log(`📤 [handleDuelAction] Emitindo soulTakerShowOpponentMonsters apenas para quem ativou (com pendingChoice)`);
                console.log(`📤 [handleDuelAction] opponentMonsters: ${opponentMonsters.length}, cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('soulTakerShowOpponentMonsters', {
                  opponentMonsters: opponentMonsters,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento soulTakerShowOpponentMonsters emitido apenas para o cliente que ativou`);
                
                // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
                if (updatedDuel) {
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
                }
                return; // Aguardar escolha do usuário
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo do oponente para Soul Taker destruir`);
                // Se não há monstros face-up, não criar pendingChoice e não colocar carta no campo
                return;
              }
            }
            
            if (isLightningStorm) {
              // Lightning Storm: só pode ativar se não controlar nenhuma carta com face para cima; 1 vez por turno; escolher 1 efeito
              console.log(`✨ [handleDuelAction] Lightning Storm detectada - validando condições e criando pendingChoice`);
              
              const playerFieldLS = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const turnCounterLS = (updatedDuel as any).turnCounter ?? 1;
              const lightningStormUsedThisTurn = (playerFieldLS?.lightningStormActivatedTurn === turnCounterLS);
              if (lightningStormUsedThisTurn) {
                client.emit('duelError', { message: 'Só pode ativar 1 "Lightning Storm" por turno.' });
                return;
              }
              let hasFaceUp = false;
              (playerFieldLS?.monsters || []).forEach((m: any) => {
                if (m && (m.position === 'attack' || m.position === 'defense')) hasFaceUp = true;
              });
              (playerFieldLS?.spellTrap || []).forEach((st: any) => {
                if (st && st.position === 'face-up') hasFaceUp = true;
              });
              if (hasFaceUp) {
                client.emit('duelError', { message: 'Só pode ativar Lightning Storm se você não controlar nenhuma carta com face para cima.' });
                return;
              }
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao processar Lightning Storm' });
                return;
              }
              const zoneIndexForLS = cardIsOnField ? zoneIndex : null;
              await this.duelsService.setPendingChoice(duelId, {
                type: 'LIGHTNING_STORM',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: {
                  cardId: cardId,
                  cardName: cardToProcess.name || cardToProcess.cardName,
                  zoneIndex: zoneIndexForLS,
                  cardInstanceId: cardToProcess.instanceId,
                  cardData: cardToProcess,
                  cardWasOnField: cardIsOnField,
                }
              });
              updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
              client.emit('lightningStormShowOptions', { duelId });
              if (updatedDuel) {
                (updatedDuel as any).pendingChoice = (await this.duelsService.findDuelByIdFromDatabase(duelId, true))?.pendingChoice ?? null;
                this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
              }
              return;
            }
            
            if (isChangeOfHeart) {
              // Change Of Heart precisa criar pendingChoice manualmente (mesmo padrão do Mystical Space Typhoon)
              console.log(`✨ [handleDuelAction] Change Of Heart detectada - criando pendingChoice manualmente`);
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              const playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const opponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
              
              // Coletar monstros do campo do oponente (qualquer posição, exceto Mataza The Zapper face-up)
              const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
              (opponentField?.monsters || []).forEach((m: any, index: number) => {
                if (m && m !== null && m !== undefined) {
                  // Pode controlar monstros em qualquer posição (attack, defense ou set)
                  // EXCETO Mataza The Zapper quando está face-up
                  const cardIdMonster = m.idCarta || m.id || m.cardId;
                  const cardNameMonster = (m.name || m.cardName || '').toLowerCase();
                  const isMatazaFaceUp = (cardIdMonster === 'MatazaTheZapper' || 
                                          cardIdMonster === 'matazathezapper' ||
                                          cardNameMonster.includes('mataza the zapper')) &&
                                         (m.position === 'attack' || m.position === 'defense');
                  
                  if (!isMatazaFaceUp) {
                    opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
                  }
                }
              });
              
              const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
                ...om.monster,
                zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
              }));
              
              if (opponentMonsters.length > 0) {
                // Verificar se updatedDuel não é null
                if (!updatedDuel) {
                  console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar pendingChoice para Change Of Heart`);
                  client.emit('duelError', { message: 'Erro ao processar Change Of Heart' });
                  return;
                }
                
                // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo ainda)
                // zoneIndex só é usado se a carta está no campo em "set"
                const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
                
                // Criar pendingChoice manualmente
                await this.duelsService.setPendingChoice(duelId, {
                  type: 'CHANGE_OF_HEART',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: {
                    cardId: cardId,
                    cardName: cardToProcess.name || cardToProcess.cardName,
                    zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                    cardInstanceId: cardToProcess.instanceId,
                    cardData: cardToProcess,
                    cardWasOnField: cardIsOnField,
                    originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                    opponentMonsters: opponentMonsters, // Já inclui zoneIndex em cada monstro
                  }
                });
                
                // Buscar duelo atualizado com pendingChoice
                updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                
                console.log(`📤 [handleDuelAction] Emitindo changeOfHeartShowOpponentMonsters apenas para quem ativou (com pendingChoice)`);
                console.log(`📤 [handleDuelAction] opponentMonsters: ${opponentMonsters.length}, cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('changeOfHeartShowOpponentMonsters', {
                  opponentMonsters: opponentMonsters,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento changeOfHeartShowOpponentMonsters emitido apenas para o cliente que ativou`);
                
                // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
                if (updatedDuel) {
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
                }
                return; // Aguardar escolha do usuário
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhum monstro no campo do oponente para Change Of Heart controlar`);
                // Se não há monstros, não criar pendingChoice e não colocar carta no campo
                return;
              }
            }
            
            if (isBrainControl) {
              // Brain Control precisa criar pendingChoice manualmente (mesmo padrão do Mystical Space Typhoon)
              console.log(`✨ [handleDuelAction] Brain Control detectada - criando pendingChoice manualmente`);
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              const playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const opponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
              
              // Coletar apenas monstros FACE-UP do campo do oponente (attack ou defense, não set)
              // EXCETO Mataza The Zapper face-up (não pode ser controlada)
              const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
              (opponentField?.monsters || []).forEach((m: any, index: number) => {
                if (m && m !== null && m !== undefined) {
                  const position = m.position || 'attack';
                  // Só pode controlar monstros face-up (attack ou defense, não set)
                  if (position === 'attack' || position === 'defense') {
                    const cardIdMonster = m.idCarta || m.id || m.cardId;
                    const cardNameMonster = (m.name || m.cardName || '').toLowerCase();
                    const isMatazaFaceUp = (cardIdMonster === 'MatazaTheZapper' || 
                                            cardIdMonster === 'matazathezapper' ||
                                            cardNameMonster.includes('mataza the zapper'));
                    if (!isMatazaFaceUp) {
                      opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
                    }
                  }
                }
              });
              
              const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
                ...om.monster,
                zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
              }));
              
              if (opponentMonsters.length > 0) {
                // Verificar se updatedDuel não é null
                if (!updatedDuel) {
                  console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar pendingChoice para Brain Control`);
                  client.emit('duelError', { message: 'Erro ao processar Brain Control' });
                  return;
                }
                
                // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo ainda)
                // zoneIndex só é usado se a carta está no campo em "set"
                const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
                
                // Criar pendingChoice manualmente
                await this.duelsService.setPendingChoice(duelId, {
                  type: 'BRAIN_CONTROL',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: {
                    cardId: cardId,
                    cardName: cardToProcess.name || cardToProcess.cardName,
                    zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                    cardInstanceId: cardToProcess.instanceId,
                    cardData: cardToProcess,
                    cardWasOnField: cardIsOnField,
                    originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                    opponentMonsters: opponentMonsters, // Já inclui zoneIndex em cada monstro
                  }
                });
                
                // Buscar duelo atualizado com pendingChoice
                updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                
                console.log(`📤 [handleDuelAction] Emitindo brainControlShowOpponentMonsters apenas para quem ativou (com pendingChoice)`);
                console.log(`📤 [handleDuelAction] opponentMonsters: ${opponentMonsters.length}, cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('brainControlShowOpponentMonsters', {
                  opponentMonsters: opponentMonsters,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento brainControlShowOpponentMonsters emitido apenas para o cliente que ativou`);
                
                // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
                if (updatedDuel) {
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
                }
                return; // Aguardar escolha do usuário
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo do oponente para Brain Control controlar`);
                // Se não há monstros face-up, não criar pendingChoice e não colocar carta no campo
                return;
              }
            }
            
            if (isMonsterReborn) {
              // MonsterReborn precisa criar pendingChoice manualmente (mesmo padrão do Change Of Heart)
              console.log(`✨ [handleDuelAction] MonsterReborn detectada - criando pendingChoice manualmente`);
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              const playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const opponentField = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
              
              // Coletar monstros dos cemitérios (apenas monstros)
              const playerGraveyard = playerField?.graveyard || [];
              const opponentGraveyard = opponentField?.graveyard || [];
              
              const playerMonsters = playerGraveyard.filter((c: any) => {
                const cardType = c.type || c.cardType;
                return cardType === 'Monster';
              });
              
              const opponentMonsters = opponentGraveyard.filter((c: any) => {
                const cardType = c.type || c.cardType;
                return cardType === 'Monster';
              });
              
              if (playerMonsters.length > 0 || opponentMonsters.length > 0) {
                // Verificar se updatedDuel não é null
                if (!updatedDuel) {
                  console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar pendingChoice para MonsterReborn`);
                  client.emit('duelError', { message: 'Erro ao processar MonsterReborn' });
                  return;
                }
                
                // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo ainda)
                // zoneIndex só é usado se a carta está no campo em "set"
                const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
                
                // Criar pendingChoice manualmente
                await this.duelsService.setPendingChoice(duelId, {
                  type: 'MONSTER_REBORN',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: {
                    cardId: cardId,
                    cardName: cardToProcess.name || cardToProcess.cardName,
                    zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                    cardInstanceId: cardToProcess.instanceId,
                    cardData: cardToProcess,
                    cardWasOnField: cardIsOnField,
                    originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                    playerGraveyard: playerMonsters,
                    opponentGraveyard: opponentMonsters,
                  }
                });
                
                // Buscar duelo atualizado com pendingChoice
                updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                
                console.log(`📤 [handleDuelAction] Emitindo monsterRebornShowGraveyards apenas para quem ativou (com pendingChoice)`);
                console.log(`📤 [handleDuelAction] playerMonsters: ${playerMonsters.length}, opponentMonsters: ${opponentMonsters.length}, cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('monsterRebornShowGraveyards', {
                  playerGraveyard: playerMonsters,
                  opponentGraveyard: opponentMonsters,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento monsterRebornShowGraveyards emitido apenas para o cliente que ativou`);
                
                // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
                if (updatedDuel) {
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
                }
                return; // Aguardar escolha do usuário
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhum monstro nos cemitérios para MonsterReborn reviver`);
                // Se não há monstros, não criar pendingChoice e não colocar carta no campo
                return;
              }
            }
            
            if (isPrematureBurial) {
              // Premature Burial: paga 800 LP, seleciona 1 monstro do SEU cemitério, invoca em ataque e equipa esta carta ao monstro; se um for destruído, ambos vão ao cemitério
              console.log(`✨ [handleDuelAction] Premature Burial detectada - pagar 800 LP e escolher monstro do próprio cemitério`);
              const currentLP = isPlayer1Check ? (updatedDuel as any).player1LifePoints : (updatedDuel as any).player2LifePoints;
              if (currentLP < 800) {
                client.emit('duelError', { message: 'Premature Burial: você precisa de pelo menos 800 LP para ativar.' });
                return;
              }
              const playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const playerGraveyard = playerField?.graveyard || [];
              const playerMonsters = playerGraveyard.filter((c: any) => {
                const cardType = c.type || c.cardType;
                return cardType === 'Monster';
              });
              if (playerMonsters.length === 0) {
                client.emit('duelError', { message: 'Premature Burial: não há monstros no seu cemitério.' });
                return;
              }
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao processar Premature Burial' });
                return;
              }
              // Pagar 800 LP
              if (isPlayer1Check) {
                (updatedDuel as any).player1LifePoints = Math.max(0, (updatedDuel as any).player1LifePoints - 800);
              } else {
                (updatedDuel as any).player2LifePoints = Math.max(0, (updatedDuel as any).player2LifePoints - 800);
              }
              await this.duelsService.updateDuelInDatabase(duelId, {
                player1Field: (updatedDuel as any).player1Field,
                player2Field: (updatedDuel as any).player2Field,
                player1LifePoints: (updatedDuel as any).player1LifePoints,
                player2LifePoints: (updatedDuel as any).player2LifePoints,
              } as any);
              const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
              await this.duelsService.setPendingChoice(duelId, {
                type: 'PREMATURE_BURIAL',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: {
                  cardId: cardId,
                  cardName: cardToProcess.name || cardToProcess.cardName,
                  zoneIndex: zoneIndexForPendingChoice,
                  cardInstanceId: cardToProcess.instanceId,
                  cardData: cardToProcess,
                  cardWasOnField: cardIsOnField,
                  originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                  playerGraveyard: playerMonsters,
                }
              });
              const updatedDuelWithPending = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              client.emit('prematureBurialShowGraveyard', {
                playerGraveyard: playerMonsters,
                duelId: duelId,
              });
              if (updatedDuelWithPending) {
                this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuelWithPending);
              }
              return;
            }
            
            if (isAutonomousActionUnit) {
              console.log(`✨ [handleDuelAction] Autonomous Action Unit detectada - pagar 1500 LP e escolher monstro do cemitério do oponente`);
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              const currentLP = isPlayer1Check ? (updatedDuel as any).player1LifePoints : (updatedDuel as any).player2LifePoints;
              if (currentLP < 1500) {
                client.emit('duelError', { message: 'Autonomous Action Unit: você precisa de pelo menos 1500 LP para ativar.' });
                return;
              }
              const playerFieldAAU = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const opponentFieldAAU = isPlayer1Check ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
              const opponentGraveyardAAU = opponentFieldAAU?.graveyard || [];
              const opponentMonstersAAU = opponentGraveyardAAU.filter((c: any) => {
                const cardType = c.type || c.cardType;
                return cardType === 'Monster';
              });
              if (opponentMonstersAAU.length === 0) {
                client.emit('duelError', { message: 'Autonomous Action Unit: não há monstros no cemitério do oponente.' });
                return;
              }
              const playerMonstersAAU = playerFieldAAU?.monsters || [null, null, null, null, null];
              const emptyMonsterZone = playerMonstersAAU.findIndex((m: any) => m === null || m === undefined);
              if (emptyMonsterZone === -1) {
                client.emit('duelError', { message: 'Autonomous Action Unit: não há espaço no seu campo para invocar o monstro.' });
                return;
              }
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao processar Autonomous Action Unit' });
                return;
              }
              // Pagar 1500 LP
              if (isPlayer1Check) {
                (updatedDuel as any).player1LifePoints = Math.max(0, (updatedDuel as any).player1LifePoints - 1500);
              } else {
                (updatedDuel as any).player2LifePoints = Math.max(0, (updatedDuel as any).player2LifePoints - 1500);
              }
              // Colocar a carta no campo (zona de spell/trap) se estava na mão
              let spellTrapZoneIndexAAU = zoneIndex;
              if (!cardIsOnField) {
                if (!playerFieldAAU.spellTrap || !Array.isArray(playerFieldAAU.spellTrap)) {
                  playerFieldAAU.spellTrap = [null, null, null, null, null];
                }
                spellTrapZoneIndexAAU = playerFieldAAU.spellTrap.findIndex((s: any) => s === null || s === undefined);
                if (spellTrapZoneIndexAAU === -1) {
                  client.emit('duelError', { message: 'Autonomous Action Unit: não há zona de Magia/Armadilha disponível.' });
                  return;
                }
                const hand = playerFieldAAU.hand || [];
                const cardIndexInHand = hand.findIndex((c: any) => c && (c.instanceId === cardToProcess.instanceId || (c.id || c.cardId) === cardId));
                if (cardIndexInHand >= 0) {
                  const cardToPlace = hand.splice(cardIndexInHand, 1)[0];
                  playerFieldAAU.spellTrap[spellTrapZoneIndexAAU] = { ...cardToPlace, position: 'face-up' };
                  playerFieldAAU.hand = hand;
                }
              } else {
                if (playerFieldAAU.spellTrap && playerFieldAAU.spellTrap[zoneIndex]) {
                  playerFieldAAU.spellTrap[zoneIndex].position = 'face-up';
                }
                spellTrapZoneIndexAAU = zoneIndex;
              }
              await this.duelsService.updateDuelInDatabase(duelId, {
                player1Field: (updatedDuel as any).player1Field,
                player2Field: (updatedDuel as any).player2Field,
                player1LifePoints: (updatedDuel as any).player1LifePoints,
                player2LifePoints: (updatedDuel as any).player2LifePoints,
              } as any);
              await this.duelsService.setPendingChoice(duelId, {
                type: 'AUTONOMOUS_ACTION_UNIT',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: {
                  spellTrapZoneIndex: spellTrapZoneIndexAAU,
                  cardId: cardId,
                  cardName: cardToProcess.name || cardToProcess.cardName,
                  cardInstanceId: cardToProcess.instanceId,
                  cardData: cardToProcess,
                  opponentGraveyard: opponentMonstersAAU,
                }
              });
              const updatedDuelAAU = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              client.emit('autonomousActionUnitShowOpponentGraveyard', {
                opponentGraveyard: opponentMonstersAAU,
                duelId: duelId,
              });
              if (updatedDuelAAU) {
                this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuelAAU);
              }
              return;
            }
            
            if (isLastWill) {
              // Last Will precisa criar modal manualmente (mesmo padrão do Monster Reborn)
              console.log(`✨ [handleDuelAction] Last Will detectada - criando modal manualmente`);
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              const playerField = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              
              // Verificar se um monstro foi destruído neste turno
              const monsterDestroyedThisTurn = playerField?.monsterDestroyedThisTurn || false;
              
              if (!monsterDestroyedThisTurn) {
                console.log(`❌ [handleDuelAction] Last Will: Nenhum monstro foi destruído no campo do jogador neste turno - não pode ser ativada`);
                client.emit('duelError', { message: 'Last Will não pode ser ativada: Nenhum monstro foi destruído no seu campo neste turno.' });
                return;
              }
              
              // Coletar monstros do deck com ATK <= 1500
              const deck = playerField?.deck || [];
              const eligibleMonsters: Array<{ monster: any; deckIndex: number }> = [];
              
              deck.forEach((c: any, deckIndex: number) => {
                if (!c) return;
                
                // Verificar se é um monstro
                const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
                const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
                if (!isMonster) return;
                
                // Verificar se tem ATK <= 1500
                const atk = Number(c.atk || c.cardAtk || 0);
                if (isNaN(atk) || atk > 1500) return;
                
                // Adicionar com o índice real do deck
                eligibleMonsters.push({
                  ...c,
                  deckIndex: deckIndex,
                });
              });
              
              if (eligibleMonsters.length > 0) {
                // Verificar se updatedDuel não é null
                if (!updatedDuel) {
                  console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar modal para Last Will`);
                  client.emit('duelError', { message: 'Erro ao processar Last Will' });
                  return;
                }
                
                // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo ainda)
                // zoneIndex só é usado se a carta está no campo em "set"
                const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
                
                // Criar pendingChoice manualmente
                const lastWillPendingChoice: any = {
                  type: 'LAST_WILL',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: {
                    cardId: cardId,
                    cardName: cardToProcess.name || cardToProcess.cardName,
                    zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                    cardInstanceId: cardToProcess.instanceId,
                    cardData: cardToProcess,
                    cardWasOnField: cardIsOnField,
                    originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                    eligibleMonsters: eligibleMonsters,
                  }
                };
                await this.duelsService.setPendingChoice(duelId, lastWillPendingChoice);
                
                // Buscar duelo atualizado com pendingChoice
                updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
                
                console.log(`📤 [handleDuelAction] Emitindo lastWillShowDeck apenas para quem ativou (com pendingChoice)`);
                console.log(`📤 [handleDuelAction] eligibleMonsters: ${eligibleMonsters.length}, cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('lastWillShowDeck', {
                  eligibleMonsters: eligibleMonsters,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento lastWillShowDeck emitido apenas para o cliente que ativou`);
                
                // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
                if (updatedDuel) {
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
                }
                return; // Aguardar escolha do usuário
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhum monstro com ATK <= 1500 no deck para Last Will invocar`);
                client.emit('duelError', { message: 'Nenhum monstro com ATK <= 1500 no deck.' });
                return;
              }
            }
            
            if (isMonsterReincarnation) {
              // Monster Reincarnation precisa criar modal manualmente (dois passos: descartar carta, escolher monstro)
              console.log(`✨ [handleDuelAction] Monster Reincarnation detectada - criando modal manualmente`);
              
              if (!updatedDuel) {
                console.error(`❌ [handleDuelAction] updatedDuel é null - não é possível criar modal para Monster Reincarnation`);
                client.emit('duelError', { message: 'Erro ao processar Monster Reincarnation' });
                return;
              }
              
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              if (!updatedDuel) {
                console.error(`❌ [handleDuelAction] updatedDuel é null após mudança de fase - não é possível criar modal para Monster Reincarnation`);
                client.emit('duelError', { message: 'Erro ao processar Monster Reincarnation' });
                return;
              }
              
              const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
              const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
              const playerHand = playerField?.hand || [];
              
              console.log(`✨ [handleDuelAction] Monster Reincarnation ativada - isPlayer1: ${isPlayer1}, playerHand: ${playerHand.length} cartas`);
              
              // IMPORTANTE: Se a carta está na mão, não usar zoneIndex (carta não vai para o campo ainda)
              // zoneIndex só é usado se a carta está no campo em "set"
              const zoneIndexForPendingChoice = cardIsOnField ? zoneIndex : null;
              
              // Filtrar a Monster Reincarnation da lista de cartas descartáveis se ela estiver na mão
              let handForDiscard = playerHand;
              if (!cardIsOnField) {
                // Se a carta está na mão, remover ela da lista de cartas que podem ser descartadas
                // Usar múltiplos critérios de comparação para garantir que encontramos a carta correta
                const cardToProcessId = cardToProcess.idCarta || cardToProcess.id || cardToProcess.cardId;
                const cardToProcessName = (cardToProcess.name || cardToProcess.cardName || '').toLowerCase();
                
                console.log(`🔍 [handleDuelAction] Filtrando Monster Reincarnation da mão:`);
                console.log(`🔍 [handleDuelAction] cardToProcess.instanceId: ${cardToProcess.instanceId}`);
                console.log(`🔍 [handleDuelAction] cardToProcess.idCarta/id/cardId: ${cardToProcessId}`);
                console.log(`🔍 [handleDuelAction] cardToProcess.name: ${cardToProcessName}`);
                console.log(`🔍 [handleDuelAction] playerHand antes do filtro: ${playerHand.length} cartas`);
                
                handForDiscard = playerHand.filter((c: any) => {
                  if (!c) return true;
                  
                  const cIdCarta = c.idCarta || c.id || c.cardId;
                  const cName = (c.name || c.cardName || '').toLowerCase();
                  
                  // Comparar por instanceId se ambos tiverem (mais preciso)
                  if (c.instanceId && cardToProcess.instanceId) {
                    if (c.instanceId === cardToProcess.instanceId) {
                      console.log(`🚫 [handleDuelAction] Carta removida por instanceId: ${c.instanceId}`);
                      return false; // É a mesma carta, remover
                    }
                  }
                  
                  // Comparar por idCarta/id/cardId E nome
                  if (cIdCarta && cardToProcessId && String(cIdCarta) === String(cardToProcessId)) {
                    if (cName === cardToProcessName && cName.includes('monster reincarnation')) {
                      console.log(`🚫 [handleDuelAction] Carta removida por ID e nome: ${cIdCarta} - ${cName}`);
                      return false; // É a mesma carta, remover
                    }
                  }
                  
                  // Comparar por nome (se for Monster Reincarnation)
                  if (cName.includes('monster reincarnation') && cardToProcessName.includes('monster reincarnation')) {
                    // Se os IDs também coincidem, é a mesma carta
                    if (cIdCarta && cardToProcessId && String(cIdCarta) === String(cardToProcessId)) {
                      console.log(`🚫 [handleDuelAction] Carta removida por nome e ID: ${cName} - ${cIdCarta}`);
                      return false; // É a mesma carta, remover
                    }
                    // Se não tem ID mas o nome é exatamente igual, também remover (pode ser a mesma carta)
                    if (cName === cardToProcessName) {
                      console.log(`🚫 [handleDuelAction] Carta removida por nome exato: ${cName}`);
                      return false; // É provavelmente a mesma carta, remover
                    }
                  }
                  
                  // Comparar por referência do objeto (último recurso)
                  if (c === cardToProcess) {
                    console.log(`🚫 [handleDuelAction] Carta removida por referência do objeto`);
                    return false; // É a mesma carta, remover
                  }
                  
                  return true; // Não é a mesma carta, manter
                });
                console.log(`✅ [handleDuelAction] Monster Reincarnation removida da lista de descarte. Cartas disponíveis: ${handForDiscard.length} (de ${playerHand.length})`);
              }
              
              if (handForDiscard.length === 0) {
                console.log(`⚠️ [handleDuelAction] Jogador não tem cartas na mão para descartar (após remover Monster Reincarnation)`);
                client.emit('duelError', { message: 'Você não tem outras cartas na mão para descartar' });
                return;
              }
              
              // Criar pendingChoice para o primeiro passo (descartar carta da mão)
              const monsterReincarnationPendingChoice: any = {
                type: 'MONSTER_REINCARNATION',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: {
                  cardId: cardId,
                  cardName: cardToProcess.name || cardToProcess.cardName,
                  zoneIndex: zoneIndexForPendingChoice, // null se estava na mão
                  cardInstanceId: cardToProcess.instanceId,
                  cardData: cardToProcess,
                  cardWasOnField: cardIsOnField,
                  originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
                  step: 1, // Primeiro passo: descartar carta da mão
                }
              };
              await this.duelsService.setPendingChoice(duelId, monsterReincarnationPendingChoice);
              
              // Buscar duelo atualizado com pendingChoice
              updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
              
              console.log(`📤 [handleDuelAction] Emitindo monsterReincarnationShowHand apenas para quem ativou (com pendingChoice)`);
              console.log(`📤 [handleDuelAction] handForDiscard: ${handForDiscard.length} cartas, cardIsOnField: ${cardIsOnField}, zoneIndex: ${zoneIndexForPendingChoice}`);
              // Emitir apenas para o cliente que ativou a carta
              // IMPORTANTE: Enviar handForDiscard (sem Monster Reincarnation) ao invés de playerHand
              client.emit('monsterReincarnationShowHand', {
                playerHand: handForDiscard,
                duelId: duelId,
              });
              console.log(`✅ [handleDuelAction] Evento monsterReincarnationShowHand emitido apenas para o cliente que ativou`);
              
              // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
              if (updatedDuel) {
                this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
              }
              return; // Aguardar escolha do usuário
            }
            
            // Se processCardEffect criou pendingChoice, adicionar informações da carta
            if (createdPendingChoice && updatedDuel && (updatedDuel as any).pendingChoice) {
              // Se a carta está na mão e está em BATTLE ou STANDBY, mudar fase automaticamente
              if (!cardIsOnField && updatedDuel) {
                if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                  console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1`);
                  updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                }
              }
              
              // Adicionar informações da carta ao pendingChoice para poder colocá-la no campo depois
              (updatedDuel as any).pendingChoice.data = {
                ...(updatedDuel as any).pendingChoice.data,
                cardId: cardId,
                cardName: cardToProcess.name || cardToProcess.cardName,
                zoneIndex: zoneIndex,
                cardInstanceId: cardToProcess.instanceId,
                cardData: cardToProcess, // Guardar dados completos da carta
                cardWasOnField: cardIsOnField, // Indica se a carta estava no campo (em "set") ou na mão
                originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null // Se estava no campo, guardar posição original
              };
              
              // Salvar pendingChoice atualizado
              await this.duelsService.setPendingChoice(duelId, (updatedDuel as any).pendingChoice);
              
              // Buscar duelo atualizado novamente
              updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
              
              console.log(`✅ [handleDuelAction] PendingChoice criado - modal será aberto, carta permanece na mão`);
              // Emitir atualização do duelo (com pendingChoice mas sem carta no campo)
              this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
              return; // Aguardar escolha do usuário
            } else {
              // IMPORTANTE: Apenas Confiscation, Graceful Charity e Forceful Sentry criam pendingChoice
              // Todas as outras cartas devem processar imediatamente quando o usuário completar o fluxo
              // Se cancelar ou atualizar a página, a carta volta ao estado anterior
              console.log(`ℹ️ [handleDuelAction] Carta não cria pendingChoice - processando normalmente`);
              // Continuar com o fluxo normal de colocar no campo e processar
            }
          }
          
          // Se não precisa de modal ou está no campo, comportamento normal
          // ANTES de colocar no campo, mudar fase se necessário (quando carta vem da mão)
          if (!cardIsOnField && updatedDuel) {
            if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
              console.log(`🔄 [handleDuelAction] Carta da mão em BATTLE - mudando para MAIN2 antes de colocar no campo`);
              updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao mudar para fase MAIN2' });
                return;
              }
            } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
              console.log(`🔄 [handleDuelAction] Carta da mão em STANDBY - mudando para MAIN1 antes de colocar no campo`);
              updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao mudar para fase MAIN1' });
                return;
              }
            }
          }
          
          // Colocar no campo e processar efeito
          // IMPORTANTE: Só colocar no campo se zoneIndex é válido
          if (zoneIndex === undefined || zoneIndex === null) {
            console.error(`❌ [handleDuelAction] zoneIndex é undefined/null - não é possível colocar carta no campo`);
            client.emit('duelError', { message: 'Zona inválida para colocar carta no campo' });
            return;
          }
          
          console.log(`✅ [handleDuelAction] Colocando carta no campo e processando efeito`);
          try {
            result = await this.duelsService.placeCardOnField(duelId, userId, cardId, zoneIndex, finalPosition, cardType, false);
          } catch (error) {
            console.error(`❌ [handleDuelAction] Erro ao chamar placeCardOnField:`, error);
            client.emit('duelError', { message: 'Erro ao colocar carta no campo' });
            return;
          }
          
          if (!result || !result.success) {
            console.error(`❌ [handleDuelAction] placeCardOnField falhou:`, result);
            client.emit('duelError', { message: result?.message || 'Erro ao colocar carta no campo' });
            return;
          }
          
          // Buscar duelo atualizado após colocar no campo
          await new Promise(resolve => setTimeout(resolve, 100));
          updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        } else {
          // Para cartas especiais, comportamento normal (coloca no campo e processa efeito depois)
          // Buscar duelo atual
          updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
          if (!updatedDuel) {
            client.emit('duelError', { message: 'Duelo não encontrado' });
            return;
          }
          
          // Verificar se a carta está no campo
          const isPlayer1Check = Number(updatedDuel.player1Id) === Number(userId);
          const playerFieldCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          let cardIsOnField = false;
          
          if (zoneIndex !== undefined && zoneIndex !== null && zoneIndex >= 0 && zoneIndex < 5 &&
              playerFieldCheck && playerFieldCheck.spellTrap && playerFieldCheck.spellTrap[zoneIndex]) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            if (cardOnFieldId === cardId || String(cardOnFieldId).toLowerCase() === String(cardId).toLowerCase()) {
              cardIsOnField = true;
            }
          }
          
          // ANTES de colocar no campo, mudar fase se necessário (quando carta vem da mão)
          if (!cardIsOnField && updatedDuel) {
            if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
              console.log(`🔄 [handleDuelAction] Carta especial da mão em BATTLE - mudando para MAIN2 antes de colocar no campo`);
              updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao mudar para fase MAIN2' });
                return;
              }
            } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
              console.log(`🔄 [handleDuelAction] Carta especial da mão em STANDBY - mudando para MAIN1 antes de colocar no campo`);
              updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
              if (!updatedDuel) {
                client.emit('duelError', { message: 'Erro ao mudar para fase MAIN1' });
                return;
              }
            }
          }
          
          // IMPORTANTE: Change Of Heart e Brain Control agora são tratadas no bloco needsModalBeforeField acima
          // Não colocar no campo aqui - será feito quando o usuário confirmar a escolha
          // IMPORTANTE: Só colocar no campo se zoneIndex é válido
          if (zoneIndex === undefined || zoneIndex === null) {
            console.error(`❌ [handleDuelAction] zoneIndex é undefined/null para carta especial - não é possível colocar carta no campo`);
            client.emit('duelError', { message: 'Zona inválida para colocar carta no campo' });
            return;
          }
          
          try {
            result = await this.duelsService.placeCardOnField(duelId, userId, cardId, zoneIndex, finalPosition, cardType);
          } catch (error) {
            console.error(`❌ [handleDuelAction] Erro ao chamar placeCardOnField:`, error);
            client.emit('duelError', { message: 'Erro ao colocar carta no campo' });
            return;
          }
          
          if (!result || !result.success) {
            console.error(`❌ [handleDuelAction] placeCardOnField falhou:`, result);
            client.emit('duelError', { message: result?.message || 'Erro ao colocar carta no campo' });
            return;
          }
          
          // SEMPRE buscar do banco de dados após salvar para garantir que temos os dados atualizados
          // Aguardar um pequeno delay para garantir que o banco foi atualizado
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log(`🔍 [handleDuelAction] Buscando duelo atualizado do banco após salvar carta...`);
          // Forçar busca do banco ignorando cache
          updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        }
        
        // Persistir log de ação para SET_MONSTER / SET_SPELL_TRAP / ACTIVATE_SPELL_TRAP (logs salvos no duelo)
        if (result && result.success && (actionType === 'SET_MONSTER' || actionType === 'SET_SPELL_TRAP' || actionType === 'ACTIVATE_SPELL_TRAP')) {
          const cardName = actionData.cardName || cardId || 'Carta';
          if (actionType === 'SET_MONSTER') {
            await this.createAndEmitDuelLog(duelId, userId, 'SET_MONSTER', `Colocou monstro em ${finalPosition}`);
          } else if (actionType === 'SET_SPELL_TRAP') {
            await this.createAndEmitDuelLog(duelId, userId, 'SET_SPELL_TRAP', `Colocou ${cardName} em "set"`);
          } else {
            await this.createAndEmitDuelLog(duelId, userId, 'ACTIVATE_SPELL', `Ativou ${cardName}`);
          }
        }
        
        // Verificar se é Confiscation, GracefulCharity ou MonsterReborn ANTES de processar
        // Usar o cardId original passado na ação para detectar mais cedo
        // NOTA: originalCardId e originalCardName já foram declarados acima
        // NOTA: isChangeOfHeartCardEarly já foi declarado acima, reutilizar
        let isMonsterRebornCard = false;
        let isChangeOfHeartCard = isChangeOfHeartCardEarly; // Reutilizar verificação anterior
        let isBrainControlCard = false;
        let isSoulTakerCard = false;
        let isLightningStormCard = false;
        let isUnitedWeStandCard = false;
        let isMagePowerCard = false;
        let isMysticalSpaceTyphoonCard = false;
        let isReinforcementOfTheArmyCard = false;
        
        // NOTA: isConfiscationCard, isGracefulCharityCard e isForcefulSentryCard já foram declarados como const acima
        // e não podem ser reatribuídos. Essas verificações são redundantes e foram removidas.
        
        if (originalCardId === 'monsterreborn' || originalCardName === 'monster reborn' ||
            (typeof originalCardId === 'string' && originalCardId.includes('monsterreborn')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('monster reborn'))) {
          isMonsterRebornCard = true;
        } else if (originalCardId === 'ReinforcementOfTheArmy' || originalCardId === 'ROTA' ||
                   originalCardName === 'reinforcement of the army' ||
                   (typeof originalCardId === 'string' && originalCardId.toLowerCase().includes('reinforcementofthearmy')) ||
                   (typeof originalCardId === 'string' && originalCardId.toLowerCase().includes('rota')) ||
                   (typeof originalCardName === 'string' && originalCardName.toLowerCase().includes('reinforcement of the army'))) {
          isReinforcementOfTheArmyCard = true;
          console.log(`✅ [handleDuelAction] Reinforcement Of The Army detectada pelo cardId original: ${originalCardId}`);
        } else if (isChangeOfHeartCardEarly) {
          // isChangeOfHeartCard já foi definido acima como isChangeOfHeartCardEarly
          console.log(`✅ [handleDuelAction] ChangeOfHeart detectada - originalCardId: ${originalCardId}, originalCardName: ${originalCardName}, cardId: ${cardId}`);
        } else if (cardId === 'BrainControl' ||
                   cardId === 'braincontrol' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('braincontrol'))) {
          isBrainControlCard = true;
          console.log(`✅ [handleDuelAction] BrainControl detectada pelo cardId original: ${cardId}`);
        } else if (cardId === 'SoulTaker' ||
                   cardId === 'soultaker' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('soultaker')) ||
                   originalCardName === 'soul taker' ||
                   (typeof originalCardName === 'string' && originalCardName.includes('soul taker'))) {
          isSoulTakerCard = true;
          console.log(`✅ [handleDuelAction] SoulTaker detectada pelo cardId original: ${cardId}`);
        } else if (cardId === 'UnitedWeStand' ||
                   cardId === 'unitedwestand' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('unitedwestand')) ||
                   originalCardName === 'United We Stand' ||
                   (typeof originalCardName === 'string' && originalCardName.toLowerCase().includes('united we stand'))) {
          isUnitedWeStandCard = true;
          console.log(`✅ [handleDuelAction] UnitedWeStand detectada pelo cardId/nome: ${cardId}/${originalCardName}`);
        } else if (cardId === 'MagePower' ||
                   cardId === 'magepower' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('magepower')) ||
                   originalCardName === 'Mage Power' ||
                   (typeof originalCardName === 'string' && originalCardName.toLowerCase().includes('mage power'))) {
          isMagePowerCard = true;
          console.log(`✅ [handleDuelAction] MagePower detectada pelo cardId/nome: ${cardId}/${originalCardName}`);
        } else if (cardId === 'MysticalSpaceTyphoon' ||
                   cardId === 'mysticalspacetyphoon' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('mysticalspacetyphoon'))) {
          isMysticalSpaceTyphoonCard = true;
          console.log(`✅ [handleDuelAction] MysticalSpaceTyphoon detectada pelo cardId original: ${cardId}`);
        } else if (cardId === 'LightningStorm' ||
                   cardId === 'lightningstorm' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('lightningstorm')) ||
                   (typeof originalCardName === 'string' && originalCardName.includes('lightning storm'))) {
          isLightningStormCard = true;
          console.log(`✅ [handleDuelAction] LightningStorm detectada pelo cardId/nome: ${cardId}/${originalCardName}`);
        }
        
        // Também verificar no campo após placeCardOnField (fallback)
        if (updatedDuel && (actionType === 'SET_SPELL_TRAP' || actionType === 'ACTIVATE_SPELL_TRAP') && finalPosition === 'face-up') {
          const isPlayer1Check = Number(updatedDuel.player1Id) === Number(userId);
          const playerFieldCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          // Verificar se a carta ainda está no campo (Confiscation)
          if (playerFieldCheck && playerFieldCheck.spellTrap) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            
            // NOTA: isConfiscationCard e isGracefulCharityCard já foram declarados como const acima
            // Não podemos reatribuí-los aqui. As verificações abaixo são redundantes.
            if (cardOnField) {
              const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
              const cardName = cardOnField.name || cardOnField.cardName;
              
              console.log(`🔍 [handleDuelAction] Verificando carta no campo - zoneIndex: ${zoneIndex}, idCarta: "${cardIdCarta}", name: "${cardName}"`);
            }
          }
          
          // Não verificar no cemitério como fallback - isso causaria falsos positivos
          // A verificação no cemitério só deve ser feita se a carta atual foi identificada como GracefulCharity
          // e já foi processada (movida para o cemitério)
        }
        
        // Se for Confiscation, emitir evento APENAS se estiver em face-up (ativada)
        // Não processar efeito se a carta foi apenas colocada em "set"
        if (isConfiscationCard && finalPosition === 'face-up' && updatedDuel) {
          console.log(`✨ [handleDuelAction] Confiscation detectada no campo após placeCardOnField e está em face-up (ativada)`);
          
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const opponentField = isPlayer1 ? player2Field : player1Field;
          const opponentHand = opponentField?.hand || [];
          
          console.log(`✨ [handleDuelAction] Confiscation ativada - isPlayer1: ${isPlayer1}, opponentHand: ${opponentHand.length} cartas`);
          
          if (opponentHand.length > 0) {
            // Salvar estado de escolha pendente
            await this.duelsService.setPendingChoice(duelId, {
              type: 'CONFISCATION',
              userId: userId,
              turnWhenStarted: updatedDuel.currentTurn,
              phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
              data: { opponentHand: opponentHand }
            });
            
            // Buscar duelo atualizado novamente para ter o pendingChoice
            const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
            if (updatedDuelWithPendingChoice) {
              updatedDuel = updatedDuelWithPendingChoice;
            }
            
            console.log(`📤 [handleDuelAction] Emitindo confiscationShowHand apenas para quem ativou`);
            // Emitir apenas para o cliente que ativou a carta
            client.emit('confiscationShowHand', {
              opponentHand: opponentHand,
              duelId: duelId,
            });
            console.log(`✅ [handleDuelAction] Evento confiscationShowHand emitido apenas para o cliente que ativou`);
            
            // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            // Se oponente não tem cartas, completar efeito imediatamente
            console.log(`⚠️ [handleDuelAction] Oponente não tem cartas na mão - completando efeito do Confiscation`);
            await this.duelsService.processConfiscationChoice(duelId, userId, '');
          }
        } else if (isConfiscationCard && finalPosition === 'set') {
          console.log(`ℹ️ [handleDuelAction] Confiscation colocada em "set" - efeito não será processado até ser ativada`);
        }
        
        // Se for GracefulCharity, processar efeito (comprar 3, ir para cemitério) e depois pedir descarte de 2
        // IMPORTANTE: Garantir que o efeito rode ANTES de abrir o modal (evita "continua na mão" e "pede descartar de novo")
        if (isGracefulCharityCard && updatedDuel && finalPosition === 'face-up') {
          const isPlayer1Check = Number(updatedDuel.player1Id) === Number(userId);
          const playerFieldCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          let cardOnField = playerFieldCheck?.spellTrap?.[zoneIndex];
          const stillOnField = cardOnField && (
            (cardOnField.idCarta || cardOnField.id || cardOnField.cardId || '').toString().toLowerCase().includes('gracefulcharity') ||
            (cardOnField.name || cardOnField.cardName || '').toLowerCase().includes('graceful charity')
          );
          
          // Se a carta ainda está no campo, o efeito (comprar 3 + ir para cemitério) ainda não foi aplicado — executar agora
          if (stillOnField) {
            console.log(`✨ [handleDuelAction] GracefulCharity ainda no campo - executando efeito (comprar 3, mover para cemitério)`);
            try {
              await this.cardEffectsService.processCardEffect(
                duelId.toString(),
                updatedDuel as any,
                isPlayer1Check,
                cardOnField,
                zoneIndex
              );
              await new Promise(resolve => setTimeout(resolve, 150));
              updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              if (!updatedDuel) {
                console.error(`❌ [handleDuelAction] Não foi possível obter duelo após processar Graceful Charity`);
                return;
              }
            } catch (err) {
              console.error(`❌ [handleDuelAction] Erro ao processar efeito Graceful Charity:`, err);
              client.emit('duelError', { message: 'Erro ao ativar Graceful Charity' });
              return;
            }
          }
          
          const fieldForCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          const isReallyGracefulCharity = stillOnField || (fieldForCheck?.graveyard && (() => {
            const last = fieldForCheck.graveyard[fieldForCheck.graveyard.length - 1];
            if (!last) return false;
            const id = (last.idCarta || last.id || last.cardId || '').toString().toLowerCase();
            const name = (last.name || last.cardName || '').toLowerCase();
            return id.includes('gracefulcharity') || name.includes('graceful charity');
          })());
          
          if (isReallyGracefulCharity) {
            console.log(`✨ [handleDuelAction] GracefulCharity confirmada - abrindo modal de descarte`);
            
            const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
            const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
            const playerHand = playerField?.hand || [];
            
            console.log(`✨ [handleDuelAction] GracefulCharity - isPlayer1: ${isPlayer1}, playerHand: ${playerHand.length} cartas`);
            
            if (playerHand.length >= 2) {
              await this.duelsService.setPendingChoice(duelId, {
                type: 'GRACEFUL_CHARITY',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: { playerHand: playerHand }
              });
              
              const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              if (updatedDuelWithPendingChoice) {
                updatedDuel = updatedDuelWithPendingChoice;
              }
              
              console.log(`📤 [handleDuelAction] Emitindo gracefulCharityShowHand (mão com ${playerHand.length} cartas)`);
              client.emit('gracefulCharityShowHand', {
                playerHand: playerHand,
                duelId: duelId,
              });
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              console.log(`⚠️ [handleDuelAction] Menos de 2 cartas (${playerHand.length}) - efeito concluído sem descarte`);
              await this.duelsService.clearPendingChoice(duelId, false);
            }
          } else {
            console.log(`⚠️ [handleDuelAction] Carta não é GracefulCharity - ignorando`);
          }
        }

        // Se for MonsterReborn, verificar no cemitério (já foi processada e movida)
        // MonsterReborn agora é tratada no bloco needsModalBeforeField acima
        // Não precisa mais verificar aqui se está no cemitério
        
        // Se for Reinforcement Of The Army, verificar no cemitério (já foi processada e movida)
        if (isReinforcementOfTheArmyCard && updatedDuel && (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up') {
          console.log(`✨ [handleDuelAction] Reinforcement Of The Army detectada - aguardando processCardEffect terminar`);
          
          // Aguardar um pouco para garantir que o processCardEffect terminou e moveu a carta para o cemitério
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Buscar duelo atualizado novamente
          updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
          
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Não foi possível buscar duelo atualizado para Reinforcement Of The Army`);
            return;
          }
          
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          const playerGraveyard = playerField?.graveyard || [];
          
          // Verificar se Reinforcement Of The Army está no cemitério
          const rotaInGraveyard = playerGraveyard.find((c: any) => {
            if (!c) return false;
            const cardId = c.idCarta || c.id || c.cardId;
            const cardName = (c.name || c.cardName || '').toLowerCase();
            const cardIdLower = String(cardId || '').toLowerCase();
            return cardIdLower === 'reinforcementofthearmy' || 
                   cardIdLower === 'rota' ||
                   cardIdLower.includes('reinforcementofthearmy') ||
                   cardIdLower.includes('rota') ||
                   cardName.includes('reinforcement of the army') ||
                   cardName.includes('reinforcementofthearmy');
          });
          
          console.log(`🔍 [handleDuelAction] Reinforcement Of The Army no cemitério? ${!!rotaInGraveyard}, playerGraveyard.length: ${playerGraveyard.length}`);
          if (playerGraveyard.length > 0) {
            console.log(`🔍 [handleDuelAction] Primeiras cartas no cemitério:`, playerGraveyard.slice(0, 3).map((c: any) => ({
              id: c?.idCarta || c?.id || c?.cardId,
              name: c?.name || c?.cardName
            })));
          }
          
          if (rotaInGraveyard) {
            console.log(`✨ [handleDuelAction] Reinforcement Of The Army detectada no cemitério após placeCardOnField`);
            
            // Coletar monstros Warrior de Level 4 ou menos do deck
            const deck = playerField?.deck || [];
            
            // Mapear com índices reais do deck
            const warriorMonsters: Array<any> = [];
            deck.forEach((c: any, deckIndex: number) => {
              if (!c) return;
              
              // Verificar se é um monstro
              const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
              const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
              if (!isMonster) return;
              
              // Verificar se é Warrior
              const race = (c.race || c.cardRace || '').toString().toUpperCase().trim();
              const isWarrior = race === 'WARRIOR' || race === 'GUERREIRO' || race.includes('WARRIOR');
              if (!isWarrior) return;
              
              // Verificar se é Level 4 ou menos
              const level = Number(c.level || c.cardLevel || 0);
              if (isNaN(level) || level < 1 || level > 4) return;
              
              // Adicionar com o índice real do deck
              warriorMonsters.push({
                ...c,
                deckIndex: deckIndex, // Usar o índice real do array, não findIndex
              });
            });
            
            if (warriorMonsters.length > 0) {
              console.log(`📤 [handleDuelAction] Emitindo reinforcementOfTheArmyShowDeck apenas para quem ativou`);
              // Emitir apenas para o cliente que ativou a carta
              client.emit('reinforcementOfTheArmyShowDeck', {
                warriorMonsters: warriorMonsters,
                duelId: duelId,
              });
              console.log(`✅ [handleDuelAction] Evento reinforcementOfTheArmyShowDeck emitido apenas para o cliente que ativou`);
            } else {
              console.log(`ℹ️ [handleDuelAction] Nenhum monstro Warrior de Level 4 ou menos no deck`);
            }
          }
        }
        
        // Last Will agora é tratada no bloco needsModalBeforeField acima
        // Não precisa mais verificar aqui se está no cemitério
        
        // Change Of Heart e Brain Control agora são tratadas no bloco needsModalBeforeField acima
        // Não precisam mais ser processadas aqui após colocar no campo
        
        // Soul Taker agora é tratado no bloco acima (mesmo padrão do Mystical Space Typhoon)
        // Removido código duplicado - a lógica está no bloco needsModalBeforeField
        
        // UnitedWeStand - Mostrar monstros disponíveis para equipar
        // Só mostrar modal se a carta foi ativada normalmente (não via drag and drop)
        // Se a carta já foi equipada via drag and drop, equippedToMonsterZoneIndex já estará definido
        if (isUnitedWeStandCard && updatedDuel && (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up') {
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          // Verificar se UnitedWeStand está no campo
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const cardOnField = playerField.spellTrap[zoneIndex];
            const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            const cardName = cardOnField.name || cardOnField.cardName;
            
            const cardNameLower = (cardName || '').toString().toLowerCase();
            if (cardIdCarta === 'UnitedWeStand' || 
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('unitedwestand')) ||
                cardNameLower === 'united we stand' || 
                cardNameLower.includes('united we stand')) {
              
              // Verificar se a carta já foi equipada via drag and drop
              // Se equippedToMonsterZoneIndex estiver definido, significa que já foi equipada
              if (cardOnField.equippedToMonsterZoneIndex !== undefined && cardOnField.equippedToMonsterZoneIndex !== null) {
                console.log(`ℹ️ [handleDuelAction] UnitedWeStand já foi equipada via drag and drop - não mostrar modal`);
                // Não mostrar modal, a carta já foi equipada
              } else {
                console.log(`✨ [handleDuelAction] UnitedWeStand detectada no campo após placeCardOnField`);
                
                // Coletar apenas monstros FACE-UP do campo do jogador (attack ou defense, não set)
                const availableMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
                (playerField?.monsters || []).forEach((m: any, index: number) => {
                  if (m && m !== null && m !== undefined) {
                    const position = m.position || 'attack';
                    // Só pode equipar monstros face-up (attack ou defense, não set)
                    if (position === 'attack' || position === 'defense') {
                      availableMonstersWithIndices.push({ monster: m, zoneIndex: index });
                    }
                  }
                });
                
                const availableMonsters = availableMonstersWithIndices.map((am: any) => ({
                  ...am.monster,
                  zoneIndex: am.zoneIndex, // Incluir zoneIndex no objeto do monstro
                }));
                
                // IMPORTANTE: UnitedWeStand não cria pendingChoice - o frontend gerencia o estado temporário
                if (availableMonsters.length > 0) {
                  console.log(`📤 [handleDuelAction] Emitindo unitedWeStandShowMonsters apenas para quem ativou (sem pendingChoice)`);
                  // Emitir apenas para o cliente que ativou a carta
                  client.emit('unitedWeStandShowMonsters', {
                    availableMonsters: availableMonsters,
                    duelId: duelId,
                  });
                  console.log(`✅ [handleDuelAction] Evento unitedWeStandShowMonsters emitido apenas para o cliente que ativou`);
                } else {
                  console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo para equipar UnitedWeStand`);
                  // Emitir evento mesmo sem monstros para mostrar modal vazio
                  client.emit('unitedWeStandShowMonsters', {
                    availableMonsters: [],
                    duelId: duelId,
                  });
                }
              }
            }
          }
        }
        
        // MagePower - Mostrar monstros disponíveis para equipar
        // Só mostrar modal se a carta foi ativada normalmente (não via drag and drop)
        // Se a carta já foi equipada via drag and drop, equippedToMonsterZoneIndex já estará definido
        if (isMagePowerCard && updatedDuel && (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up') {
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          // Verificar se MagePower está no campo
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const cardOnField = playerField.spellTrap[zoneIndex];
            const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            const cardName = cardOnField.name || cardOnField.cardName;
            
            const magePowerNameLower = (cardName || '').toString().toLowerCase();
            if (cardIdCarta === 'MagePower' ||
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('magepower')) ||
                magePowerNameLower === 'mage power' ||
                magePowerNameLower.includes('mage power')) {
              
              // Verificar se a carta já foi equipada via drag and drop
              // Se equippedToMonsterZoneIndex estiver definido, significa que já foi equipada
              if (cardOnField.equippedToMonsterZoneIndex !== undefined && cardOnField.equippedToMonsterZoneIndex !== null) {
                console.log(`ℹ️ [handleDuelAction] MagePower já foi equipada via drag and drop - não mostrar modal`);
                // Não mostrar modal, a carta já foi equipada
              } else {
                console.log(`✨ [handleDuelAction] MagePower detectada no campo após placeCardOnField`);
                
                // Coletar apenas monstros FACE-UP do campo do jogador (attack ou defense, não set)
                const availableMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
                (playerField?.monsters || []).forEach((m: any, index: number) => {
                  if (m && m !== null && m !== undefined) {
                    const position = m.position || 'attack';
                    // Só pode equipar monstros face-up (attack ou defense, não set)
                    if (position === 'attack' || position === 'defense') {
                      availableMonstersWithIndices.push({ monster: m, zoneIndex: index });
                    }
                  }
                });
                
                const availableMonsters = availableMonstersWithIndices.map((am: any) => ({
                  ...am.monster,
                  zoneIndex: am.zoneIndex, // Incluir zoneIndex no objeto do monstro
                }));
                
                // IMPORTANTE: MagePower não cria pendingChoice - o frontend gerencia o estado temporário
                if (availableMonsters.length > 0) {
                  console.log(`📤 [handleDuelAction] Emitindo magePowerShowMonsters apenas para quem ativou (sem pendingChoice)`);
                  // Emitir apenas para o cliente que ativou a carta
                  client.emit('magePowerShowMonsters', {
                    availableMonsters: availableMonsters,
                    duelId: duelId,
                  });
                  console.log(`✅ [handleDuelAction] Evento magePowerShowMonsters emitido apenas para o cliente que ativou`);
                } else {
                  console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo para equipar MagePower`);
                  // Emitir evento mesmo sem monstros para mostrar modal vazio
                  client.emit('magePowerShowMonsters', {
                    availableMonsters: [],
                    duelId: duelId,
                  });
                }
              }
            }
          }
        }
        
        // Verificar se a carta ativada é The Forceful Sentry (apenas se não for Confiscation, GracefulCharity, MonsterReborn, ChangeOfHeart, BrainControl, UnitedWeStand, MagePower, MysticalSpaceTyphoon ou ReinforcementOfTheArmy)
        // IMPORTANTE: Não excluir isForcefulSentryCard da verificação - ela precisa ser processada aqui
        if ((actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up' && !isConfiscationCard && !isGracefulCharityCard && !isMonsterRebornCard && !isChangeOfHeartCard && !isBrainControlCard && !isSoulTakerCard && !isLightningStormCard && !isUnitedWeStandCard && !isMagePowerCard && !isMysticalSpaceTyphoonCard && !isReinforcementOfTheArmyCard && updatedDuel) {
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const playerField = isPlayer1 ? player1Field : player2Field;
          const activatedCard = playerField?.spellTrap?.[zoneIndex];
          
          if (activatedCard) {
            const cardId = activatedCard.idCarta || activatedCard.id || activatedCard.cardId;
            const cardName = (activatedCard.name || activatedCard.cardName || '').toLowerCase();
            
            // Verificar se é TheForcefulSentry usando múltiplos critérios
            const isForcefulSentryActivated = cardId === 'TheForcefulSentry' || 
                cardId === 'theforcefulsentry' ||
                (typeof cardId === 'string' && cardId.toLowerCase().includes('forcefulsentry')) ||
                cardName === 'the forceful sentry' ||
                (typeof cardName === 'string' && cardName.includes('forceful sentry')) ||
                isForcefulSentryCard; // Usar também a verificação anterior
            
            console.log(`🔍 [handleDuelAction] Verificando The Forceful Sentry - cardId: ${cardId}, cardName: ${cardName}, isForcefulSentryCard: ${isForcefulSentryCard}, isForcefulSentryActivated: ${isForcefulSentryActivated}`);
            
            if (isForcefulSentryActivated) {
              // Emitir evento especial para mostrar mão do oponente
              const opponentField = isPlayer1 ? player2Field : player1Field;
              const opponentHand = opponentField?.hand || [];
              
              if (opponentHand.length > 0) {
                // Salvar estado de escolha pendente
                await this.duelsService.setPendingChoice(duelId, {
                  type: 'FORCEFUL_SENTRY',
                  userId: userId,
                  turnWhenStarted: updatedDuel.currentTurn,
                  phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                  data: { opponentHand: opponentHand }
                });
                
                // Buscar duelo atualizado novamente para ter o pendingChoice
                const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                if (updatedDuelWithPendingChoice) {
                  updatedDuel = updatedDuelWithPendingChoice;
                }
                
                console.log(`✨ [handleDuelAction] The Forceful Sentry ativada - enviando ${opponentHand.length} cartas da mão do oponente apenas para quem ativou`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('forcefulSentryShowHand', {
                  opponentHand: opponentHand,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento forcefulSentryShowHand emitido apenas para o cliente que ativou`);
                
                // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                // Se oponente não tem cartas, completar efeito imediatamente
                console.log(`⚠️ [handleDuelAction] Oponente não tem cartas na mão - completando efeito`);
                await this.duelsService.processForcefulSentryChoice(duelId, userId, '');
                
                const finalDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
                if (finalDuel) {
                  const finalPlayer1Field = (finalDuel as any).player1Field;
                  const finalPlayer2Field = (finalDuel as any).player2Field;
                  const finalTurnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(finalDuel);
                  
                  const finalDuelData = {
                    id: finalDuel.id,
                    player1Id: finalDuel.player1Id,
                    player2Id: finalDuel.player2Id,
                    player1: (finalDuel as any).player1,
                    player2: (finalDuel as any).player2,
                    player1LifePoints: finalDuel.player1LifePoints,
                    player2LifePoints: finalDuel.player2LifePoints,
                    currentTurn: finalDuel.currentTurn,
                    currentPhase: finalDuel.currentPhase || 'MAIN1',
                    status: finalDuel.status,
                    duelTime: (finalDuel as any).duelTime || 0,
                    turnTime: (finalDuel as any).turnTime || 90,
                    turnTimeRemaining: finalTurnTimeRemaining,
                    turnStartedAt: (finalDuel as any).turnStartedAt,
                    player1Field: finalPlayer1Field,
                    player2Field: finalPlayer2Field,
                    createdAt: finalDuel.createdAt,
                    updatedAt: finalDuel.updatedAt,
                  };
                  
                  this.server.to(`duel_${duelId}`).emit('duelUpdate', finalDuelData);
                }
              }
              return; // Não processar mais nada para TheForcefulSentry
            }
          }
        }
        
        // Se for Confiscation, GracefulCharity, ForcefulSentry ou MonsterReborn, já foram processados acima
        // Se não for, emitir duelUpdate normalmente
        if (!isConfiscationCard && !isGracefulCharityCard && !isForcefulSentryCard && !isMonsterRebornCard && !isChangeOfHeartCard && !isBrainControlCard && !isSoulTakerCard && !isLightningStormCard && !isUnitedWeStandCard && !isMagePowerCard && !isReinforcementOfTheArmyCard) {
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Não foi possível buscar duelo atualizado do banco`);
            client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
            return;
          }
          
          // Nota: A mudança de fase já foi feita antes de colocar a carta no campo (linhas 3996-4012)
          // Não é necessário fazer novamente aqui

          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
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
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          console.log(`📤 [handleDuelAction] Emitindo duelUpdate para todos os clientes na room duel_${duelId}`);
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        } else {
          // Para Confiscation e GracefulCharity, emitir duelUpdate após processar
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Não foi possível buscar duelo atualizado do banco`);
            client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
            return;
          }
          
          // Buscar duelo atualizado novamente para ter o pendingChoice
          const finalUpdatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          if (finalUpdatedDuel) {
            updatedDuel = finalUpdatedDuel;
          }

          // Mudar fase automaticamente ao ativar/colocar carta da mão:
          // - Se está em BATTLE e ativa/coloca uma carta da mão, mudar para MAIN2
          // - Se está em STANDBY e ativa/coloca uma carta da mão, mudar para MAIN1
          if (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP' || actionType === 'SET_MONSTER') {
            // Verificar se a carta foi ativada/colocada da mão
            // Para ACTIVATE_SPELL_TRAP: zoneIndex é null/undefined se vem da mão
            // Para SET_SPELL_TRAP e SET_MONSTER: sempre vem da mão (não está no campo ainda)
            const isFromHand = actionType === 'ACTIVATE_SPELL_TRAP' 
              ? (actionData.zoneIndex === undefined || actionData.zoneIndex === null)
              : true; // SET_SPELL_TRAP e SET_MONSTER sempre vêm da mão
            
            if (isFromHand && updatedDuel) {
              if (updatedDuel.currentPhase === TurnPhase.BATTLE) {
                console.log(`🔄 [handleDuelAction] Carta especial ${actionType} da mão em BATTLE - mudando para MAIN2`);
                updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN2);
                if (!updatedDuel) {
                  client.emit('duelError', { message: 'Erro ao mudar para fase MAIN2' });
                  return;
                }
              } else if (updatedDuel.currentPhase === TurnPhase.STANDBY) {
                console.log(`🔄 [handleDuelAction] Carta especial ${actionType} da mão em STANDBY - mudando para MAIN1`);
                updatedDuel = await this.duelsService.goToPhase(duelId, TurnPhase.MAIN1);
                if (!updatedDuel) {
                  client.emit('duelError', { message: 'Erro ao mudar para fase MAIN1' });
                  return;
                }
              }
            }
          }
          
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
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
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuel as any).pendingChoice || null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          console.log(`📤 [handleDuelAction] Emitindo duelUpdate após processar Confiscation/GracefulCharity`);
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'MONSTER_REBORN_CHOICE') {
        // Processar escolha do MonsterReborn
        const { chosenMonster } = actionData;

        if (!chosenMonster || chosenMonster.graveyard === undefined || chosenMonster.index === undefined) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        // Buscar duelo e pendingChoice
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }

        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'MONSTER_REBORN' || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Escolha pendente inválida' });
          return;
        }

        const cardData = pendingChoice.data.cardData;
        const cardWasOnField = pendingChoice.data.cardWasOnField;
        const zoneIndexForCard = pendingChoice.data.zoneIndex;
        let zoneWhereCardWasPlaced: number | null = null; // Quando ativa da mão, guardar zona onde foi colocada para mover ao cemitério depois

        // Se a carta estava na mão, removê-la da mão e colocá-la no campo (placeCardOnField não remove quando precisa de modal)
        if (!cardWasOnField && cardData) {
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          let availableZoneIndex = zoneIndexForCard;
          
          if (availableZoneIndex === null || availableZoneIndex === undefined) {
            availableZoneIndex = playerField.spellTrap.findIndex((s: any) => s === null || s === undefined);
            if (availableZoneIndex === -1) {
              client.emit('duelError', { message: 'Não há espaço no campo para ativar a carta' });
              return;
            }
          }

          // Encontrar Monster Reborn na mão (por id ou nome) e removê-la
          const hand = playerField.hand || [];
          const cardIdRef = (cardData.idCarta || cardData.id || cardData.cardId || '').toString().toLowerCase();
          const cardNameRef = (cardData.name || cardData.cardName || '').toString().toLowerCase();
          const handIndex = hand.findIndex((c: any) => {
            if (!c) return false;
            const id = (c.idCarta || c.id || c.cardId || '').toString().toLowerCase();
            const name = (c.name || c.cardName || '').toString().toLowerCase();
            return id === cardIdRef || id.includes('monsterreborn') || name.includes('monster reborn');
          });

          if (handIndex === -1) {
            client.emit('duelError', { message: 'Monster Reborn não encontrada na mão' });
            return;
          }

          const cardFromHand = playerField.hand.splice(handIndex, 1)[0];
          playerField.spellTrap[availableZoneIndex] = { ...cardFromHand, position: 'face-up' };
          zoneWhereCardWasPlaced = availableZoneIndex;

          await this.duelsService.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
        } else if (cardWasOnField && zoneIndexForCard !== null && zoneIndexForCard !== undefined) {
          // Se estava no campo em "set", apenas virar para "face-up"
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndexForCard]) {
            playerField.spellTrap[zoneIndexForCard].position = 'face-up';
            await this.duelsService.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
        }

        // Buscar duelo atualizado após colocar/virar a carta
        let duelAfterPlacement = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duelAfterPlacement) {
          client.emit('duelError', { message: 'Erro ao buscar duelo após colocar carta' });
          return;
        }

        // Mover MonsterReborn para o cemitério (é uma Normal Spell - vai ao cemitério após o efeito)
        const isPlayer1 = Number(duelAfterPlacement.player1Id) === Number(userId);
        const playerField = isPlayer1 ? (duelAfterPlacement as any).player1Field : (duelAfterPlacement as any).player2Field;
        // Se ativou da mão, usar a zona onde acabamos de colocar; senão usar zoneIndex do pending ou buscar por id/nome
        let finalZoneIndex: number | null | undefined = cardWasOnField ? zoneIndexForCard : zoneWhereCardWasPlaced;
        if (finalZoneIndex === null || finalZoneIndex === undefined || finalZoneIndex < 0) {
          finalZoneIndex = playerField.spellTrap.findIndex((s: any) => {
            if (!s) return false;
            const sid = (s.idCarta || s.id || s.cardId || '').toString().toLowerCase();
            const sname = (s.name || s.cardName || '').toString().toLowerCase();
            const did = (cardData.idCarta || cardData.id || cardData.cardId || '').toString().toLowerCase();
            return sid === did || sid.includes('monsterreborn') || sname.includes('monster reborn');
          });
          if (finalZoneIndex === -1) finalZoneIndex = null;
        }
        
        if (finalZoneIndex !== null && finalZoneIndex !== undefined && finalZoneIndex >= 0 && playerField && playerField.spellTrap && playerField.spellTrap[finalZoneIndex]) {
          const card = playerField.spellTrap[finalZoneIndex];
          const cardId = card.idCarta || card.id || card.cardId;
          const cardName = (card.name || card.cardName || '').toString().toLowerCase();
          const isMonsterReborn = cardId === 'MonsterReborn' || 
                                 cardId === 'monsterreborn' ||
                                 (typeof cardId === 'string' && cardId.toString().toLowerCase().includes('monsterreborn')) ||
                                 cardName.includes('monster reborn');
          
          if (isMonsterReborn && (card.position === 'face-up' || !card.position)) {
            console.log(`🔄 [MONSTER_REBORN_CHOICE] Movendo Monster Reborn da zona ${finalZoneIndex} para o cemitério (ativada da mão: ${!cardWasOnField})`);
            
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            playerField.graveyard.push(card);
            playerField.spellTrap[finalZoneIndex] = null;
            
            // Atualizar no banco
            await this.duelsService.updateDuelInDatabase(duelId, {
              player1Field: (duelAfterPlacement as any).player1Field,
              player2Field: (duelAfterPlacement as any).player2Field,
            } as any);
            
            // Buscar duelo atualizado novamente
            duelAfterPlacement = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          }
        }

        // Processar a escolha do monstro
        const result = await this.duelsService.processMonsterRebornChoice(duelId, userId, chosenMonster);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar pendingChoice
        await this.duelsService.clearPendingChoice(duelId, false);
        
        // Buscar duelo atualizado e emitir atualização
        const updatedDuelAfterChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuelAfterChoice) {
          const player1Field = (updatedDuelAfterChoice as any).player1Field;
          const player2Field = (updatedDuelAfterChoice as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterChoice);
          
          const duelData = {
            id: updatedDuelAfterChoice.id,
            player1Id: updatedDuelAfterChoice.player1Id,
            player2Id: updatedDuelAfterChoice.player2Id,
            player1: (updatedDuelAfterChoice as any).player1 || null,
            player2: (updatedDuelAfterChoice as any).player2 || null,
            player1LifePoints: updatedDuelAfterChoice.player1LifePoints,
            player2LifePoints: updatedDuelAfterChoice.player2LifePoints,
            currentTurn: updatedDuelAfterChoice.currentTurn,
            currentPhase: updatedDuelAfterChoice.currentPhase,
            status: updatedDuelAfterChoice.status,
            turnCounter: updatedDuelAfterChoice.turnCounter || 1,
            duelTime: (updatedDuelAfterChoice as any).duelTime || 0,
            turnTime: (updatedDuelAfterChoice as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuelAfterChoice as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuelAfterChoice as any).pendingChoice || null,
            createdAt: updatedDuelAfterChoice.createdAt,
            updatedAt: updatedDuelAfterChoice.updatedAt,
          };
          
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'PREMATURE_BURIAL_CHOICE') {
        const { chosenMonster } = actionData;
        if (!chosenMonster || chosenMonster.index === undefined) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }
        let duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'PREMATURE_BURIAL' || Number(pendingChoice.userId) !== Number(userId)) {
          client.emit('duelError', { message: 'Escolha pendente inválida' });
          return;
        }
        const cardData = pendingChoice.data.cardData;
        const cardWasOnField = pendingChoice.data.cardWasOnField;
        const zoneIndexForCard = pendingChoice.data.zoneIndex;
        let spellTrapZoneIndex: number | null = null;
        if (!cardWasOnField && cardData) {
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          const availableZoneIndex = playerField.spellTrap.findIndex((s: any) => s === null || s === undefined);
          if (availableZoneIndex === -1) {
            client.emit('duelError', { message: 'Não há espaço no campo para ativar a carta' });
            return;
          }
          const hand = playerField.hand || [];
          const cardIdRef = (cardData.idCarta || cardData.id || cardData.cardId || '').toString().toLowerCase();
          const cardNameRef = (cardData.name || cardData.cardName || '').toString().toLowerCase();
          const handIndex = hand.findIndex((c: any) => {
            if (!c) return false;
            const id = (c.idCarta || c.id || c.cardId || '').toString().toLowerCase();
            const name = (c.name || c.cardName || '').toString().toLowerCase();
            return id === cardIdRef || id.includes('prematureburial') || name.includes('premature burial');
          });
          if (handIndex === -1) {
            client.emit('duelError', { message: 'Premature Burial não encontrada na mão' });
            return;
          }
          const cardFromHand = playerField.hand.splice(handIndex, 1)[0];
          playerField.spellTrap[availableZoneIndex] = { ...cardFromHand, position: 'face-up' };
          spellTrapZoneIndex = availableZoneIndex;
          await this.duelsService.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          await new Promise((r) => setTimeout(r, 50));
        } else if (cardWasOnField && zoneIndexForCard != null) {
          spellTrapZoneIndex = zoneIndexForCard;
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField?.spellTrap?.[zoneIndexForCard]) {
            playerField.spellTrap[zoneIndexForCard].position = 'face-up';
            await this.duelsService.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
        }
        duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo' });
          return;
        }
        if (spellTrapZoneIndex === null || spellTrapZoneIndex === undefined || spellTrapZoneIndex < 0) {
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          spellTrapZoneIndex = playerField.spellTrap.findIndex((s: any) => {
            if (!s) return false;
            const sid = (s.idCarta || s.id || s.cardId || '').toString().toLowerCase();
            return sid.includes('prematureburial') || (s.name || s.cardName || '').toString().toLowerCase().includes('premature burial');
          });
        }
        if (spellTrapZoneIndex === -1 || spellTrapZoneIndex === null || spellTrapZoneIndex === undefined) {
          client.emit('duelError', { message: 'Premature Burial não encontrada no campo' });
          return;
        }
        const monsterIndex = typeof chosenMonster.index === 'number' ? chosenMonster.index : parseInt(String(chosenMonster.index), 10);
        if (isNaN(monsterIndex)) {
          client.emit('duelError', { message: 'Índice do monstro inválido' });
          return;
        }
        const result = await this.duelsService.processPrematureBurialChoice(duelId, userId, { index: monsterIndex }, spellTrapZoneIndex);
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar Premature Burial' });
          return;
        }
        await this.duelsService.clearPendingChoice(duelId, false);
        await this.createAndEmitDuelLog(duelId, userId, 'ACTIVATE_SPELL', `Premature Burial: reviveu um monstro do cemitério e equipou`);
        const updatedDuel = result.duel || await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
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
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            turnCounter: updatedDuel.turnCounter || 1,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field,
            player2Field,
            pendingChoice: null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'REINFORCEMENT_OF_THE_ARMY_CHOICE') {
        // Processar escolha do Reinforcement Of The Army
        const { deckIndex } = actionData;

        if (deckIndex === undefined || deckIndex === null) {
          client.emit('duelError', { message: 'Escolha de carta inválida' });
          return;
        }

        const result = await this.duelsService.processReinforcementOfTheArmyChoice(duelId, userId, deckIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Criar log de ação
        await this.createAndEmitDuelLog(duelId, userId, 'REINFORCEMENT_OF_THE_ARMY', `Reinforcement Of The Army adicionou um monstro Warrior à mão`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);
        
        const duelData = {
          id: updatedDuel.id,
          player1Id: updatedDuel.player1Id,
          player2Id: updatedDuel.player2Id,
          player1: (updatedDuel as any).player1 || null,
          player2: (updatedDuel as any).player2 || null,
          player1LifePoints: updatedDuel.player1LifePoints,
          player2LifePoints: updatedDuel.player2LifePoints,
          currentTurn: updatedDuel.currentTurn,
          currentPhase: updatedDuel.currentPhase,
          status: updatedDuel.status,
          turnCounter: updatedDuel.turnCounter || 1,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'LAST_WILL_CHOICE') {
        // Processar escolha do Last Will
        const { deckIndex, zoneIndex } = actionData;

        if (deckIndex === undefined || deckIndex === null || zoneIndex === undefined || zoneIndex === null) {
          client.emit('duelError', { message: 'Escolha de carta ou zona inválida para Last Will' });
          return;
        }

        // Buscar duelo e pendingChoice antes de processar
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }

        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'LAST_WILL' || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Escolha pendente inválida para Last Will' });
          return;
        }

        const isPlayer1 = Number(duel.player1Id) === Number(userId);
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

        // Mover Last Will para o cemitério se estiver no campo
        const finalZoneIndex = pendingChoice.data?.zoneIndex;
        if (finalZoneIndex !== null && finalZoneIndex !== undefined && playerField && playerField.spellTrap && playerField.spellTrap[finalZoneIndex]) {
          const card = playerField.spellTrap[finalZoneIndex];
          const cardId = card.idCarta || card.id || card.cardId;
          const cardName = (card.name || card.cardName || '').toLowerCase();
          const isLastWill = cardId === 'LastWill' || 
                           cardId === 'lastwill' ||
                           (typeof cardId === 'string' && cardId.toLowerCase().includes('lastwill')) ||
                           cardName.includes('last will');
          
          if (isLastWill && (card.position === 'face-up' || card.position === 'set')) {
            console.log(`🔄 [LAST_WILL_CHOICE] Movendo Last Will da zona ${finalZoneIndex} para o cemitério`);
            
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            playerField.graveyard.push(card);
            playerField.spellTrap[finalZoneIndex] = null;
            
            // Atualizar no banco
            await this.duelsService.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
        } else if (pendingChoice.data?.cardWasOnField === false) {
          // Carta estava na mão - remover da mão e mover para o cemitério
          const cardId = pendingChoice.data?.cardId;
          const cardInstanceId = pendingChoice.data?.cardInstanceId;
          
          if (playerField && playerField.hand && Array.isArray(playerField.hand)) {
            const cardIndex = playerField.hand.findIndex((c: any) => {
              if (cardInstanceId && c.instanceId) {
                return c.instanceId === cardInstanceId;
              }
              const cId = c.idCarta || c.id || c.cardId;
              return cId === cardId || String(cId).toLowerCase() === String(cardId).toLowerCase();
            });
            
            if (cardIndex !== -1) {
              const card = playerField.hand[cardIndex];
              playerField.hand.splice(cardIndex, 1);
              
              if (!playerField.graveyard) {
                playerField.graveyard = [];
              }
              playerField.graveyard.push(card);
              
              console.log(`🔄 [LAST_WILL_CHOICE] Movendo Last Will da mão para o cemitério`);
              
              // Atualizar no banco
              await this.duelsService.updateDuelInDatabase(duelId, {
                player1Field: (duel as any).player1Field,
                player2Field: (duel as any).player2Field,
              } as any);
            }
          }
        }

        const result = await this.cardEffectHandlersService.processLastWillChoice(duelId, userId, deckIndex, zoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha de Last Will' });
          return;
        }

        // Limpar pendingChoice
        await this.duelsService.clearPendingChoice(duelId, false);

        // Criar log de ação
        await this.createAndEmitDuelLog(duelId, userId, 'LAST_WILL_EFFECT', `Last Will invocou um monstro do deck por invocação especial`);

        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);
        
        const duelData = {
          id: updatedDuel.id,
          player1Id: updatedDuel.player1Id,
          player2Id: updatedDuel.player2Id,
          player1: (updatedDuel as any).player1 || null,
          player2: (updatedDuel as any).player2 || null,
          player1LifePoints: updatedDuel.player1LifePoints,
          player2LifePoints: updatedDuel.player2LifePoints,
          currentTurn: updatedDuel.currentTurn,
          currentPhase: updatedDuel.currentPhase,
          status: updatedDuel.status,
          turnCounter: updatedDuel.turnCounter || 1,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };

        // Emitir atualização do duelo para todos os clientes
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'AUTONOMOUS_ACTION_UNIT_CHOICE') {
        // Processar escolha do Autonomous Action Unit
        const { chosenMonsterIndex } = actionData;

        if (chosenMonsterIndex === undefined || chosenMonsterIndex === null) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        const result = await this.duelsService.processAutonomousActionUnitChoice(duelId, userId, chosenMonsterIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Buscar duelo atualizado do banco (processAutonomousActionUnitChoice já limpou pendingChoice e salvou os campos)
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
          pendingChoice: (updatedDuel as any).pendingChoice,
        };

        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'CHANGE_OF_HEART_CHOICE') {
        // Processar escolha do ChangeOfHeart
        const { chosenMonsterZoneIndex } = actionData;

        if (chosenMonsterZoneIndex === undefined || chosenMonsterZoneIndex === null || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        // Buscar duelo e pendingChoice
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }

        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'CHANGE_OF_HEART' || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Escolha pendente inválida' });
          return;
        }

        const cardData = pendingChoice.data.cardData;
        const cardWasOnField = pendingChoice.data.cardWasOnField;
        const zoneIndexForCard = pendingChoice.data.zoneIndex;
        
        // Variável para armazenar o zoneIndex final onde a carta está
        let finalZoneIndex: number | null = null;

        // Se a carta estava na mão, colocá-la no campo agora
        if (!cardWasOnField && cardData) {
          // Encontrar um zoneIndex disponível
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          let availableZoneIndex = zoneIndexForCard;
          
          // Se zoneIndex não foi especificado, encontrar um disponível
          if (availableZoneIndex === null || availableZoneIndex === undefined) {
            availableZoneIndex = playerField.spellTrap.findIndex((s: any) => s === null || s === undefined);
            if (availableZoneIndex === -1) {
              client.emit('duelError', { message: 'Não há espaço no campo para ativar a carta' });
              return;
            }
          }

          // Colocar a carta no campo
          const cardId = cardData.idCarta || cardData.id || cardData.cardId;
          const cardType = cardData.type || cardData.cardType || 'Spell';
          const placeResult = await this.duelsService.placeCardOnField(duelId, userId, cardId, availableZoneIndex, 'face-up', cardType);
          
          if (!placeResult || !placeResult.success) {
            client.emit('duelError', { message: placeResult?.message || 'Erro ao colocar carta no campo' });
            return;
          }
          
          // Armazenar o zoneIndex onde a carta foi colocada
          finalZoneIndex = availableZoneIndex;
        } else if (cardWasOnField && zoneIndexForCard !== null && zoneIndexForCard !== undefined) {
          // Se estava no campo em "set", apenas virar para "face-up"
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndexForCard]) {
            playerField.spellTrap[zoneIndexForCard].position = 'face-up';
            await this.duelsService.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
          
          // Armazenar o zoneIndex onde a carta está
          finalZoneIndex = zoneIndexForCard;
        }

        // Processar a escolha do monstro
        const result = await this.duelsService.processChangeOfHeartChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Change Of Heart permanece no campo até o fim do turno ou ser destruída
        // Não mover para o cemitério imediatamente - será movida no fim do turno em advanceToNextTurn
        
        // Buscar duelo atualizado após processar a escolha
        let duelAfterChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duelAfterChoice) {
          client.emit('duelError', { message: 'Erro ao buscar duelo após processar escolha' });
          return;
        }

        // Limpar pendingChoice
        await this.duelsService.clearPendingChoice(duelId);
        
        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        // Usar duelAfterChoice se já foi atualizado, senão buscar novamente
        const updatedDuelAfterChoice = duelAfterChoice || await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterChoice) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuelAfterChoice as any).player1Field;
        const player2Field = (updatedDuelAfterChoice as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterChoice);
        
        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterChoice as any).player1 || null;
        const player2 = (updatedDuelAfterChoice as any).player2 || null;
        
        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [CHANGE_OF_HEART_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }
        
        const duelData = {
          id: updatedDuelAfterChoice.id,
          player1Id: updatedDuelAfterChoice.player1Id,
          player2Id: updatedDuelAfterChoice.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterChoice.player1LifePoints,
          player2LifePoints: updatedDuelAfterChoice.player2LifePoints,
          currentTurn: updatedDuelAfterChoice.currentTurn,
          currentPhase: updatedDuelAfterChoice.currentPhase,
          status: updatedDuelAfterChoice.status,
          turnCounter: updatedDuelAfterChoice.turnCounter || 1,
          duelTime: (updatedDuelAfterChoice as any).duelTime || 0,
          turnTime: (updatedDuelAfterChoice as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterChoice as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterChoice as any).pendingChoice || null,
          createdAt: updatedDuelAfterChoice.createdAt,
          updatedAt: updatedDuelAfterChoice.updatedAt,
        };

        console.log(`✅ [CHANGE_OF_HEART_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'BRAIN_CONTROL_CHOICE') {
        // Processar escolha do BrainControl
        const { chosenMonsterZoneIndex } = actionData;

        if (chosenMonsterZoneIndex === undefined || chosenMonsterZoneIndex === null || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        // Buscar duelo e pendingChoice
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }

        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'BRAIN_CONTROL' || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Escolha pendente inválida' });
          return;
        }

        const cardData = pendingChoice.data.cardData;
        const cardWasOnField = pendingChoice.data.cardWasOnField;
        const zoneIndexForCard = pendingChoice.data.zoneIndex;

        // Se a carta estava na mão, colocá-la no campo agora
        if (!cardWasOnField && cardData) {
          // Encontrar um zoneIndex disponível
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          let availableZoneIndex = zoneIndexForCard;
          
          // Se zoneIndex não foi especificado, encontrar um disponível
          if (availableZoneIndex === null || availableZoneIndex === undefined) {
            availableZoneIndex = playerField.spellTrap.findIndex((s: any) => s === null || s === undefined);
            if (availableZoneIndex === -1) {
              client.emit('duelError', { message: 'Não há espaço no campo para ativar a carta' });
              return;
            }
          }

          // Colocar a carta no campo
          const cardId = cardData.idCarta || cardData.id || cardData.cardId;
          const cardType = cardData.type || cardData.cardType || 'Spell';
          const placeResult = await this.duelsService.placeCardOnField(duelId, userId, cardId, availableZoneIndex, 'face-up', cardType);
          
          if (!placeResult || !placeResult.success) {
            client.emit('duelError', { message: placeResult?.message || 'Erro ao colocar carta no campo' });
            return;
          }
        } else if (cardWasOnField && zoneIndexForCard !== null && zoneIndexForCard !== undefined) {
          // Se estava no campo em "set", apenas virar para "face-up"
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndexForCard]) {
            playerField.spellTrap[zoneIndexForCard].position = 'face-up';
            await this.duelsService.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
        }

        // Processar a escolha do monstro
        const result = await this.duelsService.processBrainControlChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Buscar duelo atualizado após processar a escolha
        let duelAfterBrainControl = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duelAfterBrainControl) {
          client.emit('duelError', { message: 'Erro ao buscar duelo após processar escolha' });
          return;
        }

        // Brain Control permanece no campo (face-up) enquanto controla o monstro.
        // Será movida para o cemitério no fim do turno (advanceToNextTurn) ou quando for destruída (MST, Harpie's, etc.).

        // Limpar pendingChoice
        await this.duelsService.clearPendingChoice(duelId);
        
        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        // Usar duelAfterBrainControl se já foi atualizado, senão buscar novamente
        const updatedDuelAfterBrainControl = duelAfterBrainControl || await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterBrainControl) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuelAfterBrainControl as any).player1Field;
        const player2Field = (updatedDuelAfterBrainControl as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterBrainControl);
        
        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterBrainControl as any).player1 || null;
        const player2 = (updatedDuelAfterBrainControl as any).player2 || null;
        
        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [BRAIN_CONTROL_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }
        
        const duelData = {
          id: updatedDuelAfterBrainControl.id,
          player1Id: updatedDuelAfterBrainControl.player1Id,
          player2Id: updatedDuelAfterBrainControl.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterBrainControl.player1LifePoints,
          player2LifePoints: updatedDuelAfterBrainControl.player2LifePoints,
          currentTurn: updatedDuelAfterBrainControl.currentTurn,
          currentPhase: updatedDuelAfterBrainControl.currentPhase,
          status: updatedDuelAfterBrainControl.status,
          turnCounter: updatedDuelAfterBrainControl.turnCounter || 1,
          duelTime: (updatedDuelAfterBrainControl as any).duelTime || 0,
          turnTime: (updatedDuelAfterBrainControl as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterBrainControl as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterBrainControl as any).pendingChoice || null,
          createdAt: updatedDuelAfterBrainControl.createdAt,
          updatedAt: updatedDuelAfterBrainControl.updatedAt,
        };

        console.log(`✅ [BRAIN_CONTROL_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'SOUL_TAKER_CHOICE') {
        // Processar escolha do SoulTaker
        const { chosenMonsterZoneIndex } = actionData;

        if (chosenMonsterZoneIndex === undefined || chosenMonsterZoneIndex === null || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        const result = await this.duelsService.processSoulTakerChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Não há pendingChoice para limpar (não é mais usado)

        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));

        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterSoulTaker = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterSoulTaker) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuelAfterSoulTaker as any).player1Field;
        const player2Field = (updatedDuelAfterSoulTaker as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterSoulTaker);

        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterSoulTaker as any).player1 || null;
        const player2 = (updatedDuelAfterSoulTaker as any).player2 || null;

        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [SOUL_TAKER_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }

        const duelData = {
          id: updatedDuelAfterSoulTaker.id,
          player1Id: updatedDuelAfterSoulTaker.player1Id,
          player2Id: updatedDuelAfterSoulTaker.player2Id,
          player1LifePoints: updatedDuelAfterSoulTaker.player1LifePoints,
          player2LifePoints: updatedDuelAfterSoulTaker.player2LifePoints,
          currentTurn: updatedDuelAfterSoulTaker.currentTurn,
          currentPhase: updatedDuelAfterSoulTaker.currentPhase,
          player1Field: player1Field,
          player2Field: player2Field,
          turnTimeRemaining: turnTimeRemaining,
          pendingChoice: (updatedDuelAfterSoulTaker as any).pendingChoice || null,
          player1: player1,
          player2: player2,
        };

        console.log(`✅ [SOUL_TAKER_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'LIGHTNING_STORM_CHOICE') {
        const { effect } = actionData;
        if (effect !== 'destroy_attack_monsters' && effect !== 'destroy_spells_traps') {
          client.emit('duelError', { message: 'Escolha de efeito inválida' });
          return;
        }
        const result = await this.duelsService.processLightningStormChoice(duelId, userId, effect);
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar Lightning Storm' });
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        const updatedDuelAfterLS = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterLS) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        const player1Field = (updatedDuelAfterLS as any).player1Field;
        const player2Field = (updatedDuelAfterLS as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterLS);
        const duelData = {
          id: updatedDuelAfterLS.id,
          player1Id: updatedDuelAfterLS.player1Id,
          player2Id: updatedDuelAfterLS.player2Id,
          player1: (updatedDuelAfterLS as any).player1 || null,
          player2: (updatedDuelAfterLS as any).player2 || null,
          player1LifePoints: updatedDuelAfterLS.player1LifePoints,
          player2LifePoints: updatedDuelAfterLS.player2LifePoints,
          currentTurn: updatedDuelAfterLS.currentTurn,
          currentPhase: updatedDuelAfterLS.currentPhase,
          status: updatedDuelAfterLS.status,
          duelTime: (updatedDuelAfterLS as any).duelTime || 0,
          turnTime: (updatedDuelAfterLS as any).turnTime || 90,
          turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterLS as any).turnStartedAt,
          player1Field,
          player2Field,
          pendingChoice: null,
          createdAt: updatedDuelAfterLS.createdAt,
          updatedAt: updatedDuelAfterLS.updatedAt,
        };
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'UNITED_WE_STAND_CHOICE') {
        // Processar escolha do UnitedWeStand
        const rawIndex = actionData?.chosenMonsterZoneIndex;
        const chosenMonsterZoneIndex = typeof rawIndex === 'number' ? rawIndex : parseInt(String(rawIndex), 10);

        if (Number.isNaN(chosenMonsterZoneIndex) || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        const result = await this.duelsService.processUnitedWeStandChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar pendingChoice para não reabrir o modal após equipar
        await this.duelsService.clearPendingChoice(duelId, false);

        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));

        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterUnitedWeStand = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterUnitedWeStand) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuelAfterUnitedWeStand as any).player1Field;
        const player2Field = (updatedDuelAfterUnitedWeStand as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterUnitedWeStand);

        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterUnitedWeStand as any).player1 || null;
        const player2 = (updatedDuelAfterUnitedWeStand as any).player2 || null;

        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [UNITED_WE_STAND_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }

        const duelData = {
          id: updatedDuelAfterUnitedWeStand.id,
          player1Id: updatedDuelAfterUnitedWeStand.player1Id,
          player2Id: updatedDuelAfterUnitedWeStand.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterUnitedWeStand.player1LifePoints,
          player2LifePoints: updatedDuelAfterUnitedWeStand.player2LifePoints,
          currentTurn: updatedDuelAfterUnitedWeStand.currentTurn,
          currentPhase: updatedDuelAfterUnitedWeStand.currentPhase,
          status: updatedDuelAfterUnitedWeStand.status,
          turnCounter: updatedDuelAfterUnitedWeStand.turnCounter || 1,
          duelTime: (updatedDuelAfterUnitedWeStand as any).duelTime || 0,
          turnTime: (updatedDuelAfterUnitedWeStand as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterUnitedWeStand as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterUnitedWeStand as any).pendingChoice || null,
          createdAt: updatedDuelAfterUnitedWeStand.createdAt,
          updatedAt: updatedDuelAfterUnitedWeStand.updatedAt,
        };

        console.log(`✅ [UNITED_WE_STAND_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'MAGE_POWER_CHOICE') {
        // Processar escolha do MagePower
        const rawIndex = actionData?.chosenMonsterZoneIndex;
        const chosenMonsterZoneIndex = typeof rawIndex === 'number' ? rawIndex : parseInt(String(rawIndex), 10);

        if (Number.isNaN(chosenMonsterZoneIndex) || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        const result = await this.duelsService.processMagePowerChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar pendingChoice para não reabrir o modal após equipar
        await this.duelsService.clearPendingChoice(duelId, false);

        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));

        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterMagePower = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterMagePower) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuelAfterMagePower as any).player1Field;
        const player2Field = (updatedDuelAfterMagePower as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterMagePower);

        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterMagePower as any).player1 || null;
        const player2 = (updatedDuelAfterMagePower as any).player2 || null;

        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [MAGE_POWER_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }

        const duelData = {
          id: updatedDuelAfterMagePower.id,
          player1Id: updatedDuelAfterMagePower.player1Id,
          player2Id: updatedDuelAfterMagePower.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterMagePower.player1LifePoints,
          player2LifePoints: updatedDuelAfterMagePower.player2LifePoints,
          currentTurn: updatedDuelAfterMagePower.currentTurn,
          currentPhase: updatedDuelAfterMagePower.currentPhase,
          status: updatedDuelAfterMagePower.status,
          turnCounter: updatedDuelAfterMagePower.turnCounter || 1,
          duelTime: (updatedDuelAfterMagePower as any).duelTime || 0,
          turnTime: (updatedDuelAfterMagePower as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterMagePower as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterMagePower as any).pendingChoice || null,
          createdAt: updatedDuelAfterMagePower.createdAt,
          updatedAt: updatedDuelAfterMagePower.updatedAt,
        };

        console.log(`✅ [MAGE_POWER_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'MYSTICAL_SPACE_TYPHOON_CHOICE') {
        // Processar escolha do alvo para Mystical Space Typhoon
        const { targetPlayer, targetZoneIndex, spellTrapZoneIndex } = actionData;

        if (targetPlayer === undefined || targetZoneIndex === undefined || targetZoneIndex < 0 || targetZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de alvo inválida' });
          return;
        }

        console.log(`🔍 [MYSTICAL_SPACE_TYPHOON_CHOICE] Processando escolha - targetPlayer: ${targetPlayer}, targetZoneIndex: ${targetZoneIndex}, spellTrapZoneIndex: ${spellTrapZoneIndex}`);
        console.log(`🔍 [MYSTICAL_SPACE_TYPHOON_CHOICE] Chamando processMysticalSpaceTyphoonChoice...`);
        const result = await this.duelsService.processMysticalSpaceTyphoonChoice(duelId, userId, targetPlayer, targetZoneIndex, spellTrapZoneIndex);

        if (!result.success) {
          console.error(`❌ [MYSTICAL_SPACE_TYPHOON_CHOICE] Erro ao processar: ${result.message}`);
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        console.log(`✅ [MYSTICAL_SPACE_TYPHOON_CHOICE] processMysticalSpaceTyphoonChoice concluído com sucesso`);

        // Usar o duelo retornado pelo serviço (já com monstro devolvido ao oponente se era Change Of Heart/Brain Control)
        let updatedDuelAfterMST = (result as any).duel;
        if (!updatedDuelAfterMST) {
          await new Promise(resolve => setTimeout(resolve, 200));
          console.log(`🔍 [MYSTICAL_SPACE_TYPHOON_CHOICE] Buscando duelo atualizado do banco...`);
          updatedDuelAfterMST = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        }
        if (!updatedDuelAfterMST) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuelAfterMST as any).player1Field;
        const player2Field = (updatedDuelAfterMST as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterMST);

        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterMST as any).player1 || null;
        const player2 = (updatedDuelAfterMST as any).player2 || null;

        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [MYSTICAL_SPACE_TYPHOON_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }

        const duelData = {
          id: updatedDuelAfterMST.id,
          player1Id: updatedDuelAfterMST.player1Id,
          player2Id: updatedDuelAfterMST.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterMST.player1LifePoints,
          player2LifePoints: updatedDuelAfterMST.player2LifePoints,
          currentTurn: updatedDuelAfterMST.currentTurn,
          currentPhase: updatedDuelAfterMST.currentPhase,
          status: updatedDuelAfterMST.status,
          turnCounter: updatedDuelAfterMST.turnCounter || 1,
          duelTime: (updatedDuelAfterMST as any).duelTime || 0,
          turnTime: (updatedDuelAfterMST as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterMST as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterMST as any).pendingChoice || null,
          createdAt: updatedDuelAfterMST.createdAt,
          updatedAt: updatedDuelAfterMST.updatedAt,
        };

        console.log(`✅ [MYSTICAL_SPACE_TYPHOON_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'SNOWMAN_EATER_CHOICE') {
        // Processar escolha de alvo do SnowmanEater
        const { targetPlayer, targetZoneIndex, monsterZoneIndex } = actionData;

        if (targetPlayer === undefined || targetZoneIndex === undefined || 
            targetZoneIndex < 0 || targetZoneIndex >= 5 || 
            monsterZoneIndex === undefined || monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }

        const result = await this.duelsService.processSnowmanEaterChoice(duelId, userId, targetPlayer, targetZoneIndex, monsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Não há pendingChoice para limpar (não é mais usado)

        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));

        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterSnowmanEater = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterSnowmanEater) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuelAfterSnowmanEater as any).player1Field;
        const player2Field = (updatedDuelAfterSnowmanEater as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterSnowmanEater);

        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterSnowmanEater as any).player1 || null;
        const player2 = (updatedDuelAfterSnowmanEater as any).player2 || null;

        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [SNOWMAN_EATER_CHOICE] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }

        const duelData = {
          id: updatedDuelAfterSnowmanEater.id,
          player1Id: updatedDuelAfterSnowmanEater.player1Id,
          player2Id: updatedDuelAfterSnowmanEater.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterSnowmanEater.player1LifePoints,
          player2LifePoints: updatedDuelAfterSnowmanEater.player2LifePoints,
          currentTurn: updatedDuelAfterSnowmanEater.currentTurn,
          currentPhase: updatedDuelAfterSnowmanEater.currentPhase,
          status: updatedDuelAfterSnowmanEater.status,
          turnCounter: updatedDuelAfterSnowmanEater.turnCounter || 1,
          duelTime: (updatedDuelAfterSnowmanEater as any).duelTime || 0,
          turnTime: (updatedDuelAfterSnowmanEater as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterSnowmanEater as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterSnowmanEater as any).pendingChoice || null,
          createdAt: updatedDuelAfterSnowmanEater.createdAt,
          updatedAt: updatedDuelAfterSnowmanEater.updatedAt,
        };

        console.log(`✅ [SNOWMAN_EATER_CHOICE] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}, pendingChoice: ${duelData.pendingChoice}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'BREAKER_REMOVE_COUNTER') {
        // Processar remoção de marcador e escolha de alvo para Breaker The Magical Warrior
        const { monsterZoneIndex, targetPlayer, targetZoneIndex } = actionData;

        if (monsterZoneIndex === undefined || targetPlayer === undefined || targetZoneIndex === undefined || 
            monsterZoneIndex < 0 || monsterZoneIndex >= 5 || targetZoneIndex < 0 || targetZoneIndex >= 5) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }

        const result = await this.duelsService.processBreakerRemoveCounter(duelId, userId, monsterZoneIndex, targetPlayer, targetZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar remoção de marcador' });
          return;
        }

        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));

        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterBreaker = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuelAfterBreaker) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }

        const player1Field = (updatedDuelAfterBreaker as any).player1Field;
        const player2Field = (updatedDuelAfterBreaker as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterBreaker);

        // Garantir que os campos player1 e player2 existam
        const player1 = (updatedDuelAfterBreaker as any).player1 || null;
        const player2 = (updatedDuelAfterBreaker as any).player2 || null;

        // Validar que os campos necessários existem
        if (!player1Field || !player2Field) {
          console.error(`❌ [BREAKER_REMOVE_COUNTER] Campos do duelo incompletos - player1Field: ${!!player1Field}, player2Field: ${!!player2Field}`);
          client.emit('duelError', { message: 'Erro ao buscar dados do duelo atualizado' });
          return;
        }

        const duelData = {
          id: updatedDuelAfterBreaker.id,
          player1Id: updatedDuelAfterBreaker.player1Id,
          player2Id: updatedDuelAfterBreaker.player2Id,
          player1: player1,
          player2: player2,
          player1LifePoints: updatedDuelAfterBreaker.player1LifePoints,
          player2LifePoints: updatedDuelAfterBreaker.player2LifePoints,
          currentTurn: updatedDuelAfterBreaker.currentTurn,
          currentPhase: updatedDuelAfterBreaker.currentPhase,
          status: updatedDuelAfterBreaker.status,
          turnCounter: updatedDuelAfterBreaker.turnCounter || 1,
          duelTime: (updatedDuelAfterBreaker as any).duelTime || 0,
          turnTime: (updatedDuelAfterBreaker as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuelAfterBreaker as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuelAfterBreaker as any).pendingChoice || null,
          createdAt: updatedDuelAfterBreaker.createdAt,
          updatedAt: updatedDuelAfterBreaker.updatedAt,
        };

        console.log(`✅ [BREAKER_REMOVE_COUNTER] Emitindo duelUpdate - id: ${duelData.id}, P1 graveyard: ${(player1Field as any)?.graveyard?.length ?? 0}, P2 graveyard: ${(player2Field as any)?.graveyard?.length ?? 0}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'ATTACK') {
        // Processar ataque
        const { attackerZoneIndex, targetZoneIndex } = actionData;
        
        console.log(`⚔️ [handleDuelAction] ATTACK recebido:`, {
          attackerZoneIndex,
          targetZoneIndex,
          targetZoneIndexType: typeof targetZoneIndex,
          targetZoneIndexAfterNullish: targetZoneIndex ?? null
        });
        
        if (attackerZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do atacante inválida' });
          return;
        }

        // Se está em STANDBY ou MAIN1, mudar automaticamente para BATTLE
        let duelBeforeAttack = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (duelBeforeAttack && (duelBeforeAttack.currentPhase === TurnPhase.STANDBY || duelBeforeAttack.currentPhase === TurnPhase.MAIN1)) {
          duelBeforeAttack = await this.duelsService.goToPhase(duelId, TurnPhase.BATTLE);
          if (!duelBeforeAttack) {
            client.emit('duelError', { message: 'Erro ao mudar para fase BATTLE' });
            return;
          }
        }

        const finalTargetZoneIndex = targetZoneIndex ?? null;
        console.log(`⚔️ [handleDuelAction] Chamando attackMonster com:`, {
          attackerZoneIndex,
          targetZoneIndex: finalTargetZoneIndex
        });
        
        // Obter informações do atacante e alvo ANTES do ataque
        // Isso é necessário para emitir a animação mesmo se o ataque for cancelado por uma armadilha
        // Reutilizar duelBeforeAttack que já foi buscado acima
        if (!duelBeforeAttack) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
        
        const isPlayer1 = Number(duelBeforeAttack.player1Id) === Number(userId);
        const attackerFieldBefore = isPlayer1 ? (duelBeforeAttack as any).player1Field : (duelBeforeAttack as any).player2Field;
        const defenderFieldBefore = isPlayer1 ? (duelBeforeAttack as any).player2Field : (duelBeforeAttack as any).player1Field;
        const attackerBefore = attackerFieldBefore?.monsters?.[attackerZoneIndex];
        const targetBefore = finalTargetZoneIndex !== null && finalTargetZoneIndex !== undefined 
          ? defenderFieldBefore?.monsters?.[finalTargetZoneIndex] 
          : null;
        
        const result = await this.duelsService.attackMonster(duelId, userId, attackerZoneIndex, finalTargetZoneIndex);
        
        // Buscar duelo atualizado do BANCO (garantir BLS canAttackAgainThisTurn e estado persistido)
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        // Criar log de ataque
        if (result.success) {
          const attackerField = (updatedDuel.currentTurn === 1) ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          const attacker = attackerField?.monsters?.[attackerZoneIndex];
          const attackerName = attacker?.name || attacker?.cardName || 'Monstro';
          
          if (targetZoneIndex !== null && targetZoneIndex !== undefined) {
            const defenderField = (updatedDuel.currentTurn === 1) ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
            const defender = defenderField?.monsters?.[targetZoneIndex];
            const defenderName = defender?.name || defender?.cardName || 'Monstro';
            await this.createAndEmitDuelLog(duelId, userId, 'ATTACK', `${attackerName} atacou ${defenderName}`);
          } else {
            await this.createAndEmitDuelLog(duelId, userId, 'DIRECT_ATTACK', `${attackerName} atacou diretamente`);
          }
        }
        
        // Se o ataque foi cancelado por uma armadilha, emitir evento para acionar a animação
        if (!result.success && attackerBefore) {
          // Verificar se a mensagem indica que foi cancelado por uma armadilha
          const message = result.message || '';
          const isTrapCancelled = message.includes('Mirror Force') || 
                                  message.includes('Sakuretsu Armor') || 
                                  message.includes('Dimensional Prison') ||
                                  message.includes('foi ativada');
          
          if (isTrapCancelled) {
            console.log(`🛡️ [handleDuelAction] Ataque cancelado por armadilha - emitindo evento para animação`);
            
            // Emitir evento para acionar a animação de ataque cancelado
            this.server.to(`duel_${duelId}`).emit('attackCancelled', {
              duelId: duelId,
              attackerZoneIndex: attackerZoneIndex,
              targetZoneIndex: finalTargetZoneIndex,
              attackerCard: attackerBefore,
              targetCard: targetBefore,
              message: message,
              isDirectAttack: finalTargetZoneIndex === null || finalTargetZoneIndex === undefined
            });
          }
          
          client.emit('duelError', { message: result.message || 'Erro ao atacar' });
          // Continuar para emitir a atualização do duelo mesmo quando Mirror Force é ativada
        }

        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'BATTLE',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };

        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);

        // Se o duelo terminou (LP chegou a 0), emitir evento duelEnded
        if (updatedDuel.status === DuelStatus.FINISHED) {
          const winnerId = (updatedDuel as any).winnerId;
          const result = (updatedDuel as any).result;
          const winnerName = winnerId === updatedDuel.player1Id 
            ? ((updatedDuel as any).player1?.nickname || 'Jogador 1')
            : ((updatedDuel as any).player2?.nickname || 'Jogador 2');
          
          this.server.to(`duel_${duelId}`).emit('duelEnded', {
            status: DuelStatus.FINISHED,
            result: result,
            winnerId: winnerId,
            player1LifePoints: updatedDuel.player1LifePoints,
            player2LifePoints: updatedDuel.player2LifePoints,
            player1: (updatedDuel as any).player1,
            player2: (updatedDuel as any).player2,
            player1Id: updatedDuel.player1Id,
            player2Id: updatedDuel.player2Id,
            turnCounter: updatedDuel.turnCounter || 0,
            currentTurn: updatedDuel.currentTurn,
            duelTime: updatedDuel.duelTime || 0,
            message: winnerId 
              ? `Duelo encerrado! ${winnerName} venceu!`
              : 'Duelo encerrado em empate!'
          });
        }
      } else if (actionType === 'FLIP_MONSTER') {
        // Virar monstro de face-down para face-up manualmente
        const { zoneIndex } = actionData;
        
        if (zoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona inválida' });
          return;
        }

        const result = await this.duelsService.flipMonster(duelId, userId, zoneIndex);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao virar monstro' });
          return;
        }
      } else if (actionType === 'CHANGE_POSITION') {
        // Mudar posição de monstro (ataque <-> defesa)
        const { zoneIndex, newPosition } = actionData;
        
        if (zoneIndex === undefined || !newPosition) {
          client.emit('duelError', { message: 'Dados inválidos' });
          return;
        }

        if (newPosition !== 'attack' && newPosition !== 'defense') {
          client.emit('duelError', { message: 'Posição inválida. Use "attack" ou "defense"' });
          return;
        }

        const result = await this.duelsService.changeMonsterPosition(duelId, userId, zoneIndex, newPosition);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao mudar posição do monstro' });
          return;
        }
        
        const positionText = newPosition === 'attack' ? 'ataque' : 'defesa';
        await this.createAndEmitDuelLog(duelId, userId, 'CHANGE_POSITION', `Mudou posição do monstro para ${positionText}`);
        
        // Buscar duelo atualizado
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'FORCEFUL_SENTRY_CHOICE') {
        // Processar escolha do The Forceful Sentry
        const { instanceId } = actionData;
        
        // instanceId pode ser vazio se o oponente não tem cartas na mão
        // O service processForcefulSentryChoice já trata esse caso
        const result = await this.duelsService.processForcefulSentryChoice(duelId, userId, instanceId || '');
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }
        
        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);
        
        // Buscar duelo atualizado do banco (forçar para garantir pendingChoice=null)
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        console.log(`📤 [FORCEFUL_SENTRY_CHOICE] Emitindo closePendingChoiceModal para fechar o modal`);
        client.emit('closePendingChoiceModal', { 
          duelId, 
          reason: 'choice_completed',
          cardEffectType: 'forcefulSentry'
        });
        // Também emitir para a room inteira caso o jogador tenha múltiplas abas
        this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { 
          duelId, 
          reason: 'choice_completed',
          cardEffectType: 'forcefulSentry'
        });
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        // Aguardar um pequeno delay antes de emitir duelUpdate para garantir que o modal feche primeiro
        await new Promise(resolve => setTimeout(resolve, 100));
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'MONSTER_REINCARNATION_DISCARD_CHOICE') {
        // Processar descarte de carta da mão (primeiro passo do Monster Reincarnation)
        const { instanceIdToDiscard } = actionData;
        
        if (!instanceIdToDiscard) {
          client.emit('duelError', { message: 'Carta para descartar não especificada' });
          return;
        }
        
        // Buscar duelo e pendingChoice
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
        
        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'MONSTER_REINCARNATION' || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Escolha pendente inválida para Monster Reincarnation' });
          return;
        }
        
        const isPlayer1 = Number(duel.player1Id) === Number(userId);
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        
        // Encontrar a carta na mão
        const cardIndex = playerField.hand.findIndex((c: any) => c && c.instanceId === instanceIdToDiscard);
        if (cardIndex === -1) {
          client.emit('duelError', { message: 'Carta não encontrada na mão' });
          return;
        }
        
        const cardToDiscard = playerField.hand[cardIndex];
        
        // IMPORTANTE: NÃO mover a carta para o cemitério ainda - apenas remover da mão visualmente
        // A carta será movida para o cemitério apenas quando o efeito completo for resolvido (após escolher o monstro)
        playerField.hand.splice(cardIndex, 1);
        
        console.log(`🔄 [MONSTER_REINCARNATION_DISCARD_CHOICE] Carta removida da mão, mas ainda não movida para o cemitério. Será movida após escolher o monstro.`);
        
        // Atualizar pendingChoice para o segundo passo (escolher monstro do cemitério)
        // Guardar a carta descartada no pendingChoice para mover para o cemitério depois
        const updatedPendingChoice = {
          ...pendingChoice,
          data: {
            ...pendingChoice.data,
            step: 2, // Segundo passo: escolher monstro do cemitério
            discardedCardInstanceId: instanceIdToDiscard,
            discardedCard: cardToDiscard, // Guardar a carta completa para mover depois
          }
        };
        await this.duelsService.setPendingChoice(duelId, updatedPendingChoice);
        
        // Atualizar no banco (incluindo pendingChoice atualizado)
        // IMPORTANTE: A carta ainda não foi para o cemitério, apenas removida da mão
        await this.duelsService.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: updatedPendingChoice,
        } as any);
        
        // Coletar monstros do cemitério do jogador (sem incluir a carta descartada ainda)
        const graveyard = playerField.graveyard || [];
        const monsters = graveyard.filter((c: any) => {
          const cardType = c.type || c.cardType;
          return cardType === 'Monster' || cardType === 'Monstro';
        });
        
        if (monsters.length === 0) {
          client.emit('duelError', { message: 'Não há monstros no seu cemitério' });
          
          // Se não há monstros, mover a carta descartada para o cemitério mesmo assim (foi descartada como custo)
          const discardedCard = updatedPendingChoice.data?.discardedCard;
          if (discardedCard) {
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            playerField.graveyard.push(discardedCard);
            console.log(`🔄 [MONSTER_REINCARNATION_DISCARD_CHOICE] Carta descartada movida para o cemitério (sem monstros disponíveis): ${discardedCard.name || discardedCard.cardName}`);
          }
          
          // Atualizar no banco
          await this.duelsService.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          
          // Limpar pendingChoice já que não há monstros
          await this.duelsService.clearPendingChoice(duelId, false);
          
          // Buscar duelo atualizado e emitir
          const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
          if (updatedDuel) {
            console.log(`📤 [MONSTER_REINCARNATION_DISCARD_CHOICE] Emitindo duelUpdate após descarte (sem monstros no cemitério)`);
            this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
          }
          return;
        }
        
        // IMPORTANTE: Não emitir duelUpdate aqui porque a carta descartada ainda não foi para o cemitério
        // A carta será movida para o cemitério apenas quando o monstro for escolhido
        // Por enquanto, apenas remover da mão e abrir o modal do cemitério
        
        console.log(`📤 [MONSTER_REINCARNATION_DISCARD_CHOICE] Carta removida da mão, mas ainda não no cemitério. Mão tem ${playerField.hand.length} cartas`);
        
        // Buscar duelo atualizado para emitir (sem a carta descartada no cemitério ainda)
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          // Emitir atualização apenas para refletir a remoção da mão (carta ainda não está no cemitério)
          this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
        }
        
        // Pequeno delay antes de abrir o modal
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Emitir evento para mostrar modal de escolha de monstro do cemitério
        console.log(`📤 [handleDuelAction] Emitindo monsterReincarnationShowGraveyard para escolher monstro`);
        client.emit('monsterReincarnationShowGraveyard', {
          monsters: monsters,
          duelId: duelId,
        });
      } else if (actionType === 'MONSTER_REINCARNATION_GRAVEYARD_CHOICE') {
        // Processar escolha de monstro do cemitério (segundo passo do Monster Reincarnation)
        const { graveyardIndex } = actionData;
        
        if (graveyardIndex === undefined || graveyardIndex === null) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }
        
        // Buscar duelo e pendingChoice
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
        
        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.type !== 'MONSTER_REINCARNATION' || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Escolha pendente inválida para Monster Reincarnation' });
          return;
        }
        
        const isPlayer1 = Number(duel.player1Id) === Number(userId);
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        
        // Encontrar o monstro no cemitério (usar índice real, não índice de monstros)
        const graveyard = playerField.graveyard || [];
        const monsters: any[] = [];
        let monsterCount = 0;
        let realIndex = -1;
        
        for (let i = 0; i < graveyard.length; i++) {
          const card = graveyard[i];
          const cardType = card.type || card.cardType;
          if (cardType === 'Monster' || cardType === 'Monstro') {
            if (monsterCount === graveyardIndex) {
              realIndex = i;
              break;
            }
            monsterCount++;
          }
        }
        
        if (realIndex === -1) {
          client.emit('duelError', { message: 'Monstro não encontrado no cemitério' });
          return;
        }
        
        const monsterToReturn = graveyard[realIndex];
        
        // Remover do cemitério e adicionar à mão
        graveyard.splice(realIndex, 1);
        if (!playerField.hand) {
          playerField.hand = [];
        }
        playerField.hand.push(monsterToReturn);
        
        // IMPORTANTE: Agora mover a carta descartada para o cemitério (ela estava guardada no pendingChoice)
        const discardedCard = pendingChoice.data?.discardedCard;
        if (discardedCard) {
          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          playerField.graveyard.push(discardedCard);
          console.log(`🔄 [MONSTER_REINCARNATION_GRAVEYARD_CHOICE] Carta descartada movida para o cemitério agora: ${discardedCard.name || discardedCard.cardName}`);
        } else {
          console.warn(`⚠️ [MONSTER_REINCARNATION_GRAVEYARD_CHOICE] Carta descartada não encontrada no pendingChoice.data`);
        }
        
        // Mover Monster Reincarnation para o cemitério se estiver no campo
        const finalZoneIndex = pendingChoice.data?.zoneIndex;
        if (finalZoneIndex !== null && finalZoneIndex !== undefined && playerField && playerField.spellTrap && playerField.spellTrap[finalZoneIndex]) {
          const card = playerField.spellTrap[finalZoneIndex];
          const cardId = card.idCarta || card.id || card.cardId;
          const cardName = (card.name || card.cardName || '').toLowerCase();
          const isMonsterReincarnation = cardId === 'MonsterReincarnation' || 
                                       cardId === 'monsterreincarnation' ||
                                       (typeof cardId === 'string' && cardId.toLowerCase().includes('monsterreincarnation')) ||
                                       cardName.includes('monster reincarnation');
          
          if (isMonsterReincarnation && (card.position === 'face-up' || card.position === 'set')) {
            console.log(`🔄 [MONSTER_REINCARNATION_GRAVEYARD_CHOICE] Movendo Monster Reincarnation da zona ${finalZoneIndex} para o cemitério`);
            
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            playerField.graveyard.push(card);
            playerField.spellTrap[finalZoneIndex] = null;
          }
        } else if (finalZoneIndex === null || finalZoneIndex === undefined) {
          // Carta estava na mão - remover da mão e adicionar ao cemitério
          const cardInstanceId = pendingChoice.data?.cardInstanceId;
          if (cardInstanceId) {
            const handIndex = playerField.hand.findIndex((c: any) => c && c.instanceId === cardInstanceId);
            if (handIndex !== -1) {
              const card = playerField.hand[handIndex];
              const cardId = card.idCarta || card.id || card.cardId;
              const cardName = (card.name || card.cardName || '').toLowerCase();
              const isMonsterReincarnation = cardId === 'MonsterReincarnation' || 
                                           cardId === 'monsterreincarnation' ||
                                           (typeof cardId === 'string' && cardId.toLowerCase().includes('monsterreincarnation')) ||
                                           cardName.includes('monster reincarnation');
              
              if (isMonsterReincarnation) {
                console.log(`🔄 [MONSTER_REINCARNATION_GRAVEYARD_CHOICE] Movendo Monster Reincarnation da mão para o cemitério`);
                playerField.hand.splice(handIndex, 1);
                if (!playerField.graveyard) {
                  playerField.graveyard = [];
                }
                playerField.graveyard.push(card);
              }
            }
          }
        }
        
        // Atualizar no banco
        await this.duelsService.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Limpar pendingChoice
        await this.duelsService.clearPendingChoice(duelId, false);
        
        // Criar log de ação
        await this.createAndEmitDuelLog(duelId, userId, 'MONSTER_REINCARNATION_EFFECT', `Monster Reincarnation devolveu um monstro do cemitério para a mão`);
        
        // Buscar duelo atualizado
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
        const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuel);
        
        const duelData = {
          id: updatedDuel.id,
          player1Id: updatedDuel.player1Id,
          player2Id: updatedDuel.player2Id,
          player1: (updatedDuel as any).player1 || null,
          player2: (updatedDuel as any).player2 || null,
          player1LifePoints: updatedDuel.player1LifePoints,
          player2LifePoints: updatedDuel.player2LifePoints,
          currentTurn: updatedDuel.currentTurn,
          currentPhase: updatedDuel.currentPhase,
          status: updatedDuel.status,
          turnCounter: updatedDuel.turnCounter || 1,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice || null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'CONFISCATION_CHOICE') {
        // Processar escolha do Confiscation
        const { instanceId } = actionData;
        
        if (!instanceId || instanceId.trim() === '') {
          client.emit('duelError', { message: 'InstanceId da carta inválido' });
          return;
        }
        
        const result = await this.duelsService.processConfiscationChoice(duelId, userId, instanceId);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }
        
        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);
        
        // Buscar duelo atualizado do banco (forçar para garantir pendingChoice=null)
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        // Emitir evento explícito para fechar o modal ANTES do duelUpdate
        console.log(`📤 [CONFISCATION_CHOICE] Emitindo closePendingChoiceModal para fechar o modal`);
        client.emit('closePendingChoiceModal', { 
          duelId, 
          reason: 'choice_completed',
          cardEffectType: 'confiscation'
        });
        this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { 
          duelId, 
          reason: 'choice_completed',
          cardEffectType: 'confiscation'
        });
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice ?? null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        await new Promise(resolve => setTimeout(resolve, 100));
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'GRACEFUL_CHARITY_CHOICE') {
        // Processar escolha do GracefulCharity
        const { instanceIdsToDiscard } = actionData;
        
        if (!instanceIdsToDiscard || !Array.isArray(instanceIdsToDiscard) || instanceIdsToDiscard.length !== 2) {
          client.emit('duelError', { message: 'Você deve descartar exatamente 2 cartas' });
          return;
        }
        
        const result = await this.duelsService.processGracefulCharityChoice(duelId, userId, instanceIdsToDiscard);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }
        
        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);
        
        // Buscar duelo atualizado do banco (forçar para garantir pendingChoice=null)
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!updatedDuel) {
          client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
          return;
        }
        
        // Emitir closePendingChoiceModal antes do duelUpdate para o cliente fechar o modal primeiro
        client.emit('closePendingChoiceModal', { duelId, reason: 'choice_completed', cardEffectType: 'gracefulCharity' });
        this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { duelId, reason: 'choice_completed', cardEffectType: 'gracefulCharity' });
        
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: (updatedDuel as any).pendingChoice ?? null,
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        await new Promise(resolve => setTimeout(resolve, 100));
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'MASTER_ADD_CARD_TO_HAND') {
        // Ação especial para MASTER: adicionar carta do deck à mão pelo nome
        const { cardName } = actionData;
        
        if (!cardName || typeof cardName !== 'string' || cardName.trim() === '') {
          client.emit('duelError', { message: 'Nome da carta inválido' });
          return;
        }

        // Verificar se o usuário é MASTER
        try {
          const user = await this.usersService.findById(userId);
          if (!user || user.role !== 'MASTER') {
            client.emit('duelError', { message: 'Apenas usuários MASTER podem usar esta função' });
            return;
          }

          console.log(`🎮 [handleDuelAction] MASTER_ADD_CARD_TO_HAND - Buscando carta: "${cardName.trim()}"`);
          const result = await this.duelsService.masterAddCardToHand(duelId, userId, cardName.trim());
          
          if (!result.success) {
            console.error(`❌ [handleDuelAction] MASTER_ADD_CARD_TO_HAND falhou:`, result.message);
            client.emit('duelError', { message: result.message || 'Erro ao adicionar carta à mão' });
            return;
          }

          console.log(`✅ [handleDuelAction] MASTER_ADD_CARD_TO_HAND sucesso, buscando duelo atualizado...`);

          // Aguardar um pouco para garantir que o banco foi atualizado
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Buscar duelo atualizado
          const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Duelo não encontrado após adicionar carta`);
            client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
            return;
          }

          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          
          console.log(`🔍 [handleDuelAction] Duelo atualizado - player1Field.hand: ${player1Field?.hand?.length || 0} cartas, player2Field.hand: ${player2Field?.hand?.length || 0} cartas`);
          
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
            currentPhase: updatedDuel.currentPhase,
            status: updatedDuel.status,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        } catch (error) {
          console.error('Erro ao processar MASTER_ADD_CARD_TO_HAND:', error);
          client.emit('duelError', { message: 'Erro ao processar ação' });
        }
      } else if (actionType === 'CANCEL_CARD_ACTIVATION') {
        // Cancelar ativação de carta quando há pendingChoice
        const duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel) {
          client.emit('duelError', { message: 'Duelo não encontrado' });
          return;
        }
        
        const pendingChoice = (duel as any).pendingChoice;
        if (!pendingChoice || pendingChoice.userId !== userId) {
          client.emit('duelError', { message: 'Não há escolha pendente para cancelar' });
          return;
        }
        
        // Verificar se há informações sobre a carta no pendingChoice
        // Se a carta foi colocada temporariamente no campo (zoneIndex presente), removê-la
        // IMPORTANTE: Se zoneIndex é null, a carta estava na mão e não foi colocada no campo
        if (pendingChoice.data && pendingChoice.data.zoneIndex !== undefined && pendingChoice.data.zoneIndex !== null) {
          const zoneIndex = pendingChoice.data.zoneIndex;
          const isPlayer1 = Number(duel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          
          // Verificar se a carta estava na mão antes (cardInstanceId presente ou cardWasOnField = false)
          const wasInHand = pendingChoice.data.cardWasOnField === false;
          
          // Verificar se a carta está no campo
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const cardOnField = playerField.spellTrap[zoneIndex];
            
            if (wasInHand) {
              // Carta estava na mão e foi colocada temporariamente no campo - devolver para a mão
              // MAS: Verificar se a carta já não está na mão (para evitar duplicação)
              const cardId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
              const cardInstanceId = pendingChoice.data.cardInstanceId;
              
              // Verificar se a carta já está na mão
              const alreadyInHand = playerField.hand && playerField.hand.some((c: any) => {
                if (cardInstanceId && c.instanceId) {
                  return c.instanceId === cardInstanceId;
                }
                const cId = c.idCarta || c.id || c.cardId;
                return cId === cardId;
              });
              
              if (!alreadyInHand) {
                // Carta não está na mão - adicionar de volta
              if (!playerField.hand) {
                playerField.hand = [];
              }
              playerField.hand.push(cardOnField);
              playerField.spellTrap[zoneIndex] = null;
              console.log(`🗑️ [CANCEL_CARD_ACTIVATION] Carta ${cardOnField.name || cardOnField.cardName} removida do campo e devolvida para a mão`);
              
              // Atualizar no banco
              await this.duelsService.updateDuelInDatabase(duelId, {
                player1Field: (duel as any).player1Field,
                player2Field: (duel as any).player2Field,
              } as any);
              } else {
                // Carta já está na mão - apenas remover do campo (não duplicar!)
                console.log(`ℹ️ [CANCEL_CARD_ACTIVATION] Carta ${cardOnField.name || cardOnField.cardName} já está na mão - apenas removendo do campo (evitando duplicação)`);
                playerField.spellTrap[zoneIndex] = null;
                
                // Atualizar no banco
                await this.duelsService.updateDuelInDatabase(duelId, {
                  player1Field: (duel as any).player1Field,
                  player2Field: (duel as any).player2Field,
                } as any);
              }
            } else if (pendingChoice.data.cardWasOnField === true) {
              // Carta já estava no campo em "set" - SEMPRE voltar para "set" (mesmo que já esteja em "set")
              // Isso garante que a carta possa ser ativada novamente
              const originalPosition = pendingChoice.data.originalPosition || 'set';
              const cardName = cardOnField.name || cardOnField.cardName;
              const currentPosition = cardOnField.position;
              
              console.log(`🔄 [CANCEL_CARD_ACTIVATION] Restaurando carta ${cardName}:`);
              console.log(`   - Posição atual: ${currentPosition}`);
              console.log(`   - Posição original: ${originalPosition}`);
              console.log(`   - zoneIndex: ${zoneIndex}`);
              console.log(`   - cardWasOnField: ${pendingChoice.data.cardWasOnField}`);
              
              cardOnField.position = originalPosition;
              console.log(`✅ [CANCEL_CARD_ACTIVATION] Carta ${cardName} voltou para "${originalPosition}" no campo (pode ser ativada novamente)`);
              
              // Atualizar no banco
              await this.duelsService.updateDuelInDatabase(duelId, {
                player1Field: (duel as any).player1Field,
                player2Field: (duel as any).player2Field,
              } as any);
              
              // Verificar se foi atualizado corretamente
              const verifyDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              if (verifyDuel) {
                const verifyPlayerField = isPlayer1 ? (verifyDuel as any).player1Field : (verifyDuel as any).player2Field;
                if (verifyPlayerField && verifyPlayerField.spellTrap && verifyPlayerField.spellTrap[zoneIndex]) {
                  const verifyCard = verifyPlayerField.spellTrap[zoneIndex];
                  console.log(`✅ [CANCEL_CARD_ACTIVATION] Verificação: Carta ${verifyCard.name || verifyCard.cardName} está em "${verifyCard.position}" no campo após atualização`);
                }
              }
            }
          }
        } else if (pendingChoice.data && pendingChoice.data.cardWasOnField === false) {
          // Carta estava na mão e zoneIndex é null (não foi colocada no campo)
          // Não fazer nada - apenas limpar pendingChoice (carta permanece na mão)
          console.log(`ℹ️ [CANCEL_CARD_ACTIVATION] Carta estava na mão e não foi colocada no campo (zoneIndex: ${pendingChoice.data.zoneIndex}) - não fazendo nada (carta permanece na mão)`);
        }
        
        // IMPORTANTE: Usar clearPendingChoice para limpar o pendingChoice
        // Isso garante que a lógica específica de cada tipo de carta seja executada
        // (por exemplo, devolver carta descartada no caso do Monster Reincarnation)
        console.log(`🧹 [CANCEL_CARD_ACTIVATION] Limpando pendingChoice usando clearPendingChoice...`);
        await this.duelsService.clearPendingChoice(duelId, true);
        
        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          // Garantir que pendingChoice é null no objeto
          (updatedDuel as any).pendingChoice = null;
          
          // Verificar se o pendingChoice foi realmente limpo
          const hasPendingChoice = (updatedDuel as any).pendingChoice !== null && (updatedDuel as any).pendingChoice !== undefined;
          console.log(`🔍 [CANCEL_CARD_ACTIVATION] Duelo atualizado - pendingChoice existe? ${hasPendingChoice}`);
          
          if (hasPendingChoice) {
            console.error(`❌ [CANCEL_CARD_ACTIVATION] PendingChoice ainda existe após limpeza! Forçando null...`);
            (updatedDuel as any).pendingChoice = null;
            // Atualizar no banco novamente
            await this.duelsService.updateDuelInDatabase(duelId, {
              pendingChoice: null
            } as any);
          }
          
          // Emitir atualização
          this.server.to(`duel_${duelId}`).emit('duelUpdate', updatedDuel);
        }
        
        console.log(`✅ [handleDuelAction] Ativação de carta cancelada pelo usuário`);
      } else {
        client.emit('duelError', { message: 'Ação não reconhecida' });
      }
    } catch (error) {
      console.error('❌ [handleDuelAction] Erro ao processar ação do duelo:', error);
      console.error('❌ [handleDuelAction] Stack trace:', error instanceof Error ? error.stack : 'N/A');
      console.error('❌ [handleDuelAction] Action type:', actionType);
      console.error('❌ [handleDuelAction] Action data:', JSON.stringify(actionData, null, 2));
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar ação do duelo';
      client.emit('duelError', { message: errorMessage });
    }
  }

  /**
   * Faz escolha automática quando o turno mudou durante uma escolha pendente
   */
  private async handleAutoChoice(duelId: string, userId: number, pendingChoice: any): Promise<void> {
    console.log(`🤖 [handleAutoChoice] ==========================================`);
    console.log(`🤖 [handleAutoChoice] Fazendo escolha automática para ${pendingChoice.type}`);
    console.log(`🤖 [handleAutoChoice] DuelId: ${duelId}, UserId: ${userId}`);
    console.log(`🤖 [handleAutoChoice] PendingChoice completo:`, JSON.stringify(pendingChoice, null, 2));
    
    try {
      if (pendingChoice.type === 'CONFISCATION') {
        // Escolher carta aleatória (ou -1 se não houver cartas)
        const opponentHand = pendingChoice.data?.opponentHand || [];
        console.log(`🤖 [handleAutoChoice] Confiscation - opponentHand recebido:`, {
          length: opponentHand.length,
          hasData: !!pendingChoice.data,
          hasOpponentHand: !!pendingChoice.data?.opponentHand,
          cards: opponentHand.map((c: any) => c?.name || c?.cardName || 'Desconhecida')
        });
        
        if (opponentHand.length === 0) {
          console.warn(`⚠️ [handleAutoChoice] Confiscation: Nenhuma carta na mão do oponente!`);
        }
        
        const chosenIndex = opponentHand.length > 0 
          ? Math.floor(Math.random() * opponentHand.length) 
          : -1;
        console.log(`🤖 [handleAutoChoice] Confiscation: escolhendo carta aleatória no índice ${chosenIndex} de ${opponentHand.length} cartas`);
        
        // Usar instanceId ao invés de índice
        const chosenInstanceId = opponentHand.length > 0 && chosenIndex >= 0 && opponentHand[chosenIndex]?.instanceId
          ? opponentHand[chosenIndex].instanceId
          : '';
        
        if (!chosenInstanceId && opponentHand.length > 0) {
          console.error(`❌ [handleAutoChoice] Confiscation: Carta escolhida não tem instanceId!`, {
            chosenIndex,
            card: opponentHand[chosenIndex],
            allCards: opponentHand.map((c: any, i: number) => ({ index: i, name: c?.name, instanceId: c?.instanceId }))
          });
        }
        
        console.log(`🤖 [handleAutoChoice] Confiscation: escolhendo carta com instanceId ${chosenInstanceId} (índice ${chosenIndex}) de ${opponentHand.length} cartas`);
        const result = await this.duelsService.processConfiscationChoice(duelId, userId, chosenInstanceId);
        console.log(`🤖 [handleAutoChoice] Confiscation: resultado do processamento:`, result);
        
        if (!result.success) {
          console.error(`❌ [handleAutoChoice] Confiscation: Erro ao processar escolha:`, result.message);
        }
      } else if (pendingChoice.type === 'GRACEFUL_CHARITY') {
        // Descartar as primeiras 2 cartas (ou todas se tiver menos de 2)
        const playerHand = pendingChoice.data?.playerHand || [];
        console.log(`🤖 [handleAutoChoice] GracefulCharity - playerHand recebido:`, {
          length: playerHand.length,
          cards: playerHand.map((c: any) => ({ name: c?.name, instanceId: c?.instanceId }))
        });
        
        const instanceIdsToDiscard = playerHand.slice(0, 2).map((card: any) => 
          card.instanceId
        ).filter(Boolean);
        
        console.log(`🤖 [handleAutoChoice] GracefulCharity: descartando cartas com instanceIds:`, instanceIdsToDiscard);
        
        if (instanceIdsToDiscard.length === 0) {
          console.warn(`⚠️ [handleAutoChoice] GracefulCharity: Nenhuma carta com instanceId encontrada!`);
        }
        
        const result = await this.duelsService.processGracefulCharityChoice(duelId, userId, instanceIdsToDiscard);
        console.log(`🤖 [handleAutoChoice] GracefulCharity: resultado do processamento:`, result);
        
        if (!result.success) {
          console.error(`❌ [handleAutoChoice] GracefulCharity: Erro ao processar escolha:`, result.message);
        }
      } else if (pendingChoice.type === 'CHANGE_OF_HEART' || pendingChoice.type === 'BRAIN_CONTROL') {
        // Change Of Heart e Brain Control não podem fazer escolha automática
        // Apenas limpar o pendingChoice e restaurar a carta para "set" se estava no campo
        console.log(`🤖 [handleAutoChoice] ${pendingChoice.type}: Não é possível fazer escolha automática - limpando pendingChoice e restaurando carta`);
        await this.duelsService.clearPendingChoice(duelId, true); // true = restaurar carta para "set"
        console.log(`✅ [handleAutoChoice] ${pendingChoice.type}: PendingChoice limpo e carta restaurada`);
        
        // Buscar duelo atualizado e emitir atualização
        const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
        if (updatedDuel) {
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
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
            currentPhase: updatedDuel.currentPhase || 'MAIN1',
            status: updatedDuel.status,
            duelTime: (updatedDuel as any).duelTime || 0,
            turnTime: (updatedDuel as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuel as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: null,
            createdAt: updatedDuel.createdAt,
            updatedAt: updatedDuel.updatedAt,
          };
          
          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
          console.log(`✅ [handleAutoChoice] ${pendingChoice.type}: Escolha automática concluída (carta restaurada para "set")`);
          console.log(`🤖 [handleAutoChoice] ==========================================`);
          return; // Não continuar para limpar pendingChoice novamente
        }
      } else if (pendingChoice.type === 'FORCEFUL_SENTRY') {
        // Escolher carta aleatória (ou string vazia se não houver cartas)
        const opponentHand = pendingChoice.data?.opponentHand || [];
        console.log(`🤖 [handleAutoChoice] ForcefulSentry - opponentHand recebido:`, {
          length: opponentHand.length,
          cards: opponentHand.map((c: any) => ({ name: c?.name, instanceId: c?.instanceId }))
        });
        
        const chosenIndex = opponentHand.length > 0 
          ? Math.floor(Math.random() * opponentHand.length) 
          : -1;
        
        const chosenInstanceId = opponentHand.length > 0 && chosenIndex >= 0 && opponentHand[chosenIndex]?.instanceId
          ? opponentHand[chosenIndex].instanceId
          : '';
        
        if (!chosenInstanceId && opponentHand.length > 0) {
          console.error(`❌ [handleAutoChoice] ForcefulSentry: Carta escolhida não tem instanceId!`, {
            chosenIndex,
            card: opponentHand[chosenIndex],
            allCards: opponentHand.map((c: any, i: number) => ({ index: i, name: c?.name, instanceId: c?.instanceId }))
          });
        }
        
        console.log(`🤖 [handleAutoChoice] ForcefulSentry: escolhendo carta aleatória com instanceId ${chosenInstanceId} (índice ${chosenIndex}) de ${opponentHand.length} cartas`);
        const result = await this.duelsService.processForcefulSentryChoice(duelId, userId, chosenInstanceId);
        console.log(`🤖 [handleAutoChoice] ForcefulSentry: resultado do processamento:`, result);
        
        if (!result.success) {
          console.error(`❌ [handleAutoChoice] ForcefulSentry: Erro ao processar escolha:`, result.message);
        }
      } else if (pendingChoice.type === 'LIGHTNING_STORM') {
        console.log(`🤖 [handleAutoChoice] Lightning Storm: aplicando efeito padrão (destroy_attack_monsters)`);
        const result = await this.duelsService.processLightningStormChoice(duelId, userId, 'destroy_attack_monsters');
        if (!result.success) {
          console.error(`❌ [handleAutoChoice] Lightning Storm: Erro ao processar:`, result.message);
        }
      }
      
      // Limpar escolha pendente
      console.log(`🤖 [handleAutoChoice] Limpando pendingChoice...`);
      await this.duelsService.clearPendingChoice(duelId);
      console.log(`✅ [handleAutoChoice] pendingChoice limpo`);
      
      // Emitir atualização do duelo
      console.log(`🤖 [handleAutoChoice] Buscando duelo atualizado do banco...`);
      const updatedDuel = this.duelsService.findDuelByIdLight(duelId) || await this.duelsService.findDuelByIdFromDatabase(duelId, false);
      if (updatedDuel) {
        const player1Field = (updatedDuel as any).player1Field;
        const player2Field = (updatedDuel as any).player2Field;
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
          currentPhase: updatedDuel.currentPhase || 'MAIN1',
          status: updatedDuel.status,
          duelTime: (updatedDuel as any).duelTime || 0,
          turnTime: (updatedDuel as any).turnTime || 90,
          turnTimeRemaining: turnTimeRemaining,
          turnStartedAt: (updatedDuel as any).turnStartedAt,
          player1Field: player1Field,
          player2Field: player2Field,
          pendingChoice: null, // Escolha foi processada e limpa
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        console.log(`📤 [handleAutoChoice] Emitindo duelUpdate com pendingChoice=null após escolha automática`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        console.log(`✅ [handleAutoChoice] Escolha automática concluída com sucesso!`);
        console.log(`🤖 [handleAutoChoice] ==========================================`);
      } else {
        console.error(`❌ [handleAutoChoice] Duelo não encontrado após processar escolha automática!`);
      }
    } catch (error) {
      console.error(`❌ [handleAutoChoice] Erro ao fazer escolha automática:`, error);
      console.error(`❌ [handleAutoChoice] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
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

  @SubscribeMessage('directAttackAnimation')
  async handleDirectAttackAnimation(
    @MessageBody() data: { 
      duelId: string | number; 
      attackerCard?: any;
      targetProfileImage: string; 
      damage: number 
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelIdStr = typeof data.duelId === 'string' ? data.duelId : data.duelId.toString();
      
      // Retransmitir para todos na room do duelo (incluindo o oponente)
      this.server.to(`duel_${duelIdStr}`).emit('directAttackAnimation', {
        attackerCard: data.attackerCard,
        targetProfileImage: data.targetProfileImage,
        damage: data.damage
      });
      
      console.log(`⚔️ [directAttackAnimation] Animação de ataque direto retransmitida para duelo ${duelIdStr}`);
    } catch (error) {
      console.error('❌ [directAttackAnimation] Erro ao retransmitir animação:', error);
    }
  }

  @SubscribeMessage('duelChat')
  async handleDuelChat(
    @MessageBody() data: { duelId: number | string; userId?: number; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      // Segurança: usar APENAS o userId do JWT. Nunca confiar em data.userId do cliente.
      const userId = client.data.userId;
      const message = data.message?.trim();

      if (!duelId || !userId || !message) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Buscar duelo para verificar se o usuário é participante
      const duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
      if (!duel) {
        client.emit('duelError', { message: 'Duelo não encontrado' });
        return;
      }

      const numericUserId = Number(userId);
      if (numericUserId !== duel.player1Id && numericUserId !== duel.player2Id) {
        client.emit('duelError', { message: 'Você não está neste duelo' });
        return;
      }

      // Usar nickname (não expor username a outros jogadores)
      const user = await this.duelsService['usersRepository'].findOne({ 
        where: { id: numericUserId },
        select: ['id', 'nickname', 'clanTag']
      });

      const displayName = user?.clanTag ? `|${user.clanTag}| ${user?.nickname || 'Jogador'}` : (user?.nickname || 'Jogador');

      // Emitir mensagem para todos na room do duelo
      const chatData = {
        username: displayName,
        message: message,
        timestamp: new Date(),
      };

      this.server.to(`duel_${duelId}`).emit('chatMessage', chatData);
      console.log(`💬 [handleDuelChat] Mensagem enviada - Duelo: ${duelId}, User: ${displayName}, Message: ${message}`);
    } catch (error) {
      console.error(`❌ [handleDuelChat] Erro:`, error);
      client.emit('duelError', { message: 'Erro ao enviar mensagem' });
    }
  }

  /**
   * Helper para criar e emitir log de ação do duelo
   */
  private async createAndEmitDuelLog(
    duelId: string,
    userId: number,
    actionType: string,
    message: string
  ) {
    try {
      // Usar nickname (não expor username a outros jogadores)
      const user = await this.duelsService['usersRepository'].findOne({ 
        where: { id: userId },
        select: ['id', 'nickname', 'clanTag']
      });

      const displayName = user?.clanTag ? `|${user.clanTag}| ${user?.nickname || 'Jogador'}` : (user?.nickname || 'Jogador');

      // Salvar log no banco de dados
      await this.duelsService.saveDuelLog(duelId, userId, actionType, message);

      // Criar log para emitir
      const logData = {
        id: `${Date.now()}_${Math.random()}`, // ID único temporário
        username: displayName,
        actionType: actionType,
        message: message,
        createdAt: new Date(),
      };

      // Emitir para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelLog', { log: logData });
      console.log(`📝 [createAndEmitDuelLog] Log criado e emitido - ${actionType}: ${message}`);
    } catch (error) {
      console.error(`❌ [createAndEmitDuelLog] Erro:`, error);
    }
  }
}
