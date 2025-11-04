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
    return this.economyService.getUserBalance(req.user.id);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  async getTransactions(@Request() req: ExpressRequest & { user: any }, @Query('limit') limit?: number) {
    return this.economyService.getTransactionHistory(req.user.id, limit || 50);
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
    await this.economyService.transferCurrency(
      req.user.id,
      body.toUserId,
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
    return this.economyService.addCurrency(
      body.userId,
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
    return this.economyService.removeCurrency(
      req.user.id,
      body.currencyType,
      body.amount,
      TransactionType.SPEND,
      body.description
    );
  }
}
