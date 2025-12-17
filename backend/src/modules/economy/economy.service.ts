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
    userId: number,
    currencyType: CurrencyType,
    amount: number,
    type: TransactionType = TransactionType.EARN,
    description?: string,
    metadata?: any
  ): Promise<Transaction> {
    // Garantir que sempre trabalhamos com valores inteiros (banco usa integer)
    const intAmount = Math.floor(amount);

    if (intAmount <= 0) {
      throw new BadRequestException('Quantidade deve ser positiva');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Atualiza saldo do usuário
    const field = currencyType;
    await this.userRepository.update(userId, {
      [field]: () => `"${field}" + ${intAmount}`
    });

    // Registra transação
    const transaction = this.transactionRepository.create({
      userId,
      currencyType,
      amount: intAmount,
      type,
      description,
      metadata
    });

    return this.transactionRepository.save(transaction);
  }

  // Remover moeda do usuário
  async removeCurrency(
    userId: number,
    currencyType: CurrencyType,
    amount: number,
    type: TransactionType = TransactionType.SPEND,
    description?: string,
    metadata?: any
  ): Promise<Transaction> {
    // Garantir que sempre trabalhamos com valores inteiros
    const intAmount = Math.floor(amount);

    if (intAmount <= 0) {
      throw new BadRequestException('Quantidade deve ser positiva');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verifica saldo
    let currentBalance = 0;
    if (currencyType === CurrencyType.CREDITS) {
      currentBalance = user.credits || 0;
    } else if (currencyType === CurrencyType.CASH) {
      currentBalance = user.cash || 0;
    }
    
    if (currentBalance < intAmount) {
      throw new BadRequestException(`Saldo insuficiente de ${currencyType}`);
    }

    // Atualiza saldo do usuário
    if (currencyType === CurrencyType.CREDITS) {
      await this.userRepository.update(userId, {
        credits: () => `"credits" - ${intAmount}`
      });
    } else if (currencyType === CurrencyType.CASH) {
      await this.userRepository.update(userId, {
        cash: () => `"cash" - ${intAmount}`
      });
    }

    // Registra transação
    const transaction = this.transactionRepository.create({
      userId,
      currencyType,
      amount: -intAmount,
      type,
      description,
      metadata
    });

    return this.transactionRepository.save(transaction);
  }

  // Recompensar usuário por vitória
  async rewardVictory(userId: number, scoreGained: number): Promise<void> {
    const coinsReward = Math.floor(scoreGained * 10);
    const experienceReward = scoreGained * 5;

    await this.addCurrency(
      userId,
      CurrencyType.CREDITS,
      coinsReward,
      TransactionType.REWARD,
      `Recompensa de vitória (+${scoreGained} score)`,
      { scoreGained, experienceReward }
    );

    // Adiciona XP
    await this.addExperience(userId, experienceReward);
  }

  // Sistema de XP e Level
  async addExperience(userId: number, xp: number): Promise<void> {
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
        CurrencyType.CREDITS,
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
  async getTransactionHistory(userId: number, limit: number = 50): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit
    });
  }

  // Buscar saldo do usuário
  async getUserBalance(userId: number): Promise<{
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
      credits: user.credits,
      cash: user.cash,
      level: user.level,
      experience: user.experience,
      xpForNextLevel: this.getXPForLevel(user.level)
    };
  }

  // Transferir moeda entre usuários
  async transferCurrency(
    fromUserId: number,
    toUserId: number,
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

  // Comprar créditos com dinheiro (cash)
  // Taxa de conversão: 1 cash = 10 credits (configurável)
  async buyCreditsWithCash(
    userId: number,
    cashAmount: number,
    exchangeRate: number = 10 // 1 cash = 10 credits por padrão
  ): Promise<{ creditsReceived: number; cashSpent: number; transaction: Transaction }> {
    if (cashAmount <= 0) {
      throw new BadRequestException('Quantidade de cash deve ser positiva');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar saldo de cash
    if (user.cash < cashAmount) {
      throw new BadRequestException(`Saldo insuficiente de cash. Você tem ${user.cash} cash, mas precisa de ${cashAmount}`);
    }

    // Calcular créditos a receber
    const creditsReceived = Math.floor(cashAmount * exchangeRate);

    // Remover cash
    const cashTransaction = await this.removeCurrency(
      userId,
      CurrencyType.CASH,
      cashAmount,
      TransactionType.PURCHASE,
      `Compra de ${creditsReceived} créditos com ${cashAmount} cash`,
      { exchangeRate, creditsReceived, cashAmount }
    );

    // Adicionar créditos
    const creditsTransaction = await this.addCurrency(
      userId,
      CurrencyType.CREDITS,
      creditsReceived,
      TransactionType.PURCHASE,
      `Créditos comprados com ${cashAmount} cash`,
      { exchangeRate, creditsReceived, cashAmount, sourceTransaction: cashTransaction.id }
    );

    return {
      creditsReceived,
      cashSpent: cashAmount,
      transaction: creditsTransaction
    };
  }
}
