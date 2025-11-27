import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private redisService: RedisService,
  ) {}

  async promoteToMaster(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.role = UserRole.MASTER;
    return this.usersRepository.save(user);
  }

  async promoteToAdmin(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.role = UserRole.ADMIN;
    return this.usersRepository.save(user);
  }

  async demoteToPlayer(userId: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.role = UserRole.PLAYER;
    return this.usersRepository.save(user);
  }

  // Gestão de Usuários
  async getAllUsers(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
    const [users, total] = await this.usersRepository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      select: [
        'id', 'username', 'email', 'role', 'rating', 'winsGeral', 'lossesGeral', 'winsSeason', 'lossesSeason',
        'credits', 'cash', 'avatar', 'isOnline', 'lastIpAddress', 
        'isBanned', 'banReason', 'createdAt', 'lastLogin'
      ],
    });

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOnlineUsers() {
    const users = await this.usersRepository.find({
      where: { isOnline: true },
      select: ['id', 'username', 'avatar', 'rating', 'lastIpAddress'],
      order: { rating: 'DESC' },
    });

    return {
      count: users.length,
      users,
    };
  }

  async getUserDetails(userId: number) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Buscar histórico de IPs do Redis (últimos 10)
    const ipHistoryKey = `user:${userId}:ip_history`;
    const ipHistory = await this.redisService.getClient().lRange(ipHistoryKey, 0, 9);

    return {
      ...user,
      ipHistory: ipHistory.map((entry: string) => JSON.parse(entry)),
    };
  }

  async getUserIpHistory(userId: number) {
    const ipHistoryKey = `user:${userId}:ip_history`;
    const history = await this.redisService.getClient().lRange(ipHistoryKey, 0, 49);

    return history.map((entry: string) => JSON.parse(entry));
  }

  async banUser(userId: number, reason?: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    user.isBanned = true;
    user.banReason = reason || 'Violação dos termos de uso';

    await this.usersRepository.save(user);

    // Desconectar usuário do Redis
    await this.redisService.getClient().del(`user:${userId}:session`);

    return {
      message: 'Usuário banido com sucesso',
      user,
    };
  }

  async unbanUser(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    user.isBanned = false;
    user.banReason = '';

    await this.usersRepository.save(user);

    return {
      message: 'Usuário desbanido com sucesso',
      user,
    };
  }

  async getSystemStats() {
    const totalUsers = await this.usersRepository.count();
    const onlineUsers = await this.usersRepository.count({ where: { isOnline: true } });
    const bannedUsers = await this.usersRepository.count({ where: { isBanned: true } });
    const verifiedUsers = await this.usersRepository.count({ where: { isEmailVerified: true } });

    // Usuários registrados hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await this.usersRepository.count({
      where: {
        createdAt: Not(IsNull()),
      },
    });

    return {
      totalUsers,
      onlineUsers,
      bannedUsers,
      verifiedUsers,
      newUsersToday,
      stats: {
        avgRating: await this.usersRepository
          .createQueryBuilder('user')
          .select('AVG(user.rating)', 'avg')
          .getRawOne(),
      },
    };
  }
}
