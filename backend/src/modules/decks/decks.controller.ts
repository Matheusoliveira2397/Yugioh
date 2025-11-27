import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { DecksService } from './decks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDeckDto } from './dto/create-deck.dto';
import { SaveDeckDto } from './dto/save-deck.dto';

@Controller('decks')
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(private decksService: DecksService) {}

  @Post()
  create(@Request() req: any, @Body() createDeckDto: CreateDeckDto) {
    return this.decksService.create(req.user.id, createDeckDto);
  }

  @Get()
  async findAll(@Request() req: any) {
    // CRÍTICO: Timeout agressivo para garantir que HTTP sempre responda
    return Promise.race([
      (async () => {
        // Yield ao Event Loop ANTES de fazer query (prioriza HTTP)
        await new Promise(resolve => setImmediate(resolve));
        return this.decksService.findAll(req.user.id);
      })(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]).catch(() => {
      // Retornar array vazio em caso de timeout
      return [];
    });
  }

  // ==================== CARREGAR DECK ATUAL (DEVE VIR ANTES DO :id) ====================
  @Get('current')
  async getCurrentDeck(@Request() req: any, @Query('name') name?: string) {
    // CRÍTICO: Timeout agressivo para garantir que HTTP sempre responda
    const deckName = name || 'Meu Deck';
    return Promise.race([
      (async () => {
        // Yield ao Event Loop ANTES de fazer query (prioriza HTTP)
        await new Promise(resolve => setImmediate(resolve));
        return this.decksService.getCurrentDeck(req.user.id, deckName);
      })(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]).catch(() => {
      // Retornar deck vazio em caso de timeout
      return { id: null, name: deckName, cards: [] };
    });
  }

  // ==================== SALVAR DECK ATUAL ====================
  @Put('current')
  async saveCurrentDeck(@Request() req: any, @Body() saveDeckDto: SaveDeckDto) {
    console.log('📝 [DecksController] ==========================================');
    console.log('📝 [DecksController] Recebida requisição para salvar deck');
    console.log('📝 [DecksController] UserId:', req.user.id);
    console.log('📝 [DecksController] SaveDeckDto completo:', JSON.stringify(saveDeckDto, null, 2));
    console.log('📝 [DecksController] SaveDeckDto recebido:', {
      name: saveDeckDto.name,
      cardIdsCount: saveDeckDto.cardIds?.length || 0,
      cardIdsIsArray: Array.isArray(saveDeckDto.cardIds),
      first10CardIds: saveDeckDto.cardIds?.slice(0, 10) || [],
      allCardIds: saveDeckDto.cardIds || [],
    });
    
    // Validar se cardIds é um array
    if (!Array.isArray(saveDeckDto.cardIds)) {
      console.error('❌ [DecksController] ERRO: cardIds não é um array!', typeof saveDeckDto.cardIds);
      throw new BadRequestException('cardIds deve ser um array');
    }
    
    try {
      const result = await this.decksService.saveCurrentDeck(req.user.id, saveDeckDto);
      console.log('✅ [DecksController] Deck salvo com sucesso!');
      console.log('✅ [DecksController] Resultado:', {
        id: result.id,
        name: result.name,
        cardsCount: result.cards?.length || 0,
        cards: result.cards?.slice(0, 3) || [],
      });
      console.log('📝 [DecksController] ==========================================');
      return result;
    } catch (error: any) {
      console.error('❌ [DecksController] ERRO ao salvar deck:', error);
      console.error('❌ [DecksController] Mensagem:', error.message);
      console.error('❌ [DecksController] Status:', error.status);
      console.error('❌ [DecksController] Stack:', error.stack);
      console.error('📝 [DecksController] ==========================================');
      throw error;
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.decksService.findOne(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.decksService.delete(id, req.user.id);
  }
}
