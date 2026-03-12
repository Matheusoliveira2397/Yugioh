import { Controller, Get, Post, Put, Delete, Query, Param, Body, UseGuards, UploadedFile, UseInterceptors, Request, BadRequestException, Res, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Card } from './entities/card.entity';
import { UploadService } from '../upload/upload.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { AddEffectDto } from './dto/add-effect.dto';
import { YugiohApiService } from './services/yugioh-api.service';
import * as path from 'path';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(
    private cardsService: CardsService,
    private uploadService: UploadService,
    private yugiohApiService: YugiohApiService,
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

  /**
   * Proxy de imagem: busca imagem externa (ex.: Yugioh API) e devolve no nosso domínio.
   * Deve ficar ANTES de @Get(':id') para não ser capturado como id.
   */
  @Get('proxy-image')
  @Public()
  async proxyCardImage(@Query('url') url: string, @Res() res: Response) {
    if (!url || typeof url !== 'string') {
      throw new BadRequestException('Parâmetro url é obrigatório');
    }
    try {
      const decoded = decodeURIComponent(url.trim());
      const { buffer, contentType } = await this.yugiohApiService.fetchImageByUrl(decoded);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Não foi possível carregar a imagem');
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    // Aceita tanto UUID quanto idCarta
    return this.cardsService.findOne(id);
  }

  @Get('by-id-carta/:idCarta')
  findByIdCarta(@Param('idCarta') idCarta: string) {
    // Buscar especificamente por idCarta (único para cada skin)
    return this.cardsService.findByIdCarta(idCarta);
  }

  @Get('by-name/:name/skins')
  findSkinsByName(@Param('name') name: string) {
    // Buscar todas as skins de uma carta pelo nome (compartilham o mesmo efeito)
    return this.cardsService.findSkinsByName(name);
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

  // ==================== YUGIOH API ====================

  @Get('yugioh-api/search')
  @UseGuards(AdminGuard)
  async searchYugiohCards(@Query('query') query: string) {
    if (!query || query.length < 2) {
      return [];
    }
    return this.yugiohApiService.searchCards(query);
  }

  @Get('yugioh-api/card')
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  async getYugiohCard(
    @Query('name') name: string, 
    @Query('downloadImage') downloadImage?: string,
    @Query('imageIndex') imageIndex?: string
  ) {
    if (!name) {
      throw new BadRequestException('Nome da carta é obrigatório');
    }
    
    const shouldDownload = downloadImage === 'true';
    const imgIndex = imageIndex ? parseInt(imageIndex, 10) : 0;
    
    if (shouldDownload) {
      return this.yugiohApiService.searchCardAndDownloadImage(name, imgIndex);
    } else {
      return this.yugiohApiService.searchCardByName(name);
    }
  }

  @Post('yugioh-api/download-image')
  @UseGuards(AdminGuard)
  async downloadCardImage(@Body() body: { imageUrl: string; cardName: string; cardId?: string }) {
    if (!body.imageUrl || !body.cardName) {
      throw new BadRequestException('imageUrl e cardName são obrigatórios');
    }
    const imagePath = await this.uploadService.downloadAndSaveCardImage(
      body.imageUrl,
      body.cardName,
      body.cardId // Passar cardId se fornecido
    );
    return { imagePath };
  }

  @Get('find-image-by-name/:cardName')
  @Public()
  async findCardImageByName(@Param('cardName') cardName: string) {
    if (!cardName) {
      throw new BadRequestException('Nome da carta é obrigatório');
    }
    const imagePath = this.uploadService.findCardImageByName(cardName);
    return { imagePath };
  }

  @Post('admin/rename-all-images')
  @UseGuards(AdminGuard)
  async renameAllCardImages() {
    // Delegar para o service
    return this.cardsService.renameAllCardImages();
  }

  // ==================== ATUALIZAÇÃO EM MASSA ====================

  @Post('admin/update-all-from-api')
  @UseGuards(AdminGuard)
  async updateAllCardsFromApi(@Request() req: any) {
    console.log('📥 [CardsController] Recebida requisição para atualizar todas as cartas da API');
    console.log('👤 [CardsController] Usuário:', req.user?.username, 'Role:', req.user?.role);
    try {
      const result = await this.cardsService.updateAllCardsFromApi();
      console.log('✅ [CardsController] Atualização concluída:', result);
      return result;
    } catch (error: any) {
      console.error('❌ [CardsController] Erro ao atualizar cartas:', error);
      throw error;
    }
  }
}
