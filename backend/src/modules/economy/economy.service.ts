import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, CurrencyType, TransactionType } from './entities/transaction.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class EconomyService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Adicionar moeda ao usuário
  async addCurrency(
    userId: string,
    currencyType: CurrencyType,
    amount: number,
    type: TransactionType = TransactionType.EARN,
    description?: string,
    metadata?: any
  ): Promise<Transaction> {
    if (amount <= 0) {
      throw new BadRequestException('Quantidade deve ser positiva');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Atualiza saldo do usuário
    const field = currencyType;
    await this.userRepository.update(userId, {
      [field]: () => `"${field}" + ${amount}`
    });

    // Registra transação
    const transaction = this.transactionRepository.create({
      userId,
      currencyType,
      amount,
      type,
      description,
      metadata
    });

    return this.transactionRepository.save(transaction);
  }

  // Remover moeda do usuário
  async removeCurrency(
    userId: string,
    currencyType: CurrencyType,
    amount: number,
    type: TransactionType = TransactionType.SPEND,
    description?: string,
    metadata?: any
  ): Promise<Transaction> {
    if (amount <= 0) {
      throw new BadRequestException('Quantidade deve ser positiva');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verifica saldo
    const currentBalance = user[currencyType];
    if (currentBalance < amount) {
      throw new BadRequestException(`Saldo insuficiente de ${currencyType}`);
    }

    // Atualiza saldo do usuário
    const field = currencyType;
    await this.userRepository.update(userId, {
      [field]: () => `"${field}" - ${amount}`
    });

    // Registra transação
    const transaction = this.transactionRepository.create({
      userId,
      currencyType,
      amount: -amount,
      type,
      description,
      metadata
    });

    return this.transactionRepository.save(transaction);
  }

  // Recompensar usuário por vitória
  async rewardVictory(userId: string, scoreGained: number): Promise<void> {
    const coinsReward = Math.floor(scoreGained * 10);
    const experienceReward = scoreGained * 5;

    await this.addCurrency(
      userId,
      CurrencyType.COINS,
      coinsReward,
      TransactionType.REWARD,
      `Recompensa de vitória (+${scoreGained} score)`,
      { scoreGained, experienceReward }
    );

    // Adiciona XP
    await this.addExperience(userId, experienceReward);
  }

  // Sistema de XP e Level
  async addExperience(userId: string, xp: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;

    let newXP = user.experience + xp;
    let newLevel = user.level;
    const xpForNextLevel = this.getXPForLevel(newLevel);

    // Level up
    while (newXP >= xpForNextLevel) {
      newXP -= xpForNextLevel;
      newLevel++;
      
      // Recompensa por level up
      await this.addCurrency(
        userId,
        CurrencyType.COINS,
        newLevel * 100,
        TransactionType.REWARD,
        `Level Up! Nível ${newLevel}`,
        { level: newLevel }
      );
    }

    await this.userRepository.update(userId, {
      experience: newXP,
      level: newLevel
    });
  }

  // Calcular XP necessário para próximo nível
  private getXPForLevel(level: number): number {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }

  // Buscar histórico de transações
  async getTransactionHistory(userId: string, limit: number = 50): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit
    });
  }

  // Buscar saldo do usuário
  async getUserBalance(userId: string): Promise<{
    coins: number;
    credits: number;
    cash: number;
    level: number;
    experience: number;
    xpForNextLevel: number;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return {
      coins: user.coins,
      credits: user.credits,
      cash: user.cash,
      level: user.level,
      experience: user.experience,
      xpForNextLevel: this.getXPForLevel(user.level)
    };
  }

  // Transferir moeda entre usuários
  async transferCurrency(
    fromUserId: string,
    toUserId: string,
    currencyType: CurrencyType,
    amount: number,
    description?: string
  ): Promise<void> {
    if (currencyType === CurrencyType.CASH) {
      throw new BadRequestException('Cash não pode ser transferido');
    }

    await this.removeCurrency(
      fromUserId,
      currencyType,
      amount,
      TransactionType.TRANSFER,
      `Transferência para outro usuário${description ? ': ' + description : ''}`
    );

    await this.addCurrency(
      toUserId,
      currencyType,
      amount,
      TransactionType.TRANSFER,
      `Recebido de outro usuário${description ? ': ' + description : ''}`
    );
  }
}
