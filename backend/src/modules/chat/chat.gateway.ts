import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

// Mapa para rastrear usuários online no chat global
const globalChatUsers = new Map<number, { userId: number; username: string; nickname: string; clanTag?: string; socketId: string }>();

@WebSocketGateway({
  cors: {
    origin: (() => {
      const o = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
      return o.length ? o : ['http://localhost:5173'];
    })(),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private chatService: ChatService,
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    console.log('✅ [ChatGateway] ChatGateway inicializado');
    console.log(`🔌 [ChatGateway] Servidor WebSocket configurado - namespace padrão (/)`);
    // Middleware de autenticação
    server.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token || 
                     socket.handshake.headers?.authorization?.replace('Bearer ', '');
        
        if (!token) {
          console.error('❌ [ChatGateway] Token não fornecido para socket:', socket.id);
          return next(new Error('Token não fornecido'));
        }

        const decoded = await this.jwtService.verifyAsync(token);
        const userId = typeof decoded.sub === 'string' ? parseInt(decoded.sub, 10) : Number(decoded.sub);
        
        if (isNaN(userId)) {
          console.error('❌ [ChatGateway] Token inválido: userId não encontrado');
          return next(new Error('Token inválido: userId não encontrado'));
        }

        socket.data.userId = userId;
        socket.data.role = (decoded as any).role || 'PLAYER';
        console.log(`✅ [ChatGateway] Usuário ${userId} autenticado (socket: ${socket.id})`);
        next();
      } catch (error) {
        console.error('❌ [ChatGateway] Erro de autenticação:', error);
        next(new Error('Token inválido ou expirado'));
      }
    });
  }

  handleConnection(client: Socket) {
    const userId = client.data.userId;
    console.log(`🔌 [ChatGateway] Cliente conectado: ${client.id}, userId: ${userId}`);
    if (userId) {
      // Marcar como online imediatamente quando conectar (se não estiver banido)
      this.usersService.getUserById(userId).then((user) => {
        if (user && !user.isBanned) {
          this.usersService.updateOnlineStatus(userId, true).catch((error) => {
            console.error(`❌ [ChatGateway] Erro ao atualizar status online para usuário ${userId}:`, error);
          });
        }
      }).catch((error) => {
        console.error(`❌ [ChatGateway] Erro ao verificar usuário ${userId}:`, error);
      });
    } else {
      console.warn(`⚠️ [ChatGateway] Cliente conectado sem userId: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      // Remover do mapa de usuários online no chat
      const userEntry = Array.from(globalChatUsers.values()).find(u => u.socketId === client.id);
      if (userEntry) {
        globalChatUsers.delete(userId);
        // Notificar outros usuários
        this.server.to('global').emit('userLeft', { userId });
        this.broadcastOnlineUsers();
      }
      
      // Verificar se ainda há conexões Socket.IO ativas para este usuário
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
          console.log(`🔴 [ChatGateway] Usuário ${userId} desconectado - marcando como offline`);
          this.usersService.updateOnlineStatus(userId, false).catch((error) => {
            console.error(`❌ [ChatGateway] Erro ao atualizar status offline para usuário ${userId}:`, error);
          });
        } else {
          console.log(`🟢 [ChatGateway] Usuário ${userId} ainda tem conexões ativas, mantendo online`);
        }
      }, 200); // Aumentar delay para 200ms para garantir sincronização
    }
  }

  @SubscribeMessage('joinChannel')
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string; userId?: number; username?: string; nickname?: string; clanTag?: string },
  ) {
    console.log(`📥 [ChatGateway] joinChannel recebido:`, { channel: data.channel, userId: data.userId, socketId: client.id });
    const userId = data.userId || client.data.userId;
    
    if (!userId) {
      console.error('❌ [ChatGateway] joinChannel: Usuário não autenticado');
      client.emit('error', { message: 'Usuário não autenticado' });
      return;
    }

    client.join(data.channel);
    console.log(`✅ [ChatGateway] Cliente ${client.id} entrou no canal ${data.channel}`);

    // Se for o canal global, adicionar à lista de usuários online
    if (data.channel === 'global') {
      // Buscar informações do usuário se não foram fornecidas
      let username = data.username;
      let nickname = data.nickname;
      let clanTag = data.clanTag;

      if (!username || !nickname) {
        try {
          const user = await this.usersService.getFullProfile(userId);
          username = user.username;
          nickname = user.nickname;
          clanTag = user.clanTag || undefined;
        } catch (error) {
          console.error('Erro ao buscar perfil do usuário:', error);
        }
      }

      // Adicionar ou atualizar usuário na lista
      globalChatUsers.set(userId, {
        userId,
        username: username || `User${userId}`,
        nickname: nickname || username || `User${userId}`,
        clanTag,
        socketId: client.id,
      });

      // Garantir que o status online está atualizado quando entra no canal global
      try {
        const user = await this.usersService.getUserById(userId);
        if (user && !user.isBanned) {
          await this.usersService.updateOnlineStatus(userId, true);
          console.log(`✅ [ChatGateway] Status online confirmado para usuário ${userId} ao entrar no canal global`);
        }
      } catch (error) {
        console.error(`❌ [ChatGateway] Erro ao atualizar status online para usuário ${userId} no joinChannel:`, error);
      }

      // Buscar profileImage do usuário
      let profileImage: string | null = null;
      try {
        const userProfile = await this.usersService.getFullProfile(userId);
        profileImage = userProfile.profileImage || null;
      } catch (error) {
        console.error('Erro ao buscar profileImage do usuário:', error);
      }

      // Notificar outros usuários
      this.server.to('global').emit('userJoined', {
        userId,
        username: nickname || username,
        clanTag,
        profileImage,
      });

      // Enviar lista de usuários online para o novo usuário
      this.sendOnlineUsers(client);
      
      // Carregar últimas mensagens do canal e enviar para o cliente
      try {
        const recentMessages = await this.chatService.getMessages(data.channel, 50);
        if (recentMessages && recentMessages.length > 0) {
          // Converter mensagens do MongoDB para o formato esperado pelo frontend
          const formattedMessages = await Promise.all(
            recentMessages.reverse().map(async (msg: any) => {
              // Buscar informações do usuário para cada mensagem
              let username = msg.username || 'Usuário';
              let clanTag: string | undefined;
              let profileImage: string | null = null;
              
              try {
                // Tentar converter userId para número (pode ser string UUID ou número)
                const msgUserId = typeof msg.userId === 'string' 
                  ? (msg.userId.match(/^\d+$/) ? parseInt(msg.userId, 10) : null)
                  : (typeof msg.userId === 'number' ? msg.userId : null);
                
                if (msgUserId !== null && !isNaN(msgUserId)) {
                  const userProfile = await this.usersService.getFullProfile(msgUserId);
                  username = userProfile.nickname || userProfile.username || username;
                  clanTag = userProfile.clanTag || undefined;
                  profileImage = userProfile.profileImage || null;
                } else {
                  // Se userId não é um número válido, usar username da mensagem
                  console.warn(`⚠️ [ChatGateway] userId inválido na mensagem: ${msg.userId}, usando username da mensagem: ${username}`);
                }
              } catch (error: any) {
                // Se o usuário não foi encontrado ou outro erro, usar dados da mensagem
                if (error?.status === 404) {
                  console.warn(`⚠️ [ChatGateway] Usuário ${msg.userId} não encontrado, usando dados da mensagem`);
                } else {
                  console.error(`❌ [ChatGateway] Erro ao buscar perfil do usuário ${msg.userId}:`, error?.message || error);
                }
              }
              
              return {
                id: msg._id?.toString() || msg.id || Date.now().toString(),
                userId: msg.userId?.toString() || String(msg.userId),
                username: username,
                clanTag: clanTag,
                profileImage: profileImage,
                content: msg.content,
                timestamp: msg.createdAt || new Date(),
                createdAt: msg.createdAt || new Date(),
              };
            })
          );
          
          // Enviar mensagens carregadas apenas para o cliente que acabou de entrar
          client.emit('messagesLoaded', { messages: formattedMessages });
          console.log(`📋 [ChatGateway] ${formattedMessages.length} mensagens antigas enviadas para cliente ${client.id}`);
        }
      } catch (error) {
        console.error('❌ [ChatGateway] Erro ao carregar mensagens antigas:', error);
        // Não falhar se houver erro ao carregar mensagens antigas
      }
    }
  }

  private async sendOnlineUsers(client: Socket) {
    const onlineUsersWithProfile = await Promise.all(
      Array.from(globalChatUsers.values()).map(async (u) => {
        try {
          const userProfile = await this.usersService.getFullProfile(u.userId);
          return {
            userId: u.userId,
            username: u.nickname,
            clanTag: u.clanTag,
            profileImage: userProfile.profileImage || null,
            level: userProfile.level ?? 1,
          };
        } catch (error) {
          console.error(`Erro ao buscar perfil do usuário ${u.userId}:`, error);
          return {
            userId: u.userId,
            username: u.nickname,
            clanTag: u.clanTag,
            profileImage: null,
            level: 1,
          };
        }
      })
    );
    client.emit('onlineUsers', { users: onlineUsersWithProfile });
  }

  private async broadcastOnlineUsers() {
    const onlineUsersWithProfile = await Promise.all(
      Array.from(globalChatUsers.values()).map(async (u) => {
        try {
          const userProfile = await this.usersService.getFullProfile(u.userId);
          return {
            userId: u.userId,
            username: u.nickname,
            clanTag: u.clanTag,
            profileImage: userProfile.profileImage || null,
            level: userProfile.level ?? 1,
          };
        } catch (error) {
          console.error(`Erro ao buscar perfil do usuário ${u.userId}:`, error);
          return {
            userId: u.userId,
            username: u.nickname,
            clanTag: u.clanTag,
            profileImage: null,
            level: 1,
          };
        }
      })
    );
    this.server.to('global').emit('onlineUsers', { users: onlineUsersWithProfile });
  }

  @SubscribeMessage('leaveChannel')
  handleLeaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string },
  ) {
    client.leave(data.channel);
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      userId: string | number;
      username: string;
      nickname?: string;
      clanTag?: string;
      content: string;
      channel: string;
    },
  ) {
    console.log(`📨 [ChatGateway] sendMessage recebido:`, { 
      userId: data.userId, 
      channel: data.channel, 
      content: data.content.substring(0, 50),
      socketId: client.id,
      clientConnected: client.connected,
    });
    const userId = typeof data.userId === 'string' ? parseInt(data.userId, 10) : data.userId;
    
    if (!userId || isNaN(userId)) {
      console.error(`❌ [ChatGateway] sendMessage: userId inválido:`, data.userId);
      client.emit('error', { message: 'Usuário inválido' });
      return;
    }
    
    // Buscar informações completas do usuário se necessário
    let nickname = data.nickname || data.username;
    let clanTag = data.clanTag;
    let profileImage: string | null = null;

    if (!data.nickname || !data.clanTag) {
      try {
        const user = await this.usersService.getFullProfile(userId);
        nickname = user.nickname || user.username;
        clanTag = user.clanTag || undefined;
        profileImage = user.profileImage || null;
      } catch (error) {
        console.error('Erro ao buscar perfil do usuário:', error);
      }
    } else {
      // Buscar apenas profileImage se não tivermos buscado o perfil completo
      try {
        const user = await this.usersService.getFullProfile(userId);
        profileImage = user.profileImage || null;
      } catch (error) {
        console.error('Erro ao buscar profileImage do usuário:', error);
      }
    }

    try {
      const message = await this.chatService.createMessage({
        userId: userId.toString(),
        username: nickname || data.username,
        content: data.content,
        channel: data.channel,
      });
      
      const messageData = {
        id: (message as any)._id?.toString() || (message as any).id || Date.now().toString(),
        userId: userId.toString(),
        username: nickname || data.username,
        clanTag: clanTag,
        profileImage: profileImage,
        content: data.content,
        timestamp: message.createdAt || new Date(),
        createdAt: message.createdAt || new Date(),
      };
      
      console.log(`📤 [ChatGateway] Emitindo newMessage para canal ${data.channel}:`, {
        id: messageData.id,
        userId: messageData.userId,
        username: messageData.username,
        content: messageData.content.substring(0, 50),
      });
      
      this.server.to(data.channel).emit('newMessage', messageData);
      console.log(`✅ [ChatGateway] Mensagem emitida com sucesso para canal ${data.channel}`);

      // Notificar usuários mencionados (@nick) no canal global
      if (data.channel === 'global' && data.content) {
        const mentionMatches = data.content.matchAll(/@([^\s@]+)/g);
        const mentionedNicks = [...new Set([...mentionMatches].map((m) => m[1].toLowerCase()))];
        const senderId = userId;
        for (const entry of globalChatUsers.values()) {
          if (entry.userId === senderId) continue;
          const nickLower = (entry.nickname || entry.username || '').toLowerCase();
          const userLower = (entry.username || '').toLowerCase();
          const wasMentioned = mentionedNicks.some((n) => nickLower === n || userLower === n);
          if (wasMentioned) {
            this.server.to(entry.socketId).emit('mention', {
              fromUserId: senderId,
              fromUsername: nickname || data.username,
              fromClanTag: clanTag,
              contentPreview: data.content.length > 80 ? data.content.slice(0, 77) + '...' : data.content,
            });
          }
        }
      }
    } catch (error) {
      console.error('❌ [ChatGateway] Erro ao criar mensagem:', error);
      // Mesmo se falhar ao salvar, enviar a mensagem
      const messageData = {
        id: Date.now().toString(),
        userId: userId.toString(),
        username: nickname || data.username,
        clanTag: clanTag,
        profileImage: profileImage,
        content: data.content,
        timestamp: new Date(),
        createdAt: new Date(),
      };
      
      console.log(`📤 [ChatGateway] Emitindo newMessage (fallback) para canal ${data.channel}`);
      this.server.to(data.channel).emit('newMessage', messageData);
      console.log(`✅ [ChatGateway] Mensagem emitida (fallback) com sucesso`);

      if (data.channel === 'global' && data.content) {
        const mentionMatches = data.content.matchAll(/@([^\s@]+)/g);
        const mentionedNicks = [...new Set([...mentionMatches].map((m) => m[1].toLowerCase()))];
        const senderId = userId;
        for (const entry of globalChatUsers.values()) {
          if (entry.userId === senderId) continue;
          const nickLower = (entry.nickname || entry.username || '').toLowerCase();
          const userLower = (entry.username || '').toLowerCase();
          const wasMentioned = mentionedNicks.some((n) => nickLower === n || userLower === n);
          if (wasMentioned) {
            this.server.to(entry.socketId).emit('mention', {
              fromUserId: senderId,
              fromUsername: nickname || data.username,
              fromClanTag: clanTag,
              contentPreview: data.content.length > 80 ? data.content.slice(0, 77) + '...' : data.content,
            });
          }
        }
      }
    }
  }

  @SubscribeMessage('sendPrivateMessage')
  async handlePrivateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      userId: string;
      username: string;
      recipientId: string;
      content: string;
    },
  ) {
    const senderId = typeof data.userId === 'string' ? parseInt(data.userId, 10) : data.userId;
    const recipientId = typeof data.recipientId === 'string' ? parseInt(data.recipientId, 10) : data.recipientId;

    // Buscar informações do remetente
    let senderUsername = data.username;
    let senderClanTag: string | undefined;
    let senderProfileImage: string | null = null;

    try {
      const sender = await this.usersService.getFullProfile(senderId);
      senderUsername = sender.nickname || sender.username;
      senderClanTag = sender.clanTag || undefined;
      senderProfileImage = sender.profileImage || null;
    } catch (error) {
      console.error('Erro ao buscar perfil do remetente:', error);
    }

    try {
      const message = await this.chatService.createMessage({
        userId: senderId.toString(),
        username: senderUsername,
        content: data.content,
        channel: `private:${senderId}:${recipientId}`,
      });

      const messageData = {
        id: (message as any)._id?.toString() || (message as any).id || Date.now().toString(),
        userId: senderId.toString(),
        username: senderUsername,
        clanTag: senderClanTag,
        profileImage: senderProfileImage || null, // Garantir que seja null se não houver
        content: data.content,
        timestamp: message.createdAt || new Date(),
        createdAt: message.createdAt || new Date(),
      };

      // Enviar para o destinatário (usando socketId se disponível)
      const recipientSocket = Array.from(globalChatUsers.values()).find(u => u.userId === recipientId);
      if (recipientSocket) {
        this.server.to(recipientSocket.socketId).emit('privateMessage', messageData);
      }
      
      // Enviar de volta para o remetente
      client.emit('privateMessage', messageData);
    } catch (error) {
      console.error('Erro ao criar mensagem privada:', error);
      // Mesmo se falhar ao salvar, enviar a mensagem
      const messageData = {
        id: Date.now().toString(),
        userId: senderId.toString(),
        username: senderUsername,
        clanTag: senderClanTag,
        profileImage: senderProfileImage || null, // Garantir que seja null se não houver
        content: data.content,
        timestamp: new Date(),
        createdAt: new Date(),
      };

      const recipientSocket = Array.from(globalChatUsers.values()).find(u => u.userId === recipientId);
      if (recipientSocket) {
        this.server.to(recipientSocket.socketId).emit('privateMessage', messageData);
      }
      client.emit('privateMessage', messageData);
    }
  }

  @SubscribeMessage('challengePlayer')
  handleChallenge(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { challengerId: string; challengedId: string },
  ) {
    const challengerId = typeof data.challengerId === 'string' ? parseInt(data.challengerId, 10) : data.challengerId;
    const challengedId = typeof data.challengedId === 'string' ? parseInt(data.challengedId, 10) : data.challengedId;

    // Validação: não permitir desafiar a si mesmo
    if (challengerId === challengedId) {
      client.emit('error', { message: 'Você não pode desafiar a si mesmo!' });
      return;
    }

    // Buscar informações do desafiante
    const challenger = Array.from(globalChatUsers.values()).find(u => u.userId === challengerId);
    if (!challenger) {
      client.emit('error', { message: 'Desafiante não encontrado' });
      return;
    }

    // Enviar desafio para o desafiado (usando socketId)
    const challengedSocket = Array.from(globalChatUsers.values()).find(u => u.userId === challengedId);
    if (challengedSocket) {
      this.server.to(challengedSocket.socketId).emit('duelChallenge', {
        challengerId: challengerId.toString(),
        challengerUsername: challenger.nickname || challenger.username,
        challengerClanTag: challenger.clanTag,
      });
    } else {
      client.emit('error', { message: 'Jogador desafiado não está online' });
    }
  }

  @SubscribeMessage('clearGlobalChat')
  async handleClearGlobalChat(@ConnectedSocket() client: Socket) {
    const role = client.data.role;
    if (role !== 'MASTER') {
      client.emit('error', { message: 'Apenas contas Master podem limpar o chat.' });
      return;
    }
    try {
      const deleted = await this.chatService.clearGlobalChat();
      this.server.to('global').emit('chatCleared', { deleted });
      console.log(`✅ [ChatGateway] Chat global limpo por Master (socket ${client.id}), ${deleted} mensagens removidas`);
    } catch (error) {
      console.error('❌ [ChatGateway] Erro ao limpar chat global:', error);
      client.emit('error', { message: 'Erro ao limpar o chat.' });
    }
  }
}
