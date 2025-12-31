import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
@Injectable()
export class FriendsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<number, string>(); // userId -> socketId

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    console.log('FriendsGateway initialized');
    
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

        socket.data.userId = userId;
        next();
      } catch (error) {
        console.error('Erro na autenticação WebSocket:', error);
        next(new Error('Token inválido'));
      }
    });
  }

  handleConnection(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.set(userId, client.id);
      console.log(`User ${userId} connected to FriendsGateway`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
      console.log(`User ${userId} disconnected from FriendsGateway`);
    }
  }

  // Emitir mensagem para o destinatário
  emitPrivateMessage(receiverId: number, messageData: any) {
    // Buscar socket do destinatário
    let sent = false;
    this.server.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === receiverId && socket.connected) {
        socket.emit('privateMessage', messageData);
        sent = true;
        console.log(`Message sent to user ${receiverId} via WebSocket (socketId: ${socket.id})`);
      }
    });

    if (!sent) {
      console.log(`User ${receiverId} is not connected, message will be delivered when they connect`);
    }
  }

  // Emitir mensagem do sistema para o destinatário
  emitSystemMessage(receiverId: number, messageData: any) {
    let sent = false;
    this.server.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === receiverId && socket.connected) {
        socket.emit('systemMessage', messageData);
        sent = true;
        console.log(`System message sent to user ${receiverId} via WebSocket (socketId: ${socket.id})`);
      }
    });

    if (!sent) {
      console.log(`User ${receiverId} is not currently connected via WebSocket, system message will be delivered when they connect.`);
    }
  }
}

