import { Injectable, Inject, forwardRef, BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
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
        nickname: friend.nickname,
        profileImage: friend.profileImage,
        isOnline: friend.isOnline,
        level: friend.level || 1,
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
      throw new BadRequestException('Usuário não encontrado');
    }

    if (friend.id === userId) {
      throw new BadRequestException('Você não pode adicionar a si mesmo');
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
        throw new ConflictException('Vocês já são amigos');
      } else if (existingFriendship.status === FriendshipStatus.PENDING) {
        if (existingFriendship.user.id === userId) {
          throw new ConflictException('Você já enviou uma solicitação para este usuário');
        } else {
          throw new ConflictException('Este usuário já enviou uma solicitação para você');
        }
      }
      // REJECTED ou BLOCKED: permitir reenviar (reativar como PENDING)
      existingFriendship.userId = userId;
      existingFriendship.friendId = friend.id;
      existingFriendship.user = { id: userId } as User;
      existingFriendship.friend = friend;
      existingFriendship.status = FriendshipStatus.PENDING;
      const saved = await this.friendshipRepository.save(existingFriendship);
      try {
        const sender = await this.userRepository.findOne({ where: { id: userId } });
        this.friendsGateway.emitFriendRequestReceived(friend.id, {
          id: saved.id,
          user: {
            id: userId,
            nickname: sender?.nickname ?? '',
            profileImage: sender?.profileImage ?? null,
            isOnline: sender?.isOnline ?? false,
            level: sender?.level ?? 1,
          },
          createdAt: saved.createdAt,
        });
      } catch (e) {
        // não falhar se websocket falhar
      }
      return saved;
    }

    const friendship = this.friendshipRepository.create({
      user: { id: userId } as User,
      friend,
      status: FriendshipStatus.PENDING,
    });

    const saved = await this.friendshipRepository.save(friendship);
    try {
      const sender = await this.userRepository.findOne({ where: { id: userId } });
      this.friendsGateway.emitFriendRequestReceived(friend.id, {
        id: saved.id,
        user: {
          id: userId,
          nickname: sender?.nickname ?? '',
          profileImage: sender?.profileImage ?? null,
          isOnline: sender?.isOnline ?? false,
          level: sender?.level ?? 1,
        },
        createdAt: saved.createdAt,
      });
    } catch (e) {
      // não falhar se websocket falhar
    }
    return saved;
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

    const isSender = friendship.userId === userId;
    const other = isSender ? friendship.friend : friendship.user;
    return {
      status: friendship.status,
      friendship: {
        id: friendship.id,
        isSender,
        otherUser: other ? {
          id: other.id,
          nickname: other.nickname,
          profileImage: other.profileImage,
          isOnline: other.isOnline,
          level: other.level ?? 1,
          clanTag: other.clanTag ?? null,
        } : null,
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
      throw new NotFoundException('Solicitação não encontrada');
    }

    // Verificar se o usuário é o destinatário da solicitação
    if (friendship.friend.id !== userId) {
      throw new ForbiddenException('Você não pode aceitar esta solicitação');
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
      throw new NotFoundException('Solicitação não encontrada');
    }

    if (friendship.friend.id !== userId) {
      throw new ForbiddenException('Você não pode rejeitar esta solicitação');
    }

    friendship.status = FriendshipStatus.REJECTED;
    return this.friendshipRepository.save(friendship);
  }

  // Cancelar solicitação enviada (apenas quem enviou pode cancelar)
  async cancelFriendRequest(userId: number, otherUserId: number) {
    const friendship = await this.friendshipRepository.findOne({
      where: {
        userId,
        friendId: otherUserId,
        status: FriendshipStatus.PENDING,
      },
      relations: ['user', 'friend'],
    });

    if (!friendship) {
      throw new NotFoundException('Solicitação não encontrada ou já foi respondida');
    }

    friendship.status = FriendshipStatus.REJECTED;
    return this.friendshipRepository.save(friendship);
  }

  // Remover amizade (qualquer um dos dois pode remover)
  async removeFriend(userId: number, otherUserId: number) {
    const friendship = await this.friendshipRepository.findOne({
      where: [
        { userId, friendId: otherUserId, status: FriendshipStatus.ACCEPTED },
        { userId: otherUserId, friendId: userId, status: FriendshipStatus.ACCEPTED },
      ],
      relations: ['user', 'friend'],
    });

    if (!friendship) {
      throw new NotFoundException('Amizade não encontrada ou já removida');
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
      throw new BadRequestException('Vocês não são amigos');
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
      select: ['id', 'nickname', 'clanTag', 'profileImage'],
    });

    // Formatar mensagem para o frontend (exibir apenas nickname, não username)
    const messageData = {
      id: savedMessage.id,
      senderId: savedMessage.senderId.toString(),
      receiverId: savedMessage.receiverId.toString(),
      content: savedMessage.content,
      createdAt: savedMessage.createdAt.toISOString(),
      read: savedMessage.read,
      username: sender?.nickname || 'Usuário',
      nickname: sender?.nickname || 'Usuário',
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
