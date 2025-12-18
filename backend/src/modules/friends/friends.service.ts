import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from './entities/friendship.entity';
import { PrivateMessage } from './entities/private-message.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship)
    private friendshipRepository: Repository<Friendship>,
    @InjectRepository(PrivateMessage)
    private messageRepository: Repository<PrivateMessage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Listar amigos de um usuário
  async getFriends(userId: number) {
    const friendships = await this.friendshipRepository.find({
      where: [
        { user: { id: userId }, status: FriendshipStatus.ACCEPTED },
        { friend: { id: userId }, status: FriendshipStatus.ACCEPTED },
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

  // Enviar solicitação de amizade
  async sendFriendRequest(userId: number, friendUsername: string) {
    const friend = await this.userRepository.findOne({
      where: { username: friendUsername },
    });

    if (!friend) {
      throw new Error('Usuário não encontrado');
    }

    if (friend.id === userId) {
      throw new Error('Você não pode adicionar a si mesmo');
    }

    // Verificar se já existe amizade
    const existingFriendship = await this.friendshipRepository.findOne({
      where: [
        { user: { id: userId }, friend: { id: friend.id } },
        { user: { id: friend.id }, friend: { id: userId } },
      ],
    });

    if (existingFriendship) {
      throw new Error('Solicitação já existe');
    }

    const friendship = this.friendshipRepository.create({
      user: { id: userId } as User,
      friend: { id: friend.id } as User,
      status: FriendshipStatus.PENDING,
    });

    return this.friendshipRepository.save(friendship);
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
    return this.messageRepository.find({
      where: [
        { sender: { id: userId }, receiver: { id: friendId } },
        { sender: { id: friendId }, receiver: { id: userId } },
      ],
      relations: ['sender', 'receiver'],
      order: { createdAt: 'ASC' },
    });
  }

  // Enviar mensagem privada
  async sendMessage(senderId: number, receiverId: number, content: string) {
    // Verificar se são amigos
    const areFriends = await this.friendshipRepository.findOne({
      where: [
        {
          user: { id: senderId },
          friend: { id: receiverId },
          status: FriendshipStatus.ACCEPTED,
        },
        {
          user: { id: receiverId },
          friend: { id: senderId },
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

    return this.messageRepository.save(message);
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
