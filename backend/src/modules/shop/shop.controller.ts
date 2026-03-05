import { Controller, Get, Post, Query, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopItemCurrency } from './entities/shop-item.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PurchaseCardDto } from './dto/purchase-card.dto';
import { PurchaseSleeveDto, PurchasePlaymatDto } from './dto/purchase-cosmetic.dto';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // LOG GLOBAL PARA DEBUG
  private logRequest(method: string, path: string) {
    console.log(`📡 [${method}] /shop${path} - ${new Date().toISOString()}`);
  }

  @Get('test')
  testEndpoint() {
    this.logRequest('GET', '/test');
    console.log('🛒 Test endpoint called!');
    return { message: 'Shop endpoint working!', timestamp: new Date() };
  }

  // ==================== COMPRAR CARTA (DEVE VIR ANTES DO :id) ====================
  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  async purchaseCard(
    @Request() req: any,
    @Body() purchaseDto: PurchaseCardDto
  ) {
    console.log('🔴🔴🔴 CONTROLLER.purchaseCard() EXECUTANDO! 🔴🔴🔴');
    this.logRequest('POST', '/purchase');
    console.log('========================================');
    console.log('🛒 PURCHASE REQUEST RECEIVED - AFTER GUARD');
    console.log('========================================');
    console.log('User ID:', req.user?.userId);
    console.log('Purchase DTO:', purchaseDto);
    console.log('Card ID:', purchaseDto?.cardId);
    console.log('Payment Method:', purchaseDto?.paymentMethod);
    console.log('Payment Method Type:', typeof purchaseDto?.paymentMethod);
    console.log('DTO Keys:', Object.keys(purchaseDto || {}));
    console.log('========================================');
    
  const userId = req.user.id;
    
    try {
      const result = await this.shopService.purchaseCard(userId, purchaseDto);
      console.log('✅ Purchase successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Purchase error:', error);
      throw error;
    }
  }

  @Post('purchase-sleeve')
  @UseGuards(JwtAuthGuard)
  async purchaseSleeve(@Request() req: any, @Body() dto: PurchaseSleeveDto) {
    this.logRequest('POST', '/purchase-sleeve');
    const userId = req.user.id;
    return this.shopService.purchaseSleeve(userId, dto.sleeveId, dto.paymentMethod);
  }

  @Post('purchase-playmat')
  @UseGuards(JwtAuthGuard)
  async purchasePlaymat(@Request() req: any, @Body() dto: PurchasePlaymatDto) {
    this.logRequest('POST', '/purchase-playmat');
    const userId = req.user.id;
    return this.shopService.purchasePlaymat(userId, dto.playmatId, dto.paymentMethod);
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

  // ==================== INVENTÁRIO DO USUÁRIO (DEVE VIR ANTES DO :id) ====================
  @UseGuards(JwtAuthGuard)
  @Get('inventory')
  async getUserInventory(@Request() req: any) {
    this.logRequest('GET', '/inventory');
    console.log('🔍 Requisição de inventário recebida');
    console.log('🔍 User do request:', req.user);
    const userId = req.user.id;
    console.log('🔍 UserId extraído:', userId);
    const inventory = await this.shopService.getUserInventory(userId);
    console.log('🔍 Inventário retornado:', {
      cards: inventory.cards?.length || 0,
      playmats: inventory.playmats?.length || 0,
      skins: inventory.skins?.length || 0
    });
    return inventory;
  }

  // ==================== VERIFICAR SE USUÁRIO TEM CARTA (DEVE VIR ANTES DO :id) ====================
  @UseGuards(JwtAuthGuard)
  @Get('has-card/:cardId')
  async userHasCard(
    @Request() req: any,
    @Param('cardId') cardId: string
  ) {
  const userId = req.user.id;
    const hasCard = await this.shopService.userHasCard(userId, cardId);
    return { hasCard };
  }

  // ==================== GET SHOP ITEM POR ID (DEVE VIR POR ÚLTIMO) ====================
  @Get(':id')
  async getShopItem(@Param('id') id: string) {
    return this.shopService.getShopItem(id);
  }

  // ==================== VENDER CARTA ====================
  @Post('sell')
  @UseGuards(JwtAuthGuard)
  async sellCard(
    @Request() req: any,
    @Body() body: { cardId: string; quantity?: number }
  ) {
    this.logRequest('POST', '/sell');
    const userId = req.user.id;
    const quantity = body.quantity || 1;
    
    try {
      const result = await this.shopService.sellCard(userId, body.cardId, quantity);
      console.log('✅ Venda realizada com sucesso:', result);
      return result;
    } catch (error) {
      console.error('❌ Erro ao vender carta:', error);
      throw error;
    }
  }

  // ==================== ADICIONAR SALDO (ADMIN) ====================
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/add-balance')
  async addUserBalance(
    @Body() body: { userId: number; amount: number; currency: 'credits' | 'cash' }
  ) {
    return this.shopService.addUserBalance(body.userId, body.amount, body.currency);
  }
}
