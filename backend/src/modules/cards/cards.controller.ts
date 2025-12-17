import { Controller, Get, Post, Put, Delete, Query, Param, Body, UseGuards, UploadedFile, UseInterceptors, Request, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Card } from './entities/card.entity';
import { UploadService } from '../upload/upload.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { AddEffectDto } from './dto/add-effect.dto';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(
    private cardsService: CardsService,
    private uploadService: UploadService,
  ) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('type') type?: string) {
    return this.cardsService.findAll(search, type);
  }

  @Get('admin/all')
  @UseGuards(AdminGuard)
  getAllAdmin() {
    return this.cardsService.getAllAdmin();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    // Aceita tanto UUID quanto idCarta
    return this.cardsService.findOne(id);
  }

  @Get('by-id-carta/:idCarta')
  findByIdCarta(@Param('idCarta') idCarta: string) {
    // Buscar especificamente por idCarta
    return this.cardsService.findByIdCarta(idCarta);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createCardDto: CreateCardDto, @Request() req: any) {
    console.log('🎴 [CardsController] Creating card, user:', req.user);
    console.log('📦 [CardsController] Dados recebidos:', JSON.stringify(createCardDto, null, 2));
    
    // Verificar se há campos removidos sendo enviados
    const removedFields = ['nameEn', 'linkRating', 'pendulumScale', 'effect', 'isLimited', 'konamiId', 'pendulumEffect', 'priceCoins'];
    const foundRemovedFields = removedFields.filter(field => (createCardDto as any)[field] !== undefined);
    
    if (foundRemovedFields.length > 0) {
      console.error('❌ [CardsController] Campos removidos detectados no DTO:', foundRemovedFields);
      throw new BadRequestException(`Campos removidos detectados: ${foundRemovedFields.join(', ')}. Esses campos não existem mais no banco de dados.`);
    }
    
    return this.cardsService.create(createCardDto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    try {
      console.log('📝 [CardsController] ========== INICIANDO ATUALIZAÇÃO ==========');
      console.log('📝 [CardsController] ID da carta:', id);
      console.log('📝 [CardsController] Tipo do DTO:', typeof updateCardDto);
      console.log('📝 [CardsController] É instância de UpdateCardDto?', updateCardDto.constructor.name);
      
      // Log dos dados sem cardImage completo (pode ser muito grande)
      const logData = { ...updateCardDto };
      if ((logData as any).cardImage && typeof (logData as any).cardImage === 'string') {
        const imgLength = (logData as any).cardImage.length;
        (logData as any).cardImage = `[Base64 Image - ${imgLength} chars]`;
      }
      console.log('📦 [CardsController] Dados recebidos (raw):', JSON.stringify(logData, null, 2));
      console.log('📦 [CardsController] Chaves do objeto:', Object.keys(updateCardDto));
      console.log('📦 [CardsController] Valores:', Object.entries(updateCardDto).map(([k, v]) => `${k}: ${typeof v} = ${typeof v === 'string' ? v.substring(0, 50) : v}`).join(', '));
      
      // Verificar se há campos removidos sendo enviados
      const removedFields = ['nameEn', 'linkRating', 'pendulumScale', 'effect', 'isLimited', 'konamiId', 'pendulumEffect', 'priceCoins'];
      const foundRemovedFields = removedFields.filter(field => (updateCardDto as any)[field] !== undefined);
      
      if (foundRemovedFields.length > 0) {
        console.error('❌ [CardsController] Campos removidos detectados no DTO:', foundRemovedFields);
        throw new BadRequestException(`Campos removidos detectados: ${foundRemovedFields.join(', ')}. Esses campos não existem mais no banco de dados.`);
      }
      
      // Validar dados básicos antes de processar
      if (updateCardDto.idCarta !== undefined && (!updateCardDto.idCarta || String(updateCardDto.idCarta).trim() === '')) {
        throw new BadRequestException('ID da carta (idCarta) não pode estar vazio');
      }
      if (updateCardDto.name !== undefined && (!updateCardDto.name || String(updateCardDto.name).trim() === '')) {
        throw new BadRequestException('Nome da carta não pode estar vazio');
      }
      
      console.log('🔄 [CardsController] Chamando cardsService.update...');
      const result = await this.cardsService.update(id, updateCardDto);
      console.log('✅ [CardsController] Carta atualizada com sucesso');
      console.log('📤 [CardsController] Retornando resultado:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      console.error('❌ [CardsController] ========== ERRO AO ATUALIZAR CARTA ==========');
      console.error('❌ [CardsController] Tipo do erro:', error.constructor.name);
      console.error('❌ [CardsController] Mensagem:', error.message);
      console.error('❌ [CardsController] Stack completo:', error.stack);
      console.error('❌ [CardsController] Status code:', error.status || error.statusCode);
      console.error('❌ [CardsController] Response data:', error.response?.data);
      console.error('❌ [CardsController] ============================================');
      
      // Se já é uma exceção HTTP do NestJS, apenas relançar
      if (error.status || error.statusCode) {
        throw error;
      }
      
      // Caso contrário, converter para BadRequestException
      throw new BadRequestException(`Erro ao atualizar carta: ${error.message || 'Erro desconhecido'}`);
    }
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async delete(@Param('id') id: string) {
    try {
      await this.cardsService.delete(id);
      return { 
        success: true, 
        message: 'Carta desativada com sucesso (ainda existe no banco)' 
      };
    } catch (error: any) {
      console.error('❌ Erro no controller ao desativar carta:', error);
      throw error;
    }
  }

  @Delete(':id/hard')
  @UseGuards(AdminGuard)
  async hardDelete(@Param('id') id: string) {
    try {
      await this.cardsService.hardDelete(id);
      return { 
        success: true, 
        message: 'Carta deletada permanentemente do banco' 
      };
    } catch (error: any) {
      console.error('❌ Erro no controller ao deletar permanentemente carta:', error);
      throw error;
    }
  }

  @Post(':id/activate')
  @UseGuards(AdminGuard)
  async activateCard(@Param('id') id: string) {
    const card = await this.cardsService.findOne(id);
    card.isActive = true;
    await this.cardsService.update(id, { isActive: true });
    return { 
      success: true, 
      message: 'Carta reativada com sucesso',
      card 
    };
  }

  // ==================== EFEITOS ====================
  
  @Get('effects/templates')
  @UseGuards(AdminGuard)
  getEffectTemplates() {
    return this.cardsService.getEffectTemplates();
  }

  @Get('effects/with-effects')
  getCardsWithEffects() {
    return this.cardsService.findCardsWithEffects();
  }

  @Get('effects/without-effects')
  @UseGuards(AdminGuard)
  getCardsWithoutEffects() {
    return this.cardsService.findCardsWithoutEffects();
  }

  @Post('effects/add')
  @UseGuards(AdminGuard)
  addEffect(@Body() addEffectDto: AddEffectDto) {
    return this.cardsService.addEffectToCard(addEffectDto);
  }

  @Delete('effects/:cardName')
  @UseGuards(AdminGuard)
  removeEffect(@Param('cardName') cardName: string) {
    return this.cardsService.removeEffectFromCard(cardName);
  }

  // ==================== LOJA ====================
  
  @Public()
  @Get('shop/for-sale')
  getCardsForSale() {
    return this.cardsService.getCardsForSale();
  }

  @Get('search/by-name')
  searchByName(@Query('name') name: string) {
    return this.cardsService.findByName(name);
  }

  // ==================== UPLOAD ====================

  @Post('upload-image')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('cardImage'))
  async uploadCardImage(@UploadedFile() file: any, @Body('cardName') cardName: string) {
    const imagePath = await this.uploadService.uploadCardImage(file, cardName);
    return { imagePath };
  }
}
