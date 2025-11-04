import { Controller, Get, Post, Put, Delete, Query, Param, Body, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
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
    return this.cardsService.findOne(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createCardDto: CreateCardDto) {
    return this.cardsService.create(createCardDto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardsService.update(id, updateCardDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async delete(@Param('id') id: string) {
    await this.cardsService.delete(id);
    return { 
      success: true, 
      message: 'Carta desativada com sucesso (ainda existe no banco)' 
    };
  }

  @Delete(':id/hard')
  @UseGuards(AdminGuard)
  async hardDelete(@Param('id') id: string) {
    await this.cardsService.hardDelete(id);
    return { 
      success: true, 
      message: 'Carta deletada permanentemente do banco' 
    };
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
