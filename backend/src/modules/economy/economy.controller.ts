import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { CurrencyType, TransactionType } from './entities/transaction.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';

@Controller('economy')
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  async getBalance(@Request() req: ExpressRequest & { user: any }) {
    const userId = Number(req.user.id);
    return this.economyService.getUserBalance(userId);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  async getTransactions(@Request() req: ExpressRequest & { user: any }, @Query('limit') limit?: number) {
    const userId = Number(req.user.id);
    return this.economyService.getTransactionHistory(userId, limit || 50);
  }

  @Post('transfer')
  @UseGuards(JwtAuthGuard)
  async transfer(
    @Request() req: ExpressRequest & { user: any },
    @Body() body: {
      toUserId: string;
      currencyType: CurrencyType;
      amount: number;
      description?: string;
    }
  ) {
    const userId = Number(req.user.id);
    const toUserId = parseInt(body.toUserId, 10);
    if (isNaN(toUserId)) {
      throw new Error('ID de destinatário inválido');
    }
    await this.economyService.transferCurrency(
      userId,
      toUserId,
      body.currencyType,
      body.amount,
      body.description
    );
    return { message: 'Transferência realizada com sucesso' };
  }

  @Post('add')
  @UseGuards(JwtAuthGuard)
  async addCurrency(
    @Body() body: {
      userId: string;
      currencyType: CurrencyType;
      amount: number;
      description?: string;
    }
  ) {
    const userId = parseInt(body.userId, 10);
    if (isNaN(userId)) {
      throw new Error('ID de usuário inválido');
    }
    return this.economyService.addCurrency(
      userId,
      body.currencyType,
      body.amount,
      TransactionType.EARN,
      body.description
    );
  }

  @Post('spend')
  @UseGuards(JwtAuthGuard)
  async spendCurrency(
    @Request() req: ExpressRequest & { user: any },
    @Body() body: {
      currencyType: CurrencyType;
      amount: number;
      description?: string;
    }
  ) {
    const userId = Number(req.user.id);
    return this.economyService.removeCurrency(
      userId,
      body.currencyType,
      body.amount,
      TransactionType.SPEND,
      body.description
    );
  }
}
