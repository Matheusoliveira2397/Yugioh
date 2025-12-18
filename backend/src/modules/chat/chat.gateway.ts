import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    // Log removido para reduzir poluição de logs
  }

  @SubscribeMessage('joinChannel')
  handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string },
  ) {
    client.join(data.channel);
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
      userId: string;
      username: string;
      content: string;
      channel: string;
    },
  ) {
    const message = await this.chatService.createMessage(data);
    
    this.server.to(data.channel).emit('newMessage', {
      userId: data.userId,
      username: data.username,
      content: data.content,
      createdAt: message.createdAt,
    });
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
    const message = await this.chatService.createMessage({
      userId: data.userId,
      username: data.username,
      content: data.content,
      channel: `private:${data.userId}:${data.recipientId}`,
    });

    // Enviar para ambos os usuários
    this.server.to(data.recipientId).emit('privateMessage', message);
    client.emit('privateMessage', message);
  }

  @SubscribeMessage('challengePlayer')
  handleChallenge(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { challengerId: string; challengedId: string },
  ) {
    this.server.to(data.challengedId).emit('duelChallenge', {
      challengerId: data.challengerId,
    });
  }
}
