import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { UploadService } from '../../upload/upload.service';
import { Card, CardRarity } from '../entities/card.entity';

@Injectable()
export class YugiohApiService {
  private readonly API_BASE_URL = 'https://db.ygoprodeck.com/api/v7';

  /** Domínios permitidos para proxy de imagem (evitar abuso) */
  private readonly ALLOWED_IMAGE_HOSTS = ['images.ygoprodeck.com', 'storage.googleapis.com', 'db.ygoprodeck.com'];

  constructor(private readonly uploadService: UploadService) {}

  /**
   * Busca uma imagem por URL e retorna o buffer + content-type.
   * Usado pelo endpoint proxy para exibir imagens externas em produção (evita CORS/referrer).
   */
  async fetchImageByUrl(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('URL da imagem é obrigatória');
    }
    const parsed = new URL(imageUrl);
    const isAllowedHost =
      this.ALLOWED_IMAGE_HOSTS.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h),
      ) ||
      // Supabase Storage público:
      // https://<ref>.supabase.co/storage/v1/object/public/<bucket>/path
      (parsed.hostname.endsWith('.supabase.co') &&
        parsed.pathname.startsWith('/storage/v1/object/public/'));

    if (!isAllowedHost) {
      throw new Error('Domínio da imagem não permitido para proxy');
    }
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { Accept: 'image/*' },
      maxRedirects: 3,
      validateStatus: (status) => status === 200,
    });
    const contentType = response.headers['content-type']?.split(';')[0]?.trim() || 'image/jpeg';
    return { buffer: Buffer.from(response.data), contentType };
  }

  /** Tradução opcional para import em massa (evita chamar em milhares de cartas sem necessidade). */
  async translateDescription(text: string): Promise<string> {
    if (!text?.trim()) return text || '';
    if (this.isPortuguese(text)) return text;
    return this.translateToPortuguese(text);
  }

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
   * Baixa o catálogo completo da YGOPRODeck (uma requisição; pode levar ~1–3 min e ~15k+ cartas).
   */
  async fetchAllCardData(): Promise<any[]> {
    const response = await axios.get(`${this.API_BASE_URL}/cardinfo.php`, {
      timeout: 300000,
      validateStatus: (s) => s === 200 || s === 400,
    });
    if (response.status !== 200 || !response.data?.data) {
      throw new Error(
        response.data?.error || `YGOPRODeck retornou status ${response.status}`,
      );
    }
    return response.data.data;
  }

  /** Banlist TCG (fallback OCG) a partir do objeto da API, sem nova requisição. */
  parseBanlistFromApiCard(apiCard: any): { maxCopies: number; isBanned: boolean } {
    const banlistInfo = apiCard?.banlist_info;
    if (!banlistInfo) {
      return { maxCopies: 3, isBanned: false };
    }
    const tryParse = (raw: unknown): { maxCopies: number; isBanned: boolean } | null => {
      if (!raw || typeof raw !== 'string') return null;
      const v = raw.toLowerCase().trim();
      if (v === 'banned') return { maxCopies: 0, isBanned: true };
      if (v === 'limited') return { maxCopies: 1, isBanned: false };
      if (v === 'semi-limited' || v === 'semi limited') return { maxCopies: 2, isBanned: false };
      return null;
    };
    const tcg = tryParse(banlistInfo.ban_tcg);
    if (tcg) return tcg;
    const ocg = tryParse(banlistInfo.ban_ocg);
    if (ocg) return ocg;
    return { maxCopies: 3, isBanned: false };
  }

  /**
   * Converte um registro da API em campos persistíveis (sem tradução).
   * @param artImageId id de card_images; define idCarta YGOPRO_<id>
   * @param imageUrl URL da arte (preferir image_url da API)
   */
  mapApiCardToImportPartial(
    apiCard: any,
    options?: { artImageId?: number; imageUrl?: string; descriptionOverride?: string },
  ): Partial<Card> {
    const artId = options?.artImageId ?? apiCard.id;
    const idCarta = `YGOPRO_${artId}`;
    const imageUrl =
      options?.imageUrl ||
      apiCard.card_images?.[0]?.image_url ||
      apiCard.card_images?.[0]?.image_url_small ||
      '';
    const desc =
      (options?.descriptionOverride ??
        (typeof apiCard.desc === 'string' ? apiCard.desc : '')) || '';

    const ban = this.parseBanlistFromApiCard(apiCard);
    const typeStr = String(apiCard.type || '');
    const base: Partial<Card> = {
      name: apiCard.name,
      idCarta,
      description: desc,
      cardImage: imageUrl || undefined,
      type: this.mapCardType(typeStr) as Card['type'],
      archetype: apiCard.archetype || undefined,
      rarity: CardRarity.COMMON,
      isActive: true,
      isBanned: ban.isBanned,
      maxCopiesInDeck: ban.maxCopies,
      isForSale: false,
    };

    if (typeStr.includes('Monster') || typeStr === 'Token') {
      base.monsterType = this.mapMonsterType(typeStr) as Card['monsterType'];
      base.attribute = this.mapAttribute(apiCard.attribute) as Card['attribute'];
      base.race = this.mapRace(apiCard.race) as Card['race'];
      const lv = apiCard.level;
      if (typeof lv === 'number' && lv > 0) {
        base.level = lv;
      }
      if (typeof apiCard.rank === 'number' && apiCard.rank > 0) {
        base.rank = apiCard.rank;
      }
      const atk = this.parseStat(apiCard.atk);
      const def = this.parseStat(apiCard.def);
      if (atk !== undefined) base.atk = atk;
      if (def !== undefined) base.def = def;
    }

    if (typeStr.includes('Spell') || typeStr.toLowerCase().includes('skill')) {
      base.spellType = this.mapSpellType(typeStr) as Card['spellType'];
    }
    if (typeStr.includes('Trap')) {
      base.trapType = this.mapTrapType(typeStr) as Card['trapType'];
    }

    return base;
  }

  /** Monster / Spell / Trap — filtro do import em massa (mesma regra de `mapApiCardToImportPartial`). */
  getImportCardTypeFromApi(apiCard: any): 'Monster' | 'Spell' | 'Trap' {
    return this.mapCardType(String(apiCard?.type || ''));
  }

  /** Subtipo de monstro mapeado como no import; null se não for monstro/token. */
  getImportMonsterSubtypeFromApi(apiCard: any): string | null {
    const typeStr = String(apiCard?.type || '');
    if (!typeStr.includes('Monster') && typeStr !== 'Token' && !typeStr.includes('Token')) {
      return null;
    }
    return this.mapMonsterType(typeStr);
  }

  /** Subtipo de magia/skill; null se não for spell. */
  getImportSpellSubtypeFromApi(apiCard: any): string | null {
    const typeStr = String(apiCard?.type || '');
    if (!typeStr.includes('Spell') && !typeStr.toLowerCase().includes('skill')) {
      return null;
    }
    return this.mapSpellType(typeStr);
  }

  /** Subtipo de armadilha; null se não for trap. */
  getImportTrapSubtypeFromApi(apiCard: any): string | null {
    const typeStr = String(apiCard?.type || '');
    if (!typeStr.includes('Trap')) {
      return null;
    }
    return this.mapTrapType(typeStr);
  }

  private parseStat(v: unknown): number | undefined {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '' || t === '?') return undefined;
      const n = parseInt(t, 10);
      return Number.isNaN(n) ? undefined : n;
    }
    return undefined;
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
    const t = type || '';
    if (t.toLowerCase().includes('skill')) return 'Spell';
    if (t.includes('Spell')) return 'Spell';
    if (t.includes('Trap')) return 'Trap';
    if (t.includes('Monster') || t === 'Token' || t.includes('Token')) return 'Monster';
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

