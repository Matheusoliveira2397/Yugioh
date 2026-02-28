import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { UploadService } from '../../upload/upload.service';

@Injectable()
export class YugiohApiService {
  private readonly API_BASE_URL = 'https://db.ygoprodeck.com/api/v7';

  constructor(private readonly uploadService: UploadService) {}

  /**
   * Traduz texto de inglês para português usando API gratuita
   */
  private async translateToPortuguese(text: string): Promise<string> {
    if (!text || text.trim() === '') {
      return text;
    }

    try {
      // Usar MyMemory Translation API (gratuita, sem necessidade de chave)
      const response = await axios.get('https://api.mymemory.translated.net/get', {
        params: {
          q: text,
          langpair: 'en|pt-BR',
        },
        timeout: 10000,
      });

      if (response.data && response.data.responseData && response.data.responseData.translatedText) {
        return response.data.responseData.translatedText;
      }
      
      // Se falhar, retornar texto original
      return text;
    } catch (error: any) {
      console.warn('⚠️ Erro ao traduzir descrição, mantendo original:', error.message);
      return text;
    }
  }

  /**
   * Busca carta por nome
   */
  async searchCardByName(cardName: string) {
    try {
      const response = await axios.get(`${this.API_BASE_URL}/cardinfo.php`, {
        params: { name: cardName },
        timeout: 10000,
      });
      
      if (response.data.data && response.data.data.length > 0) {
        const apiCard = response.data.data[0];
        const mappedCard = this.mapApiCardToCardEntity(apiCard);
        
        // Traduzir descrição para português
        if (mappedCard.description) {
          mappedCard.description = await this.translateToPortuguese(mappedCard.description);
        }
        
        // Incluir todas as imagens disponíveis
        mappedCard.allImages = apiCard.card_images?.map((img: any) => ({
          image_url: img.image_url,
          image_url_small: img.image_url_small,
          image_url_cropped: img.image_url_cropped,
        })) || [];
        return mappedCard;
      }
      return null;
    } catch (error: any) {
      console.error('Erro ao buscar carta na API:', error.message);
      throw new Error(`Erro ao buscar carta: ${error.message}`);
    }
  }

  /**
   * Busca cartas por nome parcial (para autocomplete)
   */
  async searchCards(query: string) {
    try {
      const response = await axios.get(`${this.API_BASE_URL}/cardinfo.php`, {
        params: { fname: query }, // busca parcial por nome
        timeout: 10000,
      });
      
      return response.data.data || [];
    } catch (error: any) {
      console.error('Erro ao buscar cartas na API:', error.message);
      return [];
    }
  }

  /**
   * Busca carta e baixa a imagem automaticamente
   */
  async searchCardAndDownloadImage(cardName: string, imageIndex: number = 0) {
    try {
      const cardData = await this.searchCardByName(cardName);
      
      if (!cardData) {
        return cardData;
      }

      // Se tiver múltiplas imagens, usar a selecionada
      let imageUrl = cardData.cardImage;
      if (cardData.allImages && cardData.allImages.length > 0 && imageIndex < cardData.allImages.length) {
        imageUrl = cardData.allImages[imageIndex].image_url || cardData.allImages[imageIndex].image_url_small;
      }

      if (!imageUrl) {
        return cardData;
      }

      // Baixar e salvar a imagem usando idCarta para nomear o arquivo
      try {
        const imagePath = await this.uploadService.downloadAndSaveCardImage(
          imageUrl,
          cardData.name,
          cardData.idCarta // Passar idCarta para nomear o arquivo corretamente
        );
        cardData.cardImage = imagePath; // Substituir URL pela path local
        console.log(`✅ Imagem baixada e salva: ${imagePath}`);
      } catch (error: any) {
        console.warn('⚠️ Erro ao baixar imagem, mantendo URL original:', error.message);
        // Manter URL original se falhar
      }
      
      return cardData;
    } catch (error: any) {
      console.error('Erro ao buscar e baixar carta:', error.message);
      throw error;
    }
  }

  /**
   * Busca informações de banlist de uma carta na API
   * Retorna o número máximo de cópias permitidas no deck
   */
  async getCardBanlistInfo(cardName: string): Promise<{ maxCopies: number; isBanned: boolean }> {
    try {
      // Buscar carta na API
      const response = await axios.get(`${this.API_BASE_URL}/cardinfo.php`, {
        params: { name: cardName },
        timeout: 10000,
      });
      
      if (response.data.data && response.data.data.length > 0) {
        const apiCard = response.data.data[0];
        
        // Verificar banlist (banlist_info pode ter informações de diferentes formatos)
        const banlistInfo = apiCard.banlist_info;
        
        if (banlistInfo) {
          // Verificar banlist do TCG (formato oficial) - prioridade para TCG
          // A API pode retornar como string ou null/undefined
          const tcgBanlist = banlistInfo.ban_tcg;
          if (tcgBanlist && typeof tcgBanlist === 'string') {
            const tcgLower = tcgBanlist.toLowerCase().trim();
            if (tcgLower === 'banned') {
              return { maxCopies: 0, isBanned: true };
            } else if (tcgLower === 'limited') {
              return { maxCopies: 1, isBanned: false };
            } else if (tcgLower === 'semi-limited' || tcgLower === 'semi limited') {
              return { maxCopies: 2, isBanned: false };
            }
          }
          
          // Se TCG não tiver informação, verificar OCG
          const ocgBanlist = banlistInfo.ban_ocg;
          if (ocgBanlist && typeof ocgBanlist === 'string') {
            const ocgLower = ocgBanlist.toLowerCase().trim();
            if (ocgLower === 'banned') {
              return { maxCopies: 0, isBanned: true };
            } else if (ocgLower === 'limited') {
              return { maxCopies: 1, isBanned: false };
            } else if (ocgLower === 'semi-limited' || ocgLower === 'semi limited') {
              return { maxCopies: 2, isBanned: false };
            }
          }
        }
      }
      
      // Padrão: 3 cópias permitidas (carta ilimitada)
      return { maxCopies: 3, isBanned: false };
    } catch (error: any) {
      console.warn(`⚠️ Erro ao buscar banlist para "${cardName}":`, error.message);
      // Retornar padrão em caso de erro
      return { maxCopies: 3, isBanned: false };
    }
  }

  /**
   * Busca carta completa na API (incluindo banlist)
   */
  async getCardWithBanlist(cardName: string): Promise<{ card: any; maxCopies: number; isBanned: boolean; description: string } | null> {
    try {
      const response = await axios.get(`${this.API_BASE_URL}/cardinfo.php`, {
        params: { name: cardName },
        timeout: 10000,
      });
      
      if (response.data.data && response.data.data.length > 0) {
        const apiCard = response.data.data[0];
        
        // Obter informações de banlist
        const banlistInfo = await this.getCardBanlistInfo(cardName);
        
        // Traduzir descrição
        let description = apiCard.desc || '';
        if (description && !this.isPortuguese(description)) {
          description = await this.translateToPortuguese(description);
        }
        
        return {
          card: apiCard,
          maxCopies: banlistInfo.maxCopies,
          isBanned: banlistInfo.isBanned,
          description: description,
        };
      }
      
      return null;
    } catch (error: any) {
      console.error(`Erro ao buscar carta "${cardName}" na API:`, error.message);
      return null;
    }
  }

  /**
   * Verifica se o texto está em português (detecção simples)
   */
  isPortuguese(text: string): boolean {
    // Palavras comuns em português
    const portugueseWords = ['você', 'vocês', 'este', 'esta', 'esse', 'essa', 'aquele', 'aquela', 
                             'com', 'para', 'por', 'sobre', 'entre', 'durante', 'através', 'contra',
                             'quando', 'onde', 'como', 'porque', 'então', 'mas', 'ou', 'e', 'a', 'o',
                             'da', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'em', 'de', 'que'];
    
    const lowerText = text.toLowerCase();
    const portugueseCount = portugueseWords.filter(word => lowerText.includes(word)).length;
    const totalWords = text.split(/\s+/).length;
    
    // Se mais de 5% das palavras são portuguesas comuns, provavelmente está em português
    return portugueseCount > totalWords * 0.05 || portugueseCount > 3;
  }

  /**
   * Mapeia dados da API YGOPRODeck para o formato do seu Card Entity
   */
  private mapApiCardToCardEntity(apiCard: any): any {
    return {
      name: apiCard.name,
      idCarta: `YGOPRO_${apiCard.id}`, // ID único baseado no ID da API
      description: apiCard.desc || '',
      cardImage: apiCard.card_images?.[0]?.image_url || apiCard.card_images?.[0]?.image_url_small || '',
      type: this.mapCardType(apiCard.type),
      monsterType: apiCard.type.includes('Monster') ? this.mapMonsterType(apiCard.type) : undefined,
      attribute: this.mapAttribute(apiCard.attribute),
      race: this.mapRace(apiCard.race),
      spellType: apiCard.type.includes('Spell') ? this.mapSpellType(apiCard.type) : undefined,
      trapType: apiCard.type.includes('Trap') ? this.mapTrapType(apiCard.type) : undefined,
      archetype: apiCard.archetype || undefined,
      level: apiCard.level || undefined,
      rank: apiCard.rank || undefined,
      atk: apiCard.atk !== undefined ? apiCard.atk : undefined,
      def: apiCard.def !== undefined ? apiCard.def : undefined,
      rarity: 'Common', // A API não retorna raridade, definir padrão
      isActive: true,
      isBanned: false,
      maxCopiesInDeck: 3,
      allImages: [], // Será preenchido no método searchCardByName
    };
  }

  private mapCardType(type: string): 'Monster' | 'Spell' | 'Trap' {
    if (type.includes('Monster')) return 'Monster';
    if (type.includes('Spell')) return 'Spell';
    if (type.includes('Trap')) return 'Trap';
    return 'Monster';
  }

  private mapMonsterType(type: string): string {
    if (type.includes('Normal') && !type.includes('Tuner')) return 'Normal';
    if (type.includes('Effect') && !type.includes('Tuner')) return 'Effect';
    if (type.includes('Ritual')) return 'Ritual';
    if (type.includes('Fusion')) return 'Fusion';
    if (type.includes('Synchro')) return 'Synchro';
    if (type.includes('Xyz') || type.includes('XYZ')) return 'Xyz';
    if (type.includes('Pendulum')) return 'Pendulum';
    if (type.includes('Link')) return 'Link';
    if (type.includes('Tuner')) return 'Effect'; // Tuner é um subtipo
    return 'Normal';
  }

  private mapAttribute(attr: string): string {
    const mapping: { [key: string]: string } = {
      'DARK': 'DARK',
      'LIGHT': 'LIGHT',
      'WATER': 'WATER',
      'FIRE': 'FIRE',
      'EARTH': 'EARTH',
      'WIND': 'WIND',
      'DIVINE': 'DIVINE',
    };
    return mapping[attr] || 'DARK';
  }

  private mapRace(race: string): string {
    const raceMapping: { [key: string]: string } = {
      'Warrior': 'Warrior',
      'Spellcaster': 'Spellcaster',
      'Fairy': 'Fairy',
      'Fiend': 'Fiend',
      'Zombie': 'Zombie',
      'Machine': 'Machine',
      'Aqua': 'Aqua',
      'Pyro': 'Pyro',
      'Rock': 'Rock',
      'Winged Beast': 'Winged Beast',
      'Plant': 'Plant',
      'Insect': 'Insect',
      'Thunder': 'Thunder',
      'Dragon': 'Dragon',
      'Beast': 'Beast',
      'Beast-Warrior': 'Beast-Warrior',
      'Dinosaur': 'Dinosaur',
      'Fish': 'Fish',
      'Sea Serpent': 'Sea Serpent',
      'Reptile': 'Reptile',
      'Psychic': 'Psychic',
      'Divine-Beast': 'Divine-Beast',
      'Creator God': 'Creator God',
      'Wyrm': 'Wyrm',
      'Cyberse': 'Cyberse',
    };
    return raceMapping[race] || 'Warrior';
  }

  private mapSpellType(type: string): string {
    if (type.includes('Normal')) return 'Normal';
    if (type.includes('Continuous')) return 'Continuous';
    if (type.includes('Equip')) return 'Equip';
    if (type.includes('Field')) return 'Field';
    if (type.includes('Quick-Play')) return 'Quick-Play';
    if (type.includes('Ritual')) return 'Ritual';
    return 'Normal';
  }

  private mapTrapType(type: string): string {
    if (type.includes('Normal')) return 'Normal';
    if (type.includes('Continuous')) return 'Continuous';
    if (type.includes('Counter')) return 'Counter';
    return 'Normal';
  }
}

