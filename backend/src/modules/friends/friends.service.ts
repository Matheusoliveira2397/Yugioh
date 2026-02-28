import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from './entities/friendship.entity';
import { PrivateMessage } from './entities/private-message.entity';
import { User } from '../users/entities/user.entity';
import { FriendsGateway } from './friends.gateway';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship)
    private friendshipRepository: Repository<Friendship>,
    @InjectRepository(PrivateMessage)
    private messageRepository: Repository<PrivateMessage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => FriendsGateway))
    private friendsGateway: FriendsGateway,
  ) {}

  // Listar amigos de um usuário
  async getFriends(userId: number) {
    const friendships = await this.friendshipRepository.find({
      where: [
        { userId: userId, status: FriendshipStatus.ACCEPTED },
        { friendId: userId, status: FriendshipStatus.ACCEPTED },
      ],
      relations: ['user', 'friend'],
    });

    // Retornar apenas os amigos (não o próprio usuário)
    return friendships.map((friendship) => {
      const friend =
        friendship.user.id === userId ? friendship.friend : friendship.user;
      return {
        id: friend.id,
        username: friend.username,
        nickname: friend.nickname,
        profileImage: friend.profileImage,
        isOnline: friend.isOnline,
        level: friend.level || 1,
        rating: friend.rating,
      };
    });
  }

  // Enviar solicitação de amizade (por username ou userId)
  async sendFriendRequest(userId: number, friendIdentifier: string | number) {
    let friend: User | null = null;
    
    // Tentar encontrar por ID primeiro, depois por username
    if (typeof friendIdentifier === 'number' || !isNaN(Number(friendIdentifier))) {
      friend = await this.userRepository.findOne({
        where: { id: Number(friendIdentifier) },
      });
    }
    
    if (!friend) {
      friend = await this.userRepository.findOne({
        where: { username: friendIdentifier.toString() },
      });
    }

    if (!friend) {
      throw new Error('Usuário não encontrado');
    }

    if (friend.id === userId) {
      throw new Error('Você não pode adicionar a si mesmo');
    }

    // Verificar se já existe amizade
    const existingFriendship = await this.friendshipRepository.findOne({
      where: [
        { userId: userId, friendId: friend.id },
        { userId: friend.id, friendId: userId },
      ],
      relations: ['user', 'friend'],
    });

    if (existingFriendship) {
      if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
        throw new Error('Vocês já são amigos');
      } else if (existingFriendship.status === FriendshipStatus.PENDING) {
        if (existingFriendship.user.id === userId) {
          throw new Error('Você já enviou uma solicitação para este usuário');
        } else {
          throw new Error('Este usuário já enviou uma solicitação para você');
        }
      } else {
        throw new Error('Solicitação já existe');
      }
    }

    const friendship = this.friendshipRepository.create({
      userId: userId,
      friendId: friend.id,
      status: FriendshipStatus.PENDING,
    });

    return this.friendshipRepository.save(friendship);
  }

  // Verificar status de amizade entre dois usuários
  async getFriendshipStatus(userId: number, otherUserId: number) {
    // Usar userId e friendId diretamente (colunas do banco) em vez de relações
    const friendship = await this.friendshipRepository.findOne({
      where: [
        { userId: userId, friendId: otherUserId },
        { userId: otherUserId, friendId: userId },
      ],
      relations: ['user', 'friend'],
    });

    if (!friendship) {
      return { status: 'none', friendship: null };
    }

    // Determinar se o usuário atual enviou ou recebeu a solicitação
    const isSender = friendship.userId === userId;
    
    return {
      status: friendship.status,
      friendship: {
        id: friendship.id,
        isSender,
        otherUser: isSender ? friendship.friend : friendship.user,
      },
    };
  }

  // Listar solicitações pendentes (enviadas e recebidas)
  async getPendingRequests(userId: number) {
    const sentRequests = await this.friendshipRepository.find({
      where: {
        userId: userId,
        status: FriendshipStatus.PENDING,
      },
      relations: ['friend'],
    });

    const receivedRequests = await this.friendshipRepository.find({
      where: {
        friendId: userId,
        status: FriendshipStatus.PENDING,
      },
      relations: ['user'],
    });

    return {
      sent: sentRequests.map(f => ({
        id: f.id,
        user: {
          id: f.friend.id,
          username: f.friend.username,
          nickname: f.friend.nickname,
          profileImage: f.friend.profileImage,
          isOnline: f.friend.isOnline,
          level: f.friend.level || 1,
        },
        createdAt: f.createdAt,
      })),
      received: receivedRequests.map(f => ({
        id: f.id,
        user: {
          id: f.user.id,
          username: f.user.username,
          nickname: f.user.nickname,
          profileImage: f.user.profileImage,
          isOnline: f.user.isOnline,
          level: f.user.level || 1,
        },
        createdAt: f.createdAt,
      })),
    };
  }

  // Aceitar solicitação de amizade
  async acceptFriendRequest(friendshipId: string, userId: number) {
    const friendship = await this.friendshipRepository.findOne({
      where: { id: friendshipId },
      relations: ['user', 'friend'],
    });

    if (!friendship) {
      throw new Error('Solicitação não encontrada');
    }

    // Verificar se o usuário é o destinatário da solicitação
    if (friendship.friend.id !== userId) {
      throw new Error('Você não pode aceitar esta solicitação');
    }

    friendship.status = FriendshipStatus.ACCEPTED;
    return this.friendshipRepository.save(friendship);
  }

  // Rejeitar solicitação de amizade
  async rejectFriendRequest(friendshipId: string, userId: number) {
    const friendship = await this.friendshipRepository.findOne({
      where: { id: friendshipId },
      relations: ['user', 'friend'],
    });

    if (!friendship) {
      throw new Error('Solicitação não encontrada');
    }

    if (friendship.friend.id !== userId) {
      throw new Error('Você não pode rejeitar esta solicitação');
    }

    friendship.status = FriendshipStatus.REJECTED;
    return this.friendshipRepository.save(friendship);
  }

  // Listar mensagens com um amigo
  async getMessages(userId: number, friendId: number) {
    // Calcular data de 24 horas atrás
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const messages = await this.messageRepository.find({
      where: [
        { sender: { id: userId }, receiver: { id: friendId } },
        { sender: { id: friendId }, receiver: { id: userId } },
      ],
      relations: ['sender', 'receiver'],
      order: { createdAt: 'DESC' }, // Ordenar do mais recente para o mais antigo
    });

    // Filtrar mensagens com mais de 24 horas, pegar as últimas 20 e reverter ordem
    const filteredMessages = messages
      .filter(msg => msg.createdAt >= twentyFourHoursAgo)
      .slice(0, 20)
      .reverse(); // Reverter para ordem cronológica (mais antiga primeiro)

    // Formatar mensagens para o frontend
    return filteredMessages.map(msg => ({
      id: msg.id,
      senderId: msg.sender.id.toString(),
      receiverId: msg.receiver.id.toString(),
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      read: msg.read,
    }));
  }

  // Enviar mensagem privada
  async sendMessage(senderId: number, receiverId: number, content: string) {
    // Verificar se são amigos
    const areFriends = await this.friendshipRepository.findOne({
      where: [
        {
          userId: senderId,
          friendId: receiverId,
          status: FriendshipStatus.ACCEPTED,
        },
        {
          userId: receiverId,
          friendId: senderId,
          status: FriendshipStatus.ACCEPTED,
        },
      ],
    });

    if (!areFriends) {
      throw new Error('Vocês não são amigos');
    }

    const message = this.messageRepository.create({
      sender: { id: senderId } as User,
      receiver: { id: receiverId } as User,
      content,
      read: false,
    });

    const savedMessage = await this.messageRepository.save(message);
    
    // Buscar informações do remetente para enviar via WebSocket
    const sender = await this.userRepository.findOne({
      where: { id: senderId },
      select: ['id', 'username', 'nickname', 'clanTag', 'profileImage'],
    });

    // Formatar mensagem para o frontend
    const messageData = {
      id: savedMessage.id,
      senderId: savedMessage.senderId.toString(),
      receiverId: savedMessage.receiverId.toString(),
      content: savedMessage.content,
      createdAt: savedMessage.createdAt.toISOString(),
      read: savedMessage.read,
      username: sender?.username || 'Usuário',
      nickname: sender?.nickname || sender?.username || 'Usuário',
      clanTag: sender?.clanTag,
      profileImage: sender?.profileImage,
    };

    // Emitir mensagem via WebSocket para o destinatário
    try {
      this.friendsGateway.emitPrivateMessage(receiverId, messageData);
    } catch (error) {
      console.error('Erro ao emitir mensagem via WebSocket:', error);
      // Continuar mesmo se falhar o WebSocket
    }
    
    return messageData;
  }

  // Marcar mensagens como lidas
  async markAsRead(userId: number, friendId: number) {
    await this.messageRepository.update(
      {
        sender: { id: friendId },
        receiver: { id: userId },
        read: false,
      },
      { read: true },
    );
  }
}
