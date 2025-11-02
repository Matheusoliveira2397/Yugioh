import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByNickname(nickname: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { nickname } });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { verificationToken: token } });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      emailVerified: true,
      verificationToken: undefined,
    });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'username', 'wins', 'losses', 'rating'],
      order: { rating: 'DESC' },
    });
  }

  async updateStats(userId: string, stats: Partial<User>): Promise<User> {
    await this.usersRepository.update(userId, stats);
    return this.findById(userId);
  }

  async updateProfileImage(userId: string, profileImage: string): Promise<User> {
    await this.usersRepository.update(userId, { profileImage });
    return this.findById(userId);
  }
}
