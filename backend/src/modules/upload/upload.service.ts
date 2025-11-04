import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  // Caminho absoluto dentro do container - mesmo em produção compilada
  private readonly uploadPath = '/app/uploads/avatars';
  private readonly cardsPath = '/app/uploads/cards';

  constructor() {
    // Cria a pasta de uploads se não existir
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
      console.log('📁 Pasta de uploads criada:', this.uploadPath);
    }
    if (!fs.existsSync(this.cardsPath)) {
      fs.mkdirSync(this.cardsPath, { recursive: true });
      console.log('📁 Pasta de cartas criada:', this.cardsPath);
    }
  }

  async uploadAvatar(file: any, userId: string): Promise<string> {
    // Validações
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }

    // Limite de tamanho: 5MB
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 5MB.');
    }

    // Gera nome único para o arquivo
    const fileExtension = path.extname(file.originalname);
    const fileName = `user_${userId}_${Date.now()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Salva o arquivo
    fs.writeFileSync(filePath, file.buffer);

    console.log('✅ Avatar salvo:', fileName);

    // Retorna o caminho relativo (URL que será salva no banco)
    return `/uploads/avatars/${fileName}`;
  }

  async deleteAvatar(imageUrl: string): Promise<void> {
    try {
      // Se for avatar padrão, não deleta
      if (imageUrl.includes('/avatars/default')) {
        return;
      }

      // Extrai o nome do arquivo da URL
      const fileName = path.basename(imageUrl);
      const filePath = path.join(this.uploadPath, fileName);

      // Verifica se o arquivo existe e deleta
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Avatar deletado:', fileName);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar avatar:', error);
    }
  }

  async uploadCardImage(file: any, cardName: string): Promise<string> {
    // Validações
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }

    // Limite de tamanho: 10MB (cartas podem ser maiores)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 10MB.');
    }

    // Gera nome único para o arquivo
    const fileExtension = path.extname(file.originalname);
    const sanitizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fileName = `card_${sanitizedName}_${Date.now()}${fileExtension}`;
    const filePath = path.join(this.cardsPath, fileName);

    // Salva o arquivo
    fs.writeFileSync(filePath, file.buffer);

    console.log('✅ Carta salva:', fileName);

    // Retorna o caminho relativo (URL que será salva no banco)
    return `/uploads/cards/${fileName}`;
  }

  async deleteCardImage(imageUrl: string): Promise<void> {
    try {
      // Extrai o nome do arquivo da URL
      const fileName = path.basename(imageUrl);
      const filePath = path.join(this.cardsPath, fileName);

      // Verifica se o arquivo existe e deleta
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Imagem da carta deletada:', fileName);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar imagem da carta:', error);
    }
  }
}
