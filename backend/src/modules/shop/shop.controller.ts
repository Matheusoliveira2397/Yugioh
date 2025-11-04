import { Controller, Get, Post, Query, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopItemCurrency } from './entities/shop-item.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PurchaseCardDto } from './dto/purchase-card.dto';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('test')
  testEndpoint() {
    console.log('🛒 Test endpoint called!');
    return { message: 'Shop endpoint working!', timestamp: new Date() };
  }

  @Get()
  async getShopItems(
    @Query('currency') currency?: ShopItemCurrency,
    @Query('featured') featured?: string,
  ) {
    return this.shopService.getShopItems({
      currency,
      isFeatured: featured === 'true' ? true : undefined,
    });
  }

  @Get(':id')
  async getShopItem(@Param('id') id: string) {
    return this.shopService.getShopItem(id);
  }

  // ==================== COMPRAR CARTA ====================
  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchaseCard(
    @Request() req: any,
    @Body() purchaseDto: PurchaseCardDto
  ) {
    const userId = req.user.userId;
    return this.shopService.purchaseCard(userId, purchaseDto);
  }

  // ==================== INVENTÁRIO DO USUÁRIO ====================
  @UseGuards(JwtAuthGuard)
  @Get('inventory')
  async getUserInventory(@Request() req: any) {
    const userId = req.user.userId;
    return this.shopService.getUserInventory(userId);
  }

  // ==================== VERIFICAR SE USUÁRIO TEM CARTA ====================
  @UseGuards(JwtAuthGuard)
  @Get('has-card/:cardId')
  async userHasCard(
    @Request() req: any,
    @Param('cardId') cardId: string
  ) {
    const userId = req.user.userId;
    const hasCard = await this.shopService.userHasCard(userId, cardId);
    return { hasCard };
  }

  // ==================== ADICIONAR SALDO (ADMIN) ====================
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/add-balance')
  async addUserBalance(
    @Body() body: { userId: string; amount: number; currency: 'coins' | 'credits' | 'cash' }
  ) {
    return this.shopService.addUserBalance(body.userId, body.amount, body.currency);
  }
}
