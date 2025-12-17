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
    @Inject(forwardRef(() => ArenaMatchmakingService))
    private arenaMatchmakingService: ArenaMatchmakingService,
    @Inject(forwardRef(() => ArenaService))
    private arenaService: ArenaService,
    @Inject(forwardRef(() => ArenaMatchmakingProcessorService))
    private arenaMatchmakingProcessorService: ArenaMatchmakingProcessorService,
  ) {}

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
      const userId = client.data.userId || data.userId;
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
      const userId = client.data.userId || data.userId;
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

      const userLevel = user.level || 1;
      const division = this.arenaMatchmakingService.getLevelDivision(userLevel);
      
      // Adicionar à fila da arena
      this.arenaMatchmakingService.addToArenaQueue(userId, client.id, userLevel);
      client.join(`user_${userId}`);
      
      // Obter tamanho da fila da divisão
      const queueSize = this.arenaMatchmakingService.getQueueSize(division);
      
      console.log(`🔍 [handleSearchArenaDuel] Usuário ${userId} (Nível ${userLevel}, Divisão: ${division}) procurando duelo na arena (Socket: ${client.id})`);
      client.emit('searchingArenaDuel', { 
        message: 'Procurando oponente na arena...',
        division: division,
        queueSize: queueSize
      });
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
      const userId = client.data.userId || data.userId;
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
      const userId = data.userId || client.data.userId;

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
      
      console.log(`✅ [handleJoinDuelRoom] Duelo encontrado! ID: ${duel.id}, Status: ${duel.status}`);

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

      // Verificar permissão
      const duelPlayer1Id = Number(duel.player1Id);
      const duelPlayer2Id = Number(duel.player2Id);
      const numericUserId = Number(userId);
      
      if (duelPlayer1Id !== numericUserId && duelPlayer2Id !== numericUserId) {
        client.emit('duelError', { message: 'Você não é um dos jogadores deste duelo' });
        return;
      }

      // Verificar se o jogador tem deck equipado antes de entrar no duelo
      const hasDeck = await this.duelsService.hasEquippedDeck(numericUserId);
      if (!hasDeck) {
        client.emit('duelError', { 
          message: 'Você não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.' 
        });
        return;
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
        console.log(`🔄 [handleJoinDuelRoom] Processando fase DRAW automaticamente para o jogador ${numericUserId}...`);
        
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
        
        // Adicionar delay para que o frontend mostre "Draw Phase" antes de processar
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 segundos de delay
        const updatedDuel = await this.duelsService.processDrawPhase(duelId);
        
        if (updatedDuel) {
          duel = updatedDuel;
          // Atualizar os campos também
          player1Field = (duel as any).player1Field;
          player2Field = (duel as any).player2Field;
          
          // Emitir atualização com a fase STANDBY após processar
          const standbyDuelData = {
            id: duel.id,
            player1Id: duel.player1Id,
            player2Id: duel.player2Id,
            player1: (duel as any).player1,
            player2: (duel as any).player2,
            player1LifePoints: duel.player1LifePoints,
            player2LifePoints: duel.player2LifePoints,
            currentTurn: duel.currentTurn,
            currentPhase: TurnPhase.STANDBY,
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
          this.server.to(`duel_${duelId}`).emit('duelUpdate', standbyDuelData);
        }
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
      const updatedDuel = await this.duelsService.nextPhase(duelId);
      if (!updatedDuel) {
        client.emit('duelError', { message: 'Erro ao avançar fase' });
        return;
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
        
        // Aguardar 1.5 segundos para mostrar o popup
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Processar DRAW phase (comprar carta e avançar para STANDBY)
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
            currentPhase: TurnPhase.STANDBY,
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

  @SubscribeMessage('endTurn')
  async handleEndTurn(
    @MessageBody() data: { duelId: number | string; userId?: number; cardIdsToDiscard?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const userId = data.userId || client.data.userId;
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

      // Tentar finalizar o turno
      const result = await this.duelsService.endTurn(duelId, numericUserId, cardIdsToDiscard);

      if (result.needsDiscard) {
        // Precisa descartar cartas - solicitar ao jogador
        client.emit('needsDiscard', {
          duelId,
          cardsToDiscard: result.cardsToDiscard,
          message: `Você tem mais de 6 cartas na mão. Selecione ${result.cardsToDiscard} carta(s) para descartar.`,
        });
        return;
      }

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

      // Verificar se o próximo turno está em DRAW (sempre deve estar após advanceToNextTurn)
      if (updatedDuel.currentPhase === TurnPhase.DRAW) {
        console.log(`🔄 [handleEndTurn] Processando fase DRAW automaticamente após finalizar turno...`);
        
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

        // Aguardar 1.5 segundos para mostrar o popup
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Processar DRAW phase (comprar carta e avançar para STANDBY)
        const finalDuel = await this.duelsService.processDrawPhase(duelId);
        if (finalDuel) {
          console.log(`✅ [handleEndTurn] Fase DRAW processada, avançando para STANDBY`);
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
            currentPhase: TurnPhase.STANDBY,
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
        console.warn(`⚠️ [handleEndTurn] Duelo não está em DRAW após finalizar turno. Fase atual: ${updatedDuel.currentPhase}`);
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
      const userId = data.userId || client.data.userId;
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
          currentPhase: finalDuel.currentPhase || 'DRAW',
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
      const userId = data.userId || client.data.userId;

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
        console.log(`🔍 [handleStealTurn] Escolha pendente encontrada:`, {
          type: pendingChoice.type,
          pendingChoiceUserId: pendingChoice.userId,
          playerLosingTurn: playerLosingTurn,
          match: pendingChoice.userId === playerLosingTurn,
          turnWhenStarted: pendingChoice.turnWhenStarted,
          currentTurn: duel.currentTurn
        });
        
        // Verificar se a escolha pendente é do jogador que está PERDENDO o turno
        if (pendingChoice.userId === playerLosingTurn) {
          console.log(`⚠️ [handleStealTurn] ⚠️ TURNO SENDO ROUBADO - FECHANDO MODAL E PROCESSANDO ESCOLHA AUTOMÁTICA ⚠️`);
          console.log(`⚠️ [handleStealTurn] Jogador ${playerLosingTurn} tem escolha pendente (${pendingChoice.type}) e está perdendo o turno`);
          
          // 1. Primeiro, emitir evento para fechar o modal no frontend IMEDIATAMENTE
          console.log(`🔒 [handleStealTurn] Emitindo evento para fechar modal do jogador ${playerLosingTurn}`);
          this.server.to(`duel_${duelId}`).emit('closePendingChoiceModal', { 
            duelId, 
            userId: playerLosingTurn,
            reason: 'turn_stolen' 
          });
          
          // 2. Depois fazer escolha automática
          await this.handleAutoChoice(duelId, playerLosingTurn, pendingChoice);
          
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

      // Processar fase DRAW automaticamente (comprar carta e avançar para STANDBY)
      // Adicionar delay para que o frontend mostre "Draw Phase" antes de processar
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 segundos de delay
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

  @SubscribeMessage('duelAction')
  async handleDuelAction(
    @MessageBody() data: { duelId: number | string; userId?: number; actionType: string; actionData?: any },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const duelId = typeof data.duelId === 'string' ? data.duelId : data.duelId?.toString() || null;
      const userId = data.userId || client.data.userId;
      const actionType = data.actionType;
      const actionData = data.actionData || {};

      if (!duelId || !userId || !actionType) {
        client.emit('duelError', { message: 'Dados inválidos' });
        return;
      }

      // Verificar se há escolha pendente e bloquear outras ações (exceto a própria escolha)
      const duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
      if (duel && (duel as any).pendingChoice) {
        const pendingChoice = (duel as any).pendingChoice;
        const isChoiceAction = actionType === 'CONFISCATION_CHOICE' ||
                              actionType === 'GRACEFUL_CHARITY_CHOICE' ||
                              actionType === 'FORCEFUL_SENTRY_CHOICE' ||
                              actionType === 'MONSTER_REBORN_CHOICE' ||
                              actionType === 'CHANGE_OF_HEART_CHOICE' ||
                              actionType === 'BRAIN_CONTROL_CHOICE' ||
                              actionType === 'UNITED_WE_STAND_CHOICE' ||
                              actionType === 'MAGE_POWER_CHOICE';
        
        // Se há escolha pendente e não é uma ação de escolha, bloquear
        if (!isChoiceAction && pendingChoice.userId === userId) {
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
        const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
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
      } else if (actionType === 'START_CHAOS_SORCERER_SUMMON') {
        // Iniciar invocação especial do ChaosSorcerer
        const { cardId } = actionData;

        if (!cardId) {
          client.emit('duelError', { message: 'ID da carta não fornecido' });
          return;
        }

        const result = await this.duelsService.startChaosSorcererSpecialSummon(duelId, userId, cardId);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao iniciar invocação especial do ChaosSorcerer' });
          return;
        }

        // Buscar duelo atualizado
        const updatedDuelForChaosSummon = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuelForChaosSummon) {
          const player1Field = (updatedDuelForChaosSummon as any).player1Field;
          const player2Field = (updatedDuelForChaosSummon as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelForChaosSummon);

          const duelData = {
            id: updatedDuelForChaosSummon.id,
            player1Id: updatedDuelForChaosSummon.player1Id,
            player2Id: updatedDuelForChaosSummon.player2Id,
            player1: (updatedDuelForChaosSummon as any).player1 || null,
            player2: (updatedDuelForChaosSummon as any).player2 || null,
            player1LifePoints: updatedDuelForChaosSummon.player1LifePoints,
            player2LifePoints: updatedDuelForChaosSummon.player2LifePoints,
            currentTurn: updatedDuelForChaosSummon.currentTurn,
            currentPhase: updatedDuelForChaosSummon.currentPhase,
            status: updatedDuelForChaosSummon.status,
            turnCounter: updatedDuelForChaosSummon.turnCounter || 1,
            duelTime: (updatedDuelForChaosSummon as any).duelTime || 0,
            turnTime: (updatedDuelForChaosSummon as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuelForChaosSummon as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuelForChaosSummon as any).pendingChoice || null,
            createdAt: updatedDuelForChaosSummon.createdAt,
            updatedAt: updatedDuelForChaosSummon.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'CHAOS_SORCERER_SUMMON_CHOICE') {
        // Processar escolha de monstros para invocação especial do ChaosSorcerer
        const { lightMonsterIndex, darkMonsterIndex, zoneIndex, position } = actionData;

        if (lightMonsterIndex === undefined || darkMonsterIndex === undefined || 
            zoneIndex === undefined || !position) {
          client.emit('duelError', { message: 'Dados de invocação inválidos' });
          return;
        }

        // Buscar duelo para obter cardId do pendingChoice
        let duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel || !duel.pendingChoice || duel.pendingChoice.type !== 'CHAOS_SORCERER_SUMMON') {
          client.emit('duelError', { message: 'Não há escolha pendente de ChaosSorcerer' });
          return;
        }

        const cardId = duel.pendingChoice.data?.cardId;
        if (!cardId) {
          client.emit('duelError', { message: 'ID da carta não encontrado' });
          return;
        }

        const result = await this.duelsService.specialSummonChaosSorcerer(
          duelId, 
          userId, 
          cardId, 
          lightMonsterIndex, 
          darkMonsterIndex, 
          zoneIndex, 
          position
        );

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao invocar ChaosSorcerer' });
          return;
        }

        // Limpar pendingChoice
        await this.duelsService.clearPendingChoice(duelId);

        // Criar log de ação
        const positionText = position === 'attack' ? 'Ataque' : 'Defesa';
        await this.createAndEmitDuelLog(duelId, userId, 'SPECIAL_SUMMON_CHAOS_SORCERER', `Invocou ChaosSorcerer por invocação especial em ${positionText}`);

        // Buscar duelo atualizado
        const updatedDuelAfterChaosSummon = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuelAfterChaosSummon) {
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

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
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

        // Buscar duelo atualizado
        const updatedDuelForChaosEffect = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuelForChaosEffect) {
          const player1Field = (updatedDuelForChaosEffect as any).player1Field;
          const player2Field = (updatedDuelForChaosEffect as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelForChaosEffect);

          const duelData = {
            id: updatedDuelForChaosEffect.id,
            player1Id: updatedDuelForChaosEffect.player1Id,
            player2Id: updatedDuelForChaosEffect.player2Id,
            player1: (updatedDuelForChaosEffect as any).player1 || null,
            player2: (updatedDuelForChaosEffect as any).player2 || null,
            player1LifePoints: updatedDuelForChaosEffect.player1LifePoints,
            player2LifePoints: updatedDuelForChaosEffect.player2LifePoints,
            currentTurn: updatedDuelForChaosEffect.currentTurn,
            currentPhase: updatedDuelForChaosEffect.currentPhase,
            status: updatedDuelForChaosEffect.status,
            turnCounter: updatedDuelForChaosEffect.turnCounter || 1,
            duelTime: (updatedDuelForChaosEffect as any).duelTime || 0,
            turnTime: (updatedDuelForChaosEffect as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuelForChaosEffect as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuelForChaosEffect as any).pendingChoice || null,
            createdAt: updatedDuelForChaosEffect.createdAt,
            updatedAt: updatedDuelForChaosEffect.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'CHAOS_SORCERER_EFFECT_CHOICE') {
        // Processar escolha de alvo do efeito do ChaosSorcerer
        const { targetPlayer, targetZoneIndex } = actionData;

        if (targetPlayer === undefined || targetZoneIndex === undefined) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }

        // Buscar duelo para obter monsterZoneIndex do pendingChoice
        let duel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (!duel || !duel.pendingChoice || duel.pendingChoice.type !== 'CHAOS_SORCERER_EFFECT') {
          client.emit('duelError', { message: 'Não há escolha pendente do efeito do ChaosSorcerer' });
          return;
        }

        const monsterZoneIndex = duel.pendingChoice.data?.monsterZoneIndex;
        if (monsterZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do ChaosSorcerer não encontrada' });
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
        const updatedDuelAfterChaosEffect = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        if (updatedDuelAfterChaosEffect) {
          const player1Field = (updatedDuelAfterChaosEffect as any).player1Field;
          const player2Field = (updatedDuelAfterChaosEffect as any).player2Field;
          const turnTimeRemaining = this.duelsService.calculateTurnTimeRemaining(updatedDuelAfterChaosEffect);

          const duelData = {
            id: updatedDuelAfterChaosEffect.id,
            player1Id: updatedDuelAfterChaosEffect.player1Id,
            player2Id: updatedDuelAfterChaosEffect.player2Id,
            player1: (updatedDuelAfterChaosEffect as any).player1 || null,
            player2: (updatedDuelAfterChaosEffect as any).player2 || null,
            player1LifePoints: updatedDuelAfterChaosEffect.player1LifePoints,
            player2LifePoints: updatedDuelAfterChaosEffect.player2LifePoints,
            currentTurn: updatedDuelAfterChaosEffect.currentTurn,
            currentPhase: updatedDuelAfterChaosEffect.currentPhase,
            status: updatedDuelAfterChaosEffect.status,
            turnCounter: updatedDuelAfterChaosEffect.turnCounter || 1,
            duelTime: (updatedDuelAfterChaosEffect as any).duelTime || 0,
            turnTime: (updatedDuelAfterChaosEffect as any).turnTime || 90,
            turnTimeRemaining: turnTimeRemaining,
            turnStartedAt: (updatedDuelAfterChaosEffect as any).turnStartedAt,
            player1Field: player1Field,
            player2Field: player2Field,
            pendingChoice: (updatedDuelAfterChaosEffect as any).pendingChoice || null,
            createdAt: updatedDuelAfterChaosEffect.createdAt,
            updatedAt: updatedDuelAfterChaosEffect.updatedAt,
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        }
      } else if (actionType === 'BREAKER_REMOVE_COUNTER') {
        // Buscar duelo atualizado para enviar atualização
        let updatedDuel = this.duelsService.findDuelByIdLight(duelId);
        if (!updatedDuel) {
          updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
          if (!updatedDuel) {
            client.emit('duelError', { message: 'Erro ao buscar duelo atualizado' });
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

        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
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
        if (!cardId || zoneIndex === undefined) {
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
            if (actionType === 'ACTIVATE_SPELL_TRAP' && playerField && playerField.spellTrap) {
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
                // Priorizar instanceId se disponível (permite distinguir múltiplas cópias da mesma carta)
                if (actionData.instanceId && c.instanceId) {
                  if (c.instanceId === actionData.instanceId) {
                    return true;
                  }
                }
                
                const cIdCarta = c.idCarta;
                const cId = c.id;
                const cCardId = c.cardId;
                const cName = c.name || c.cardName;
                
                // Comparar por todos os identificadores possíveis
                const matchesById = cIdCarta === cardId || 
                                   cId === cardId || 
                                   cCardId === cardId ||
                                   String(cIdCarta) === String(cardId) ||
                                   String(cId) === String(cardId) ||
                                   String(cCardId) === String(cardId);
                
                // Comparar por nome também
                const matchesByName = cName && actionData.cardName && 
                                    (cName === actionData.cardName || 
                                     cName.toLowerCase() === actionData.cardName.toLowerCase());
                
                return matchesById || matchesByName;
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
              if (!cardOnField && playerField && playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
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
        
        let result;
        try {
          result = await this.duelsService.placeCardOnField(duelId, userId, cardId, zoneIndex, finalPosition, cardType);
          console.log(`✅ [handleDuelAction] placeCardOnField retornou:`, result);
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
        let updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
        
        // Verificar se é Confiscation, GracefulCharity ou MonsterReborn ANTES de processar
        // Usar o cardId original passado na ação para detectar mais cedo
        let isConfiscationCard = false;
        let isGracefulCharityCard = false;
        let isForcefulSentryCard = false;
        let isMonsterRebornCard = false;
        let isChangeOfHeartCard = false;
        let isBrainControlCard = false;
        let isUnitedWeStandCard = false;
        let isMagePowerCard = false;
        
        // Verificar pelo cardId original passado na ação
        const originalCardId = cardId?.toString().toLowerCase();
        const originalCardName = actionData?.cardName?.toString().toLowerCase();
        
        if (originalCardId === 'confiscation' || originalCardName === 'confiscation' ||
            (typeof originalCardId === 'string' && originalCardId.includes('confiscation')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('confiscation'))) {
          isConfiscationCard = true;
          console.log(`✅ [handleDuelAction] Confiscation detectada pelo cardId original: ${cardId}`);
        }
        
        if (originalCardId === 'gracefulcharity' || originalCardName === 'graceful charity' ||
            (typeof originalCardId === 'string' && originalCardId.includes('gracefulcharity')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('graceful charity'))) {
          isGracefulCharityCard = true;
          console.log(`✅ [handleDuelAction] GracefulCharity detectada pelo cardId original: ${cardId}`);
        }
        
        if (originalCardId === 'theforcefulsentry' || originalCardName === 'the forceful sentry' ||
            (typeof originalCardId === 'string' && originalCardId.includes('forcefulsentry')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('forceful sentry'))) {
          isForcefulSentryCard = true;
          console.log(`✅ [handleDuelAction] ForcefulSentry detectada pelo cardId original: ${cardId}`);
        }
        
        if (originalCardId === 'monsterreborn' || originalCardName === 'monster reborn' ||
            (typeof originalCardId === 'string' && originalCardId.includes('monsterreborn')) ||
            (typeof originalCardName === 'string' && originalCardName.includes('monster reborn'))) {
          isMonsterRebornCard = true;
        } else if (cardId === 'ChangeOfHeart' || 
                   cardId === 'changeofheart' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('changeofheart'))) {
          isChangeOfHeartCard = true;
          console.log(`✅ [handleDuelAction] ChangeOfHeart detectada pelo cardId original: ${cardId}`);
        } else if (cardId === 'BrainControl' ||
                   cardId === 'braincontrol' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('braincontrol'))) {
          isBrainControlCard = true;
          console.log(`✅ [handleDuelAction] BrainControl detectada pelo cardId original: ${cardId}`);
        } else if (cardId === 'UnitedWeStand' ||
                   cardId === 'unitedwestand' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('unitedwestand'))) {
          isUnitedWeStandCard = true;
          console.log(`✅ [handleDuelAction] UnitedWeStand detectada pelo cardId original: ${cardId}`);
        } else if (cardId === 'MagePower' ||
                   cardId === 'magepower' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('magepower'))) {
          isMagePowerCard = true;
          console.log(`✅ [handleDuelAction] MagePower detectada pelo cardId original: ${cardId}`);
        }
        
        // Também verificar no campo após placeCardOnField (fallback)
        if (updatedDuel && (actionType === 'SET_SPELL_TRAP' || actionType === 'ACTIVATE_SPELL_TRAP') && finalPosition === 'face-up') {
          const isPlayer1Check = Number(updatedDuel.player1Id) === Number(userId);
          const playerFieldCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          // Verificar se a carta ainda está no campo (Confiscation)
          if (playerFieldCheck && playerFieldCheck.spellTrap) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            
            if (cardOnField) {
              const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
              const cardName = cardOnField.name || cardOnField.cardName;
              
              isConfiscationCard = cardIdCarta === 'Confiscation' || 
                                  cardIdCarta === 'confiscation' || 
                                  cardName === 'Confiscation' || 
                                  cardName === 'confiscation' || 
                                  (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('confiscation')) ||
                                  (typeof cardName === 'string' && cardName.toLowerCase().includes('confiscation'));
              
              console.log(`🔍 [handleDuelAction] Verificando Confiscation no campo - zoneIndex: ${zoneIndex}, idCarta: "${cardIdCarta}", name: "${cardName}", isConfiscation: ${isConfiscationCard}`);
            }
          }
          
          // Verificar se a carta ATUAL no campo é GracefulCharity (não verificar no cemitério aqui)
          // A verificação no cemitério só deve ser feita se a carta atual não foi identificada
          if (playerFieldCheck && playerFieldCheck.spellTrap && playerFieldCheck.spellTrap[zoneIndex]) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            const cardName = cardOnField.name || cardOnField.cardName;
            
            if (cardIdCarta === 'GracefulCharity' || 
                cardIdCarta === 'gracefulCharity' || 
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('gracefulcharity')) ||
                cardName === 'Graceful Charity' || 
                cardName === 'graceful charity' || 
                (typeof cardName === 'string' && cardName.toLowerCase().includes('graceful charity'))) {
              isGracefulCharityCard = true;
              console.log(`🔍 [handleDuelAction] GracefulCharity encontrada no campo - zoneIndex: ${zoneIndex}`);
            }
          }
          
          // Se ainda não detectou, verificar no campo (fallback)
          if (!isConfiscationCard && playerFieldCheck && playerFieldCheck.spellTrap) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            if (cardOnField) {
              const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
              const cardName = cardOnField.name || cardOnField.cardName;
              
              isConfiscationCard = cardIdCarta === 'Confiscation' || 
                                  cardIdCarta === 'confiscation' || 
                                  cardName === 'Confiscation' || 
                                  cardName === 'confiscation' || 
                                  (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('confiscation')) ||
                                  (typeof cardName === 'string' && cardName.toLowerCase().includes('confiscation'));
              
              if (isConfiscationCard) {
                console.log(`✅ [handleDuelAction] Confiscation detectada no campo (fallback) - zoneIndex: ${zoneIndex}`);
              }
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
            await this.duelsService.processConfiscationChoice(duelId, userId, -1);
          }
        } else if (isConfiscationCard && finalPosition === 'set') {
          console.log(`ℹ️ [handleDuelAction] Confiscation colocada em "set" - efeito não será processado até ser ativada`);
        }
        
        // Se for GracefulCharity, emitir evento com a mão atualizada
        // IMPORTANTE: Só processar se a carta ATUAL sendo ativada é GracefulCharity
        // Verificar se a carta no campo (ou que acabou de ser ativada) é realmente GracefulCharity
        if (isGracefulCharityCard && updatedDuel && finalPosition === 'face-up') {
          // Verificar novamente se a carta atual é realmente GracefulCharity
          const isPlayer1Check = Number(updatedDuel.player1Id) === Number(userId);
          const playerFieldCheck = isPlayer1Check ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          
          // Verificar se GracefulCharity está no cemitério (foi processada e movida)
          // OU se ainda está no campo (acabou de ser ativada)
          let isReallyGracefulCharity = false;
          
          // Primeiro verificar se está no campo
          if (playerFieldCheck && playerFieldCheck.spellTrap && playerFieldCheck.spellTrap[zoneIndex]) {
            const cardOnField = playerFieldCheck.spellTrap[zoneIndex];
            const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            const cardName = cardOnField.name || cardOnField.cardName;
            
            if (cardIdCarta === 'GracefulCharity' || 
                cardIdCarta === 'gracefulCharity' || 
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('gracefulcharity')) ||
                cardName === 'Graceful Charity' || 
                cardName === 'graceful charity' || 
                (typeof cardName === 'string' && cardName.toLowerCase().includes('graceful charity'))) {
              isReallyGracefulCharity = true;
            }
          }
          
          // Se não está no campo, verificar se está no cemitério (foi processada)
          if (!isReallyGracefulCharity && playerFieldCheck && playerFieldCheck.graveyard) {
            // Verificar se a última carta adicionada ao cemitério é GracefulCharity
            const lastCardInGraveyard = playerFieldCheck.graveyard[playerFieldCheck.graveyard.length - 1];
            if (lastCardInGraveyard) {
              const cardIdCarta = lastCardInGraveyard.idCarta || lastCardInGraveyard.id || lastCardInGraveyard.cardId;
              const cardName = lastCardInGraveyard.name || lastCardInGraveyard.cardName;
              
              if (cardIdCarta === 'GracefulCharity' || 
                  cardIdCarta === 'gracefulCharity' || 
                  (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('gracefulcharity')) ||
                  cardName === 'Graceful Charity' || 
                  cardName === 'graceful charity' || 
                  (typeof cardName === 'string' && cardName.toLowerCase().includes('graceful charity'))) {
                isReallyGracefulCharity = true;
              }
            }
          }
          
          if (isReallyGracefulCharity) {
            console.log(`✨ [handleDuelAction] GracefulCharity confirmada - processando efeito`);
            
            const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
            const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
            const playerHand = playerField?.hand || [];
            
            console.log(`✨ [handleDuelAction] GracefulCharity ativada - isPlayer1: ${isPlayer1}, playerHand: ${playerHand.length} cartas`);
            
            if (playerHand.length >= 2) {
              // Salvar estado de escolha pendente
              await this.duelsService.setPendingChoice(duelId, {
                type: 'GRACEFUL_CHARITY',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: { playerHand: playerHand }
              });
              
              // Buscar duelo atualizado novamente para ter o pendingChoice
              const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              if (updatedDuelWithPendingChoice) {
                updatedDuel = updatedDuelWithPendingChoice;
              }
              
              console.log(`📤 [handleDuelAction] Emitindo gracefulCharityShowHand apenas para quem ativou`);
              // Emitir apenas para o cliente que ativou a carta
              client.emit('gracefulCharityShowHand', {
                playerHand: playerHand,
                duelId: duelId,
              });
              console.log(`✅ [handleDuelAction] Evento gracefulCharityShowHand emitido apenas para o cliente que ativou`);
              
              // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              // Se o jogador tem menos de 2 cartas, descartar todas
              console.log(`⚠️ [handleDuelAction] Jogador tem menos de 2 cartas (${playerHand.length}) - descartando todas`);
              const cardIdsToDiscard = playerHand.map((card: any) => (card.idCarta || card.id || card.cardId)?.toString()).filter(Boolean);
              if (cardIdsToDiscard.length > 0) {
                await this.duelsService.processGracefulCharityChoice(duelId, userId, cardIdsToDiscard);
              }
            }
          } else {
            console.log(`⚠️ [handleDuelAction] Carta não é realmente GracefulCharity - ignorando processamento`);
            isGracefulCharityCard = false; // Resetar flag para não processar
          }
        }

        // Se for MonsterReborn, verificar no cemitério (já foi processada e movida)
        if (isMonsterRebornCard && updatedDuel && (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up') {
          console.log(`✨ [handleDuelAction] MonsterReborn detectada - aguardando processCardEffect terminar e verificando no cemitério`);
          
          // Aguardar um pouco mais para garantir que o processCardEffect terminou e moveu a carta para o cemitério
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Buscar duelo atualizado novamente para garantir que temos os dados mais recentes
          updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Não foi possível buscar duelo atualizado para MonsterReborn`);
            return;
          }
          
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          const opponentField = isPlayer1 ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
          const playerGraveyard = playerField?.graveyard || [];
          
          // Verificar se MonsterReborn está no cemitério (foi movida pelo processCardEffect)
          const monsterRebornInGraveyard = playerGraveyard.find((c: any) => {
            const cardId = c.idCarta || c.id || c.cardId;
            return cardId === 'MonsterReborn' || 
                   cardId === 'monsterreborn' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('monsterreborn'));
          });
          
          console.log(`🔍 [handleDuelAction] MonsterReborn no cemitério? ${!!monsterRebornInGraveyard}, playerGraveyard.length: ${playerGraveyard.length}`);
          
          if (monsterRebornInGraveyard) {
            console.log(`✨ [handleDuelAction] MonsterReborn detectada no cemitério após placeCardOnField`);
            
            // Coletar monstros dos cemitérios
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
              // Salvar estado de escolha pendente
              await this.duelsService.setPendingChoice(duelId, {
                type: 'MONSTER_REBORN',
                userId: userId,
                turnWhenStarted: updatedDuel.currentTurn,
                phaseWhenStarted: updatedDuel.currentPhase || 'MAIN1',
                data: { 
                  playerGraveyard: playerMonsters,
                  opponentGraveyard: opponentMonsters
                }
              });
              
              // Buscar duelo atualizado novamente para ter o pendingChoice
              const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              if (updatedDuelWithPendingChoice) {
                updatedDuel = updatedDuelWithPendingChoice;
              }
              
              console.log(`📤 [handleDuelAction] Emitindo monsterRebornShowGraveyards apenas para quem ativou`);
              // Emitir apenas para o cliente que ativou a carta
              client.emit('monsterRebornShowGraveyards', {
                playerGraveyard: playerMonsters,
                opponentGraveyard: opponentMonsters,
                duelId: duelId,
              });
              console.log(`✅ [handleDuelAction] Evento monsterRebornShowGraveyards emitido apenas para o cliente que ativou`);
              
              // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              console.log(`ℹ️ [handleDuelAction] Nenhum monstro nos cemitérios para reviver`);
            }
          }
        }
        
        // Se for ChangeOfHeart, verificar no campo do oponente (já foi processada e movida)
        if (isChangeOfHeartCard && updatedDuel && (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up') {
          console.log(`✨ [handleDuelAction] ChangeOfHeart detectada - aguardando processCardEffect terminar e verificando campo do oponente`);
          
          // Aguardar um pouco mais para garantir que o processCardEffect terminou e moveu a carta para o cemitério
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Buscar duelo atualizado novamente para garantir que temos os dados mais recentes
          updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
          
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Não foi possível buscar duelo atualizado para ChangeOfHeart`);
            return;
          }
          
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          const opponentField = isPlayer1 ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
          const playerGraveyard = playerField?.graveyard || [];
          
          // Verificar se ChangeOfHeart está no cemitério (foi movida pelo processCardEffect)
          const changeOfHeartInGraveyard = playerGraveyard.find((c: any) => {
            const cardId = c.idCarta || c.id || c.cardId;
            return cardId === 'ChangeOfHeart' || 
                   cardId === 'changeofheart' ||
                   (typeof cardId === 'string' && cardId.toLowerCase().includes('changeofheart'));
          });
          
          console.log(`🔍 [handleDuelAction] ChangeOfHeart no cemitério? ${!!changeOfHeartInGraveyard}, playerGraveyard.length: ${playerGraveyard.length}`);
          
          if (changeOfHeartInGraveyard) {
            console.log(`✨ [handleDuelAction] ChangeOfHeart detectada no cemitério após placeCardOnField`);
            
            // Coletar monstros do campo do oponente com seus índices de zona (qualquer posição: attack, defense ou set)
            const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
            (opponentField?.monsters || []).forEach((m: any, index: number) => {
              if (m && m !== null && m !== undefined) {
                // Pode controlar monstros em qualquer posição (attack, defense ou set)
                opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
              }
            });
            
            const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
              ...om.monster,
              zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
            }));
            
            if (opponentMonsters.length > 0) {
              // Buscar duelo atualizado novamente para ter o pendingChoice
              const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
              if (updatedDuelWithPendingChoice) {
                updatedDuel = updatedDuelWithPendingChoice;
              }
              
              console.log(`📤 [handleDuelAction] Emitindo changeOfHeartShowOpponentMonsters apenas para quem ativou`);
              // Emitir apenas para o cliente que ativou a carta
              client.emit('changeOfHeartShowOpponentMonsters', {
                opponentMonsters: opponentMonsters,
                duelId: duelId,
              });
              console.log(`✅ [handleDuelAction] Evento changeOfHeartShowOpponentMonsters emitido apenas para o cliente que ativou`);
              
              // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
              await new Promise(resolve => setTimeout(resolve, 200));
            } else {
              console.log(`ℹ️ [handleDuelAction] Nenhum monstro no campo do oponente para controlar`);
            }
          }
        }
        
        // Verificar se BrainControl está no campo (similar ao ChangeOfHeart)
        if (isBrainControlCard && updatedDuel && (actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up') {
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const playerField = isPlayer1 ? (updatedDuel as any).player1Field : (updatedDuel as any).player2Field;
          const opponentField = isPlayer1 ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
          
          // Verificar se BrainControl está no campo
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const cardOnField = playerField.spellTrap[zoneIndex];
            const cardIdCarta = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
            const cardName = cardOnField.name || cardOnField.cardName;
            
            if (cardIdCarta === 'BrainControl' || 
                cardIdCarta === 'braincontrol' || 
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('braincontrol')) ||
                cardName === 'Brain Control' || 
                cardName === 'brain control' || 
                (typeof cardName === 'string' && cardName.toLowerCase().includes('brain control'))) {
              console.log(`✨ [handleDuelAction] BrainControl detectada no campo após placeCardOnField`);
              
              // Coletar apenas monstros FACE-UP do campo do oponente (attack ou defense, não set)
              const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
              (opponentField?.monsters || []).forEach((m: any, index: number) => {
                if (m && m !== null && m !== undefined) {
                  const position = m.position || 'attack';
                  // Só pode controlar monstros face-up (attack ou defense, não set)
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
                // Buscar duelo atualizado novamente para ter o pendingChoice
                const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                if (updatedDuelWithPendingChoice) {
                  updatedDuel = updatedDuelWithPendingChoice;
                }
                
                console.log(`📤 [handleDuelAction] Emitindo brainControlShowOpponentMonsters apenas para quem ativou`);
                // Emitir apenas para o cliente que ativou a carta
                client.emit('brainControlShowOpponentMonsters', {
                  opponentMonsters: opponentMonsters,
                  duelId: duelId,
                });
                console.log(`✅ [handleDuelAction] Evento brainControlShowOpponentMonsters emitido apenas para o cliente que ativou`);
                
                // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo do oponente para controlar`);
              }
            }
          }
        }
        
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
            
            if (cardIdCarta === 'UnitedWeStand' || 
                cardIdCarta === 'unitedwestand' || 
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('unitedwestand')) ||
                cardName === 'United We Stand' || 
                cardName === 'united we stand' || 
                (typeof cardName === 'string' && cardName.toLowerCase().includes('united we stand'))) {
              
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
                
                if (availableMonsters.length > 0) {
                  // Buscar duelo atualizado novamente para ter o pendingChoice
                  const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                  if (updatedDuelWithPendingChoice) {
                    updatedDuel = updatedDuelWithPendingChoice;
                  }
                  
                  console.log(`📤 [handleDuelAction] Emitindo unitedWeStandShowMonsters apenas para quem ativou`);
                  // Emitir apenas para o cliente que ativou a carta
                  client.emit('unitedWeStandShowMonsters', {
                    availableMonsters: availableMonsters,
                    duelId: duelId,
                  });
                  console.log(`✅ [handleDuelAction] Evento unitedWeStandShowMonsters emitido apenas para o cliente que ativou`);
                  
                  // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
                  await new Promise(resolve => setTimeout(resolve, 200));
                } else {
                  console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo para equipar UnitedWeStand`);
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
            
            if (cardIdCarta === 'MagePower' || 
                cardIdCarta === 'magepower' || 
                (typeof cardIdCarta === 'string' && cardIdCarta.toLowerCase().includes('magepower')) ||
                cardName === 'Mage Power' || 
                cardName === 'mage power' || 
                (typeof cardName === 'string' && cardName.toLowerCase().includes('mage power'))) {
              
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
                
                if (availableMonsters.length > 0) {
                  // Buscar duelo atualizado novamente para ter o pendingChoice
                  const updatedDuelWithPendingChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
                  if (updatedDuelWithPendingChoice) {
                    updatedDuel = updatedDuelWithPendingChoice;
                  }
                  
                  console.log(`📤 [handleDuelAction] Emitindo magePowerShowMonsters apenas para quem ativou`);
                  // Emitir apenas para o cliente que ativou a carta
                  client.emit('magePowerShowMonsters', {
                    availableMonsters: availableMonsters,
                    duelId: duelId,
                  });
                  console.log(`✅ [handleDuelAction] Evento magePowerShowMonsters emitido apenas para o cliente que ativou`);
                  
                  // Aguardar um pequeno delay para garantir que o frontend processe o evento antes do duelUpdate
                  await new Promise(resolve => setTimeout(resolve, 200));
                } else {
                  console.log(`ℹ️ [handleDuelAction] Nenhum monstro face-up no campo para equipar MagePower`);
                }
              }
            }
          }
        }
        
        // Verificar se a carta ativada é The Forceful Sentry (apenas se não for Confiscation, GracefulCharity, MonsterReborn, ChangeOfHeart, BrainControl, UnitedWeStand ou MagePower)
        if ((actionType === 'ACTIVATE_SPELL_TRAP' || actionType === 'SET_SPELL_TRAP') && finalPosition === 'face-up' && !isConfiscationCard && !isGracefulCharityCard && !isMonsterRebornCard && !isChangeOfHeartCard && !isBrainControlCard && !isUnitedWeStandCard && !isMagePowerCard && updatedDuel) {
          const isPlayer1 = Number(updatedDuel.player1Id) === Number(userId);
          const player1Field = (updatedDuel as any).player1Field;
          const player2Field = (updatedDuel as any).player2Field;
          const playerField = isPlayer1 ? player1Field : player2Field;
          const activatedCard = playerField?.spellTrap?.[zoneIndex];
          
          if (activatedCard) {
            const cardId = activatedCard.idCarta || activatedCard.id || activatedCard.cardId;
            
            // Verificar se é TheForcefulSentry
            if (cardId === 'TheForcefulSentry' || 
                cardId === 'theforcefulsentry' ||
                (typeof cardId === 'string' && cardId.toLowerCase().includes('forcefulsentry'))) {
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
                await this.duelsService.processForcefulSentryChoice(duelId, userId, -1);
                
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
        
        // Se for Confiscation, GracefulCharity ou MonsterReborn, já foram processados acima
        // Se não for, emitir duelUpdate normalmente
        if (!isConfiscationCard && !isGracefulCharityCard && !isMonsterRebornCard && !isChangeOfHeartCard && !isBrainControlCard && !isUnitedWeStandCard && !isMagePowerCard) {
          if (!updatedDuel) {
            console.error(`❌ [handleDuelAction] Não foi possível buscar duelo atualizado do banco`);
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

        const result = await this.duelsService.processMonsterRebornChoice(duelId, userId, chosenMonster);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);

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

        const result = await this.duelsService.processChangeOfHeartChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente (processChangeOfHeartChoice já limpa, mas garantir)
        await this.duelsService.clearPendingChoice(duelId);
        
        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterChoice = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
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

        const result = await this.duelsService.processBrainControlChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente (processBrainControlChoice já limpa, mas garantir)
        await this.duelsService.clearPendingChoice(duelId);
        
        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterBrainControl = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
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
      } else if (actionType === 'UNITED_WE_STAND_CHOICE') {
        // Processar escolha do UnitedWeStand
        const { chosenMonsterZoneIndex } = actionData;

        if (chosenMonsterZoneIndex === undefined || chosenMonsterZoneIndex === null || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        const result = await this.duelsService.processUnitedWeStandChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente (processUnitedWeStandChoice já limpa, mas garantir)
        await this.duelsService.clearPendingChoice(duelId);

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
        const { chosenMonsterZoneIndex } = actionData;

        if (chosenMonsterZoneIndex === undefined || chosenMonsterZoneIndex === null || chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de monstro inválida' });
          return;
        }

        const result = await this.duelsService.processMagePowerChoice(duelId, userId, chosenMonsterZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente (processMagePowerChoice já limpa, mas garantir)
        await this.duelsService.clearPendingChoice(duelId);

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
        const { targetPlayer, targetZoneIndex } = actionData;

        if (targetPlayer === undefined || targetZoneIndex === undefined || targetZoneIndex < 0 || targetZoneIndex >= 5) {
          client.emit('duelError', { message: 'Escolha de alvo inválida' });
          return;
        }

        const result = await this.duelsService.processMysticalSpaceTyphoonChoice(duelId, userId, targetPlayer, targetZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente (processMysticalSpaceTyphoonChoice já limpa, mas garantir)
        await this.duelsService.clearPendingChoice(duelId);

        // Aguardar um pouco para garantir que o banco foi atualizado
        await new Promise(resolve => setTimeout(resolve, 100));

        // Buscar duelo atualizado (forçar busca do banco ignorando cache)
        const updatedDuelAfterMST = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
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
        const { targetPlayer, targetZoneIndex } = actionData;

        if (targetPlayer === undefined || targetZoneIndex === undefined || 
            targetZoneIndex < 0 || targetZoneIndex >= 5) {
          client.emit('duelError', { message: 'Dados de escolha inválidos' });
          return;
        }

        const result = await this.duelsService.processSnowmanEaterChoice(duelId, userId, targetPlayer, targetZoneIndex);

        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }

        // Limpar escolha pendente (processSnowmanEaterChoice já limpa, mas garantir)
        await this.duelsService.clearPendingChoice(duelId);

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

        console.log(`✅ [BREAKER_REMOVE_COUNTER] Emitindo duelUpdate - id: ${duelData.id}, player1Field: ${!!duelData.player1Field}, player2Field: ${!!duelData.player2Field}`);
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'ATTACK') {
        // Processar ataque
        const { attackerZoneIndex, targetZoneIndex } = actionData;
        
        if (attackerZoneIndex === undefined) {
          client.emit('duelError', { message: 'Zona do atacante inválida' });
          return;
        }

        const result = await this.duelsService.attackMonster(duelId, userId, attackerZoneIndex, targetZoneIndex ?? null);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao atacar' });
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
            ? ((updatedDuel as any).player1?.nickname || (updatedDuel as any).player1?.username || 'Jogador 1')
            : ((updatedDuel as any).player2?.nickname || (updatedDuel as any).player2?.username || 'Jogador 2');
          
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
        const { chosenCardIndex } = actionData;
        
        if (chosenCardIndex === undefined) {
          client.emit('duelError', { message: 'Índice de carta inválido' });
          return;
        }
        
        const result = await this.duelsService.processForcefulSentryChoice(duelId, userId, chosenCardIndex);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }
        
        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);
        
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
      } else if (actionType === 'CONFISCATION_CHOICE') {
        // Processar escolha do Confiscation
        const { chosenCardIndex } = actionData;
        
        if (chosenCardIndex === undefined) {
          client.emit('duelError', { message: 'Índice de carta inválido' });
          return;
        }
        
        const result = await this.duelsService.processConfiscationChoice(duelId, userId, chosenCardIndex);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }
        
        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);
        
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
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
        this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
      } else if (actionType === 'GRACEFUL_CHARITY_CHOICE') {
        // Processar escolha do GracefulCharity
        const { cardIdsToDiscard } = actionData;
        
        if (!cardIdsToDiscard || !Array.isArray(cardIdsToDiscard) || cardIdsToDiscard.length !== 2) {
          client.emit('duelError', { message: 'Você deve descartar exatamente 2 cartas' });
          return;
        }
        
        const result = await this.duelsService.processGracefulCharityChoice(duelId, userId, cardIdsToDiscard);
        
        if (!result.success) {
          client.emit('duelError', { message: result.message || 'Erro ao processar escolha' });
          return;
        }
        
        // Limpar escolha pendente
        await this.duelsService.clearPendingChoice(duelId);
        
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
          createdAt: updatedDuel.createdAt,
          updatedAt: updatedDuel.updatedAt,
        };
        
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
          };

          this.server.to(`duel_${duelId}`).emit('duelUpdate', duelData);
        } catch (error) {
          console.error('Erro ao processar MASTER_ADD_CARD_TO_HAND:', error);
          client.emit('duelError', { message: 'Erro ao processar ação' });
        }
      } else {
        client.emit('duelError', { message: 'Ação não reconhecida' });
      }
    } catch (error) {
      console.error('Erro ao processar ação do duelo:', error);
      client.emit('duelError', { message: 'Erro ao processar ação do duelo' });
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
        
        const result = await this.duelsService.processConfiscationChoice(duelId, userId, chosenIndex);
        console.log(`🤖 [handleAutoChoice] Confiscation: resultado do processamento:`, result);
      } else if (pendingChoice.type === 'GRACEFUL_CHARITY') {
        // Descartar as primeiras 2 cartas (ou todas se tiver menos de 2)
        const playerHand = pendingChoice.data?.playerHand || [];
        const cardIdsToDiscard = playerHand.slice(0, 2).map((card: any) => 
          (card.idCarta || card.id || card.cardId)?.toString()
        ).filter(Boolean);
        await this.duelsService.processGracefulCharityChoice(duelId, userId, cardIdsToDiscard);
      } else if (pendingChoice.type === 'FORCEFUL_SENTRY') {
        // Escolher carta aleatória (ou -1 se não houver cartas)
        const opponentHand = pendingChoice.data?.opponentHand || [];
        const chosenIndex = opponentHand.length > 0 
          ? Math.floor(Math.random() * opponentHand.length) 
          : -1;
        console.log(`🤖 [handleAutoChoice] ForcefulSentry: escolhendo carta aleatória no índice ${chosenIndex} de ${opponentHand.length} cartas`);
        await this.duelsService.processForcefulSentryChoice(duelId, userId, chosenIndex);
      } else if (pendingChoice.type === 'CHANGE_OF_HEART') {
        // Escolher monstro aleatório (ou -1 se não houver monstros)
        const opponentMonsters = pendingChoice.data?.opponentMonsters || [];
        const chosenIndex = opponentMonsters.length > 0 
          ? Math.floor(Math.random() * opponentMonsters.length) 
          : -1;
        if (chosenIndex >= 0 && opponentMonsters[chosenIndex]?.zoneIndex !== undefined) {
          const chosenZoneIndex = opponentMonsters[chosenIndex].zoneIndex;
          console.log(`🤖 [handleAutoChoice] ChangeOfHeart: escolhendo monstro aleatório no índice ${chosenZoneIndex} de ${opponentMonsters.length} monstros`);
          await this.duelsService.processChangeOfHeartChoice(duelId, userId, chosenZoneIndex);
        } else {
          console.log(`🤖 [handleAutoChoice] ChangeOfHeart: nenhum monstro disponível`);
        }
      } else if (pendingChoice.type === 'BRAIN_CONTROL') {
        // Escolher monstro face-up aleatório (ou -1 se não houver monstros)
        const opponentMonsters = pendingChoice.data?.opponentMonsters || [];
        const chosenIndex = opponentMonsters.length > 0 
          ? Math.floor(Math.random() * opponentMonsters.length) 
          : -1;
        if (chosenIndex >= 0 && opponentMonsters[chosenIndex]?.zoneIndex !== undefined) {
          const chosenZoneIndex = opponentMonsters[chosenIndex].zoneIndex;
          console.log(`🤖 [handleAutoChoice] BrainControl: escolhendo monstro face-up aleatório no índice ${chosenZoneIndex} de ${opponentMonsters.length} monstros`);
          await this.duelsService.processBrainControlChoice(duelId, userId, chosenZoneIndex);
        } else {
          console.log(`🤖 [handleAutoChoice] BrainControl: nenhum monstro face-up disponível`);
        }
      }
      
      // Limpar escolha pendente
      console.log(`🤖 [handleAutoChoice] Limpando pendingChoice...`);
      await this.duelsService.clearPendingChoice(duelId);
      console.log(`✅ [handleAutoChoice] pendingChoice limpo`);
      
      // Emitir atualização do duelo
      console.log(`🤖 [handleAutoChoice] Buscando duelo atualizado do banco...`);
      const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelId, true);
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
      const userId = data.userId || client.data.userId;
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

      // Buscar username do usuário
      const user = await this.duelsService['usersRepository'].findOne({ 
        where: { id: numericUserId },
        select: ['id', 'username', 'clanTag']
      });

      const username = user?.username || 'Jogador';
      const displayName = user?.clanTag ? `|${user.clanTag}| ${username}` : username;

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
      // Buscar username do usuário
      const user = await this.duelsService['usersRepository'].findOne({ 
        where: { id: userId },
        select: ['id', 'username', 'clanTag']
      });

      const username = user?.username || 'Jogador';
      const displayName = user?.clanTag ? `|${user.clanTag}| ${username}` : username;

      // Criar log
      const logData = {
        id: `${Date.now()}_${Math.random()}`, // ID único temporário
        username: displayName,
        actionType: actionType,
        message: message,
        createdAt: new Date(),
      };

      // Emitir para todos na room do duelo
      this.server.to(`duel_${duelId}`).emit('duelLog', { log: logData });
      console.log(`📝 [createAndEmitDuelLog] Log criado - ${actionType}: ${message}`);
    } catch (error) {
      console.error(`❌ [createAndEmitDuelLog] Erro:`, error);
    }
  }
}
