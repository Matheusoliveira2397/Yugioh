import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import { CardType, CardAttribute, CardRarity, MonsterType } from './types';
import CardImage from '../components/CardImage';

/** Em produção, imagens externas (Yugioh API) podem falhar por CORS/referrer. Usar proxy do backend. */
function cardImageSrc(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const base = (import.meta.env.VITE_API_URL || api.defaults.baseURL || '').toString().replace(/\/$/, '');
    return base ? `${base}/cards/proxy-image?url=${encodeURIComponent(url)}` : url;
  }
  return url;
}

interface Card {
  id: string;
  name: string;
  description: string;
  type: CardType;
  rarity: CardRarity;
  monsterType?: MonsterType;
  attribute?: CardAttribute;
  level?: number;
  atk?: number;
  def?: number;
  priceCoins?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
  isActive: boolean;
  cardImage?: string;
  createdAt: string;
}

export default function AdminCardsPanel() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  
  // Estados para busca na API YGOPRODeck
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedApiCard, setSelectedApiCard] = useState<any>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [availableImages, setAvailableImages] = useState<any[]>([]);

  // Estados para sistema de skins
  const [originalCardSearch, setOriginalCardSearch] = useState('');
  const [originalCardResults, setOriginalCardResults] = useState<Card[]>([]);
  const [selectedOriginalCard, setSelectedOriginalCard] = useState<Card | null>(null);
  const [isSkin, setIsSkin] = useState(false);
  const [otherSkins, setOtherSkins] = useState<Card[]>([]); // Outras skins da mesma carta

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    idCarta: '',
    description: '',
    type: 'Monster' as CardType,
    rarity: 'Common' as CardRarity,
    monsterType: 'Normal' as MonsterType | undefined,
    attribute: 'DARK' as CardAttribute | undefined,
    race: 'Warrior' as string | undefined,
    level: 4,
    atk: 0,
    def: 0,
    spellType: 'Normal' as string | undefined,
    trapType: 'Normal' as string | undefined,
    priceCredits: 0,
    priceCash: 0,
    isForSale: true,
    cardImage: '',
    archetype: '',
    isBanned: false,
    maxCopiesInDeck: 3,
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const response = await api.get('/cards/admin/all');
      setCards(response.data);
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função para buscar cartas na API YGOPRODeck
  const searchYugiohCards = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoadingSearch(true);
    try {
      const response = await api.get('/cards/yugioh-api/search', {
        params: { query }
      });
      // Mostrar todos os resultados (sem limite) para não perder variantes
      // A API YGOPRODeck geralmente retorna até 100 resultados
      const allResults = response.data || [];
      
      // Agrupar por nome para facilitar visualização
      const groupedResults = allResults.reduce((acc: any, card: any) => {
        const name = card.name;
        if (!acc[name]) {
          acc[name] = [];
        }
        acc[name].push(card);
        return acc;
      }, {});
      
      // Converter de volta para array, mas manter agrupado
      const sortedResults = Object.values(groupedResults).flat();
      
      setSearchResults(sortedResults);
      console.log(`🔍 Encontradas ${sortedResults.length} cartas para "${query}"`);
    } catch (error: any) {
      console.error('Erro ao buscar cartas:', error);
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  // Função para buscar cartas existentes (para criar skin)
  const searchOriginalCards = (query: string) => {
    if (query.length < 2) {
      setOriginalCardResults([]);
      return;
    }
    
    const filtered = cards.filter(card => 
      card.name.toLowerCase().includes(query.toLowerCase()) && 
      card.isActive
    );
    console.log('🔍 Buscando cartas originais:', { query, totalCards: cards.length, filtered: filtered.length });
    setOriginalCardResults(filtered.slice(0, 10));
  };

  // Função para selecionar carta original (ao criar skin)
  const selectOriginalCard = (originalCard: Card) => {
    console.log('✅ Selecionando carta original:', originalCard);
    setSelectedOriginalCard(originalCard);
    setOriginalCardSearch('');
    setOriginalCardResults([]);
    
    // Preencher campos compartilhados (bloqueados para edição)
    setFormData({
      ...formData,
      name: originalCard.name, // Mesmo nome
      description: originalCard.description || '',
      type: originalCard.type,
      monsterType: originalCard.monsterType,
      attribute: originalCard.attribute,
      race: (originalCard as any).race || 'Warrior',
      level: originalCard.level || 4,
      atk: originalCard.atk || 0,
      def: originalCard.def || 0,
      spellType: (originalCard as any).spellType || 'Normal',
      trapType: (originalCard as any).trapType || 'Normal',
      archetype: (originalCard as any).archetype || '',
      isBanned: (originalCard as any).isBanned || false,
      maxCopiesInDeck: (originalCard as any).maxCopiesInDeck || 3,
      // Campos únicos da skin (podem ser diferentes)
      // Gerar idCarta único automaticamente baseado no idCarta original + timestamp
      idCarta: `${(originalCard as any).idCarta || originalCard.name.replace(/[^a-zA-Z0-9]/g, '')}_skin_${Date.now()}`,
      cardImage: '',
      rarity: originalCard.rarity, // Pode ser diferente
      priceCredits: 0,
      priceCash: 0,
      isForSale: true,
    });
    
    setMessage({ 
      type: 'success', 
      text: `✅ Carta original "${originalCard.name}" selecionada! Um ID único foi gerado automaticamente. Você pode alterá-lo se desejar.` 
    });
  };

  // Função para selecionar carta da API e preencher formulário
  const selectCardFromApi = async (apiCard: any) => {
    try {
      setLoadingSearch(true);
      // Buscar dados completos da carta (sem baixar imagem ainda)
      const response = await api.get('/cards/yugioh-api/card', {
        params: { 
          name: apiCard.name,
          downloadImage: 'false' // Não baixar ainda, apenas buscar dados
        }
      });

      const cardData = response.data;
      
      // Verificar se há múltiplas imagens
      const images = cardData.allImages || [];
      setAvailableImages(images);
      setSelectedImageIndex(0);
      
      // Preencher formulário automaticamente
      setFormData({
        ...formData,
        name: cardData.name,
        idCarta: cardData.idCarta || `YGOPRO_${Date.now()}`,
        description: cardData.description,
        cardImage: images.length > 0 ? (images[0].image_url || images[0].image_url_small) : cardData.cardImage,
        type: cardData.type,
        monsterType: cardData.monsterType,
        attribute: cardData.attribute,
        race: cardData.race,
        spellType: cardData.spellType,
        trapType: cardData.trapType,
        archetype: cardData.archetype || '',
        level: cardData.level,
        rank: cardData.rank,
        atk: cardData.atk,
        def: cardData.def,
      });

      setSelectedApiCard(cardData);
      setSearchResults([]);
      setSearchQuery('');
      
      // Mostrar preview da primeira imagem
      if (images.length > 0) {
        setImagePreview(images[0].image_url || images[0].image_url_small);
      } else if (cardData.cardImage) {
        setImagePreview(cardData.cardImage);
      }
      
      setMessage({ 
        type: 'success', 
        text: `✅ Carta "${cardData.name}" carregada da API! ${images.length > 1 ? `${images.length} imagens disponíveis. Selecione uma e clique em "Baixar Imagem".` : 'Clique em "Baixar Imagem" para salvar.'}` 
      });
    } catch (error: any) {
      console.error('Erro ao carregar carta:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro ao carregar dados da carta: ${error.response?.data?.message || error.message}` 
      });
    } finally {
      setLoadingSearch(false);
    }
  };

  // Função para selecionar uma imagem específica
  const selectImage = (index: number, imageUrl: string) => {
    setSelectedImageIndex(index);
    setImagePreview(imageUrl);
    setFormData({
      ...formData,
      cardImage: imageUrl
    });
  };

  // Função para baixar a imagem selecionada
  const downloadSelectedImage = async () => {
    if (!selectedApiCard || availableImages.length === 0) {
      setMessage({ type: 'error', text: '❌ Nenhuma imagem disponível para baixar' });
      return;
    }

    try {
      setLoadingSearch(true);
      const selectedImage = availableImages[selectedImageIndex];
      const imageUrl = selectedImage.image_url || selectedImage.image_url_small;
      
      if (!imageUrl) {
        setMessage({ type: 'error', text: '❌ URL da imagem não encontrada' });
        return;
      }

      // Baixar a imagem selecionada
      const response = await api.get('/cards/yugioh-api/card', {
        params: { 
          name: selectedApiCard.name,
          downloadImage: 'true',
          imageIndex: selectedImageIndex.toString()
        }
      });

      const cardData = response.data;
      
      // Atualizar formulário com o path local
      setFormData({
        ...formData,
        cardImage: cardData.cardImage
      });

      // Atualizar preview
      if (cardData.cardImage) {
        if (cardData.cardImage.startsWith('/images/')) {
          // Imagem salva no frontend (acesso direto)
          setImagePreview(cardData.cardImage);
        } else if (cardData.cardImage.startsWith('http://') || cardData.cardImage.startsWith('https://')) {
          // URL externa (temporária, antes de salvar)
          setImagePreview(cardData.cardImage);
        } else if (cardData.cardImage.startsWith('/uploads/cards/')) {
          // Converter caminho antigo para novo formato
          const fileName = cardData.cardImage.split('/').pop();
          setImagePreview(`/images/cards/${fileName}`);
        }
      }
      
      setMessage({ 
        type: 'success', 
        text: `✅ Imagem ${selectedImageIndex + 1} de ${availableImages.length} baixada e salva no servidor!` 
      });
    } catch (error: any) {
      console.error('Erro ao baixar imagem:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro ao baixar imagem: ${error.response?.data?.message || error.message}` 
      });
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Validação do idCarta
    if (!formData.idCarta || formData.idCarta.trim() === '') {
      setMessage({ 
        type: 'error', 
        text: '❌ ID da carta (idCarta) é obrigatório!' 
      });
      setLoading(false);
      return;
    }

    try {
      let imagePath = formData.cardImage || '';

      // Se houver uma nova imagem selecionada, fazer upload primeiro
      if (selectedImageFile) {
        try {
          const imageFormData = new FormData();
          imageFormData.append('cardImage', selectedImageFile);
          imageFormData.append('cardName', formData.name || formData.idCarta || 'card');

          const uploadResponse = await api.post('/cards/upload-image', imageFormData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          
          imagePath = uploadResponse.data.imagePath;
          console.log('✅ Imagem enviada com sucesso:', imagePath);
        } catch (uploadError: any) {
          console.error('❌ Erro ao fazer upload da imagem:', uploadError);
          setMessage({ 
            type: 'error', 
            text: `❌ Erro ao fazer upload da imagem: ${uploadError.response?.data?.message || uploadError.message || 'Erro desconhecido'}` 
          });
          setLoading(false);
          return;
        }
      }
      
      // Se não houver imagePath mas formData.cardImage existir, usar ele
      if (!imagePath && formData.cardImage) {
        imagePath = formData.cardImage;
      }
      
      console.log('📸 imagePath final:', imagePath);

      if (editingCard) {
        // EDITAR
        console.log('💾 Atualizando carta:', editingCard.id);
        
        // Limpar e validar dados antes de enviar
        const cleanedFormData: any = {};
        
        // Campos obrigatórios
        if (formData.idCarta) cleanedFormData.idCarta = String(formData.idCarta).trim();
        if (formData.name) cleanedFormData.name = String(formData.name).trim();
        if (formData.description !== undefined) cleanedFormData.description = String(formData.description || '').trim();
        if (formData.type) cleanedFormData.type = formData.type;
        if (formData.rarity) cleanedFormData.rarity = formData.rarity;
        
        // Campos opcionais - cardImage sempre incluir se tiver valor (mesmo que seja string vazia para limpar)
        if (imagePath !== undefined && imagePath !== null) {
          cleanedFormData.cardImage = imagePath;
        } else if (formData.cardImage !== undefined && formData.cardImage !== null) {
          // Se imagePath não foi definido mas formData.cardImage existe, usar ele
          cleanedFormData.cardImage = formData.cardImage;
        }
        
        // Campos específicos de Monster
        if (formData.type === 'Monster') {
          if (formData.monsterType) cleanedFormData.monsterType = formData.monsterType;
          if (formData.attribute) cleanedFormData.attribute = formData.attribute;
          if (formData.race) cleanedFormData.race = formData.race;
          if (formData.level !== undefined && formData.level !== null) {
            cleanedFormData.level = parseInt(String(formData.level)) || null;
          }
          if (formData.rank !== undefined && formData.rank !== null) {
            cleanedFormData.rank = parseInt(String(formData.rank)) || null;
          }
          if (formData.atk !== undefined && formData.atk !== null) {
            cleanedFormData.atk = parseInt(String(formData.atk)) || null;
          }
          if (formData.def !== undefined && formData.def !== null) {
            cleanedFormData.def = parseInt(String(formData.def)) || null;
          }
        }
        
        // Campos específicos de Spell
        if (formData.type === 'Spell' && formData.spellType) {
          cleanedFormData.spellType = formData.spellType;
        }
        
        // Campos específicos de Trap
        if (formData.type === 'Trap' && formData.trapType) {
          cleanedFormData.trapType = formData.trapType;
        }
        
        // Campos gerais opcionais
        if (formData.archetype) cleanedFormData.archetype = String(formData.archetype).trim();
        if (formData.isActive !== undefined) cleanedFormData.isActive = Boolean(formData.isActive);
        if (formData.isBanned !== undefined) cleanedFormData.isBanned = Boolean(formData.isBanned);
        if (formData.maxCopiesInDeck !== undefined && formData.maxCopiesInDeck !== null) {
          cleanedFormData.maxCopiesInDeck = parseInt(String(formData.maxCopiesInDeck)) || 3;
        }
        if (formData.priceCredits !== undefined && formData.priceCredits !== null) {
          cleanedFormData.priceCredits = parseInt(String(formData.priceCredits)) || null;
        }
        if (formData.priceCash !== undefined && formData.priceCash !== null) {
          cleanedFormData.priceCash = parseFloat(String(formData.priceCash)) || null;
        }
        if (formData.isForSale !== undefined) cleanedFormData.isForSale = Boolean(formData.isForSale);
        
        // Limpar campos vazios (mas manter description, cardImage e archetype mesmo se vazios)
        Object.keys(cleanedFormData).forEach(key => {
          const value = cleanedFormData[key];
          // Remover apenas se for undefined, null ou string vazia (exceto campos que podem ser vazios)
          if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            // Manter description, cardImage e archetype mesmo se vazios (podem ser atualizados para vazio)
            if (key !== 'description' && key !== 'cardImage' && key !== 'archetype') {
              delete cleanedFormData[key];
            } else if (value === '') {
              // Para campos que podem ser vazios, manter como string vazia ou null
              cleanedFormData[key] = key === 'description' ? '' : null;
            }
          }
        });
        
        console.log('📤 Dados enviados (limpos e validados):', cleanedFormData);
        const response = await api.put(`/cards/${editingCard.id}`, cleanedFormData);
        console.log('✅ Resposta do servidor:', response.data);
        setMessage({ type: 'success', text: '✅ Carta atualizada com sucesso!' });
      } else {
        // CRIAR
        console.log('➕ Criando nova carta');
        
        // Se idCarta estiver vazio, gerar um único automaticamente
        if (!formData.idCarta || formData.idCarta.trim() === '') {
          const baseName = formData.name ? formData.name.replace(/[^a-zA-Z0-9]/g, '') : 'card';
          formData.idCarta = `${baseName}_${Date.now()}`;
          console.log('🆔 idCarta gerado automaticamente:', formData.idCarta);
        }
        
        // Limpar dados removendo campos que não existem mais
        const cleanedFormData: any = {};
        const allowedFields = [
          'idCarta', 'name', 'description', 'cardImage', 'type', 'monsterType',
          'attribute', 'race', 'spellType', 'trapType', 'archetype', 'level',
          'rank', 'atk', 'def', 'rarity', 'isActive', 'isBanned', 'maxCopiesInDeck',
          'priceCredits', 'priceCash', 'isForSale'
        ];
        
        for (const key of allowedFields) {
          if (key === 'cardImage') {
            // Usar imagePath se houver upload, senão usar o valor do formData
            if (imagePath) {
              cleanedFormData[key] = imagePath;
            } else if (formData.cardImage !== undefined && formData.cardImage !== null) {
              cleanedFormData[key] = formData.cardImage;
            }
          } else if (formData[key as keyof typeof formData] !== undefined && formData[key as keyof typeof formData] !== null) {
            cleanedFormData[key] = formData[key as keyof typeof formData];
          }
        }
        
        // Garantir que idCarta está presente e não está vazio
        if (!cleanedFormData.idCarta || cleanedFormData.idCarta.trim() === '') {
          const baseName = cleanedFormData.name ? cleanedFormData.name.replace(/[^a-zA-Z0-9]/g, '') : 'card';
          cleanedFormData.idCarta = `${baseName}_${Date.now()}`;
          console.log('🆔 idCarta gerado automaticamente (fallback):', cleanedFormData.idCarta);
        }
        
        console.log('📸 cardImage no cleanedFormData:', cleanedFormData.cardImage);
        
        console.log('📤 Dados enviados (limpos):', cleanedFormData);
        const response = await api.post('/cards', cleanedFormData);
        console.log('✅ Resposta do servidor:', response.data);
        setMessage({ type: 'success', text: '✅ Carta criada com sucesso!' });
      }

      resetForm();
      loadCards();
      setShowForm(false);
      setSelectedImageFile(null);
      setImagePreview('');
    } catch (error: any) {
      console.error('❌ Erro ao salvar carta:', error);
      console.error('❌ Detalhes do erro:', error.response?.data);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (card: Card) => {
    console.log('✏️ Editando carta:', card);
    setEditingCard(card);
    
    // Validar se idCarta existe, se não, gerar um baseado no nome
    let idCarta = (card as any).idCarta || '';
    if (!idCarta || idCarta.trim() === '') {
      // Gerar ID baseado no nome da carta (remover espaços e caracteres especiais)
      idCarta = card.name.replace(/[^a-zA-Z0-9]/g, '');
      console.log('⚠️ idCarta não encontrado, gerando automaticamente:', idCarta);
    }
    
    const formDataToSet = {
      name: card.name || '',
      idCarta: idCarta,
      description: card.description || '',
      type: card.type || 'Monster' as CardType,
      rarity: card.rarity || 'Common' as CardRarity,
      monsterType: card.monsterType || 'Normal' as MonsterType | undefined,
      attribute: card.attribute || 'DARK' as CardAttribute | undefined,
      race: (card as any).race || 'Warrior',
      level: card.level ?? 4,
      atk: card.atk ?? 0,
      def: card.def ?? 0,
      spellType: (card as any).spellType || 'Normal',
      trapType: (card as any).trapType || 'Normal',
      priceCredits: card.priceCredits ?? 0,
      priceCash: card.priceCash ?? 0,
      isForSale: card.isForSale ?? true,
      cardImage: card.cardImage || '',
      archetype: (card as any).archetype || '',
      isBanned: (card as any).isBanned ?? false,
      maxCopiesInDeck: (card as any).maxCopiesInDeck ?? 3,
    };
    console.log('📝 FormData preenchido:', formDataToSet);
    setFormData(formDataToSet);
    setSelectedImageFile(null);
    setImagePreview('');
    setShowForm(true);

    // Verificar se esta carta é uma skin (existem outras cartas com o mesmo nome)
    // IMPORTANTE: A primeira carta criada (mais antiga) é a original, não é skin
    try {
      const response = await api.get(`/cards/by-name/${encodeURIComponent(card.name)}/skins`);
      const allCardsWithSameName = response.data || [];
      
      if (allCardsWithSameName.length > 1) {
        // Existem outras cartas com o mesmo nome
        // Ordenar por data de criação (a primeira é a original)
        const sortedCards = [...allCardsWithSameName].sort((a: Card, b: Card) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateA - dateB;
        });
        
        // A primeira carta (mais antiga) é a original
        const originalCard = sortedCards[0];
        const isOriginal = originalCard.id === card.id;
        
        if (isOriginal) {
          // Esta é a carta original - não é skin
          setIsSkin(false);
          // Mostrar as outras cartas como skins
          const otherSkinsList = sortedCards.slice(1); // Todas exceto a primeira (original)
          setOtherSkins(otherSkinsList);
          console.log(`📝 Carta original! Existem ${otherSkinsList.length} skin(s) desta carta.`);
        } else {
          // Esta é uma skin (não é a original)
          setIsSkin(true);
          // Mostrar a original e as outras skins (exceto a atual)
          const otherSkinsList = sortedCards.filter((c: Card) => c.id !== card.id);
          setOtherSkins(otherSkinsList);
          console.log(`🎨 Carta é uma skin! Original: ${originalCard.idCarta}, outras versões:`, otherSkinsList.length);
        }
      } else {
        // Esta é a única carta com esse nome (não é skin)
        setIsSkin(false);
        setOtherSkins([]);
      }
    } catch (error: any) {
      console.error('Erro ao verificar skins:', error);
      // Se der erro, assumir que não é skin
      setIsSkin(false);
      setOtherSkins([]);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente desativar esta carta?')) return;

    try {
      const response = await api.delete(`/cards/${id}`);
      setMessage({ type: 'success', text: response.data?.message || '✅ Carta desativada com sucesso!' });
      loadCards();
    } catch (error: any) {
      console.error('❌ Erro ao desativar carta:', error);
      const errorMessage = error.response?.data?.message || error.message || '❌ Erro ao desativar carta';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm('⚠️ ATENÇÃO! Isso vai DELETAR PERMANENTEMENTE a carta do banco de dados. Tem certeza?')) return;

    try {
      const response = await api.delete(`/cards/${id}/hard`);
      setMessage({ type: 'success', text: response.data?.message || '✅ Carta deletada permanentemente!' });
      loadCards();
    } catch (error: any) {
      console.error('❌ Erro ao deletar carta:', error);
      const errorMessage = error.response?.data?.message || error.message || '❌ Erro ao deletar carta';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/cards/${id}/activate`, {});
      setMessage({ type: 'success', text: '✅ Carta reativada com sucesso!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao reativar carta' });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      idCarta: '',
      description: '',
      type: 'Monster' as CardType,
      rarity: 'Common' as CardRarity,
      monsterType: 'Normal' as MonsterType | undefined,
      attribute: 'DARK' as CardAttribute | undefined,
      race: 'Warrior',
      level: 4,
      atk: 0,
      def: 0,
      spellType: 'Normal',
      trapType: 'Normal',
      priceCredits: 0,
      priceCash: 0,
      isForSale: true,
      cardImage: '',
      archetype: '',
      isBanned: false,
      maxCopiesInDeck: 3,
    });
    setEditingCard(null);
    setSelectedImageFile(null);
    setImagePreview('');
    setSelectedApiCard(null);
    setAvailableImages([]);
    setSelectedImageIndex(0);
    setSearchQuery('');
    setSearchResults([]);
    setOriginalCardSearch('');
    setOriginalCardResults([]);
    setSelectedOriginalCard(null);
    setIsSkin(false);
    setOtherSkins([]);
  };

  const filteredCards = cards
    .filter(card => {
      if (filter === 'active') return card.isActive;
      if (filter === 'inactive') return !card.isActive;
      return true;
    })
    .filter(card => 
      card.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">🎴 Gerenciamento de Cartas</h1>
            <p className="text-gray-300">Crie e gerencie todas as cartas do jogo</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
          >
            {showForm ? '❌ Cancelar' : '➕ Nova Carta'}
          </button>
        </div>
      </div>

      {/* Mensagem */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-900/50 border border-green-500' 
              : 'bg-red-900/50 border border-red-500'
          }`}
        >
          <p className="text-white font-semibold">{message.text}</p>
        </motion.div>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-gray-800 rounded-lg p-4 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-purple-500/50"
          >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              {editingCard ? '✏️ Editar Carta' : '➕ Nova Carta'}
            </h2>
            <button
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="text-gray-400 hover:text-white text-xl font-bold transition-colors"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Busca na API YGOPRODeck */}
            {!selectedOriginalCard && (
              <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-500/50">
                <h3 className="text-sm font-bold mb-3 text-blue-400">🔍 Buscar Carta na API YGOPRODeck</h3>
                <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchYugiohCards(e.target.value);
                  }}
                  placeholder="Digite o nome da carta para buscar..."
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                {loadingSearch && (
                  <div className="absolute right-3 top-2.5 text-blue-400">⏳</div>
                )}
                </div>
              
              {/* Lista de resultados */}
              {searchResults.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 mb-2 px-1">
                    📋 {searchResults.length} {searchResults.length === 1 ? 'carta encontrada' : 'cartas encontradas'}
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-lg max-h-96 overflow-y-auto">
                    {searchResults.map((card, index) => (
                      <div
                        key={`${card.id || card.name}-${index}`}
                        onClick={() => selectCardFromApi(card)}
                        className="p-3 hover:bg-gray-800 cursor-pointer border-b border-gray-700 last:border-b-0 flex items-center gap-3"
                      >
                        {card.card_images?.[0]?.image_url_small && (
                          <img 
                            src={cardImageSrc(card.card_images[0].image_url_small)} 
                            alt={card.name}
                            className="w-12 h-16 object-contain flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-sm truncate">{card.name}</div>
                          <div className="text-xs text-gray-400">{card.type}</div>
                          {card.atk !== undefined && (
                            <div className="text-xs text-gray-500">ATK: {card.atk} {card.def !== undefined ? `/ DEF: ${card.def}` : ''}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedApiCard && (
                <div className="mt-3 space-y-3">
                  <div className="p-3 bg-green-900/20 border border-green-500 rounded-lg">
                    <p className="text-green-400 font-semibold text-sm">
                      ✅ Carta "{selectedApiCard.name}" carregada da API!
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {availableImages.length > 1 
                        ? `${availableImages.length} imagens disponíveis. Selecione uma abaixo e clique em "Baixar Imagem".`
                        : 'Selecione a imagem abaixo e clique em "Baixar Imagem" para salvar.'}
                    </p>
                  </div>

                  {/* Galeria de Imagens Disponíveis */}
                  {availableImages.length > 0 && (
                    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                      <h4 className="text-xs font-bold mb-2 text-blue-400">
                        🖼️ Imagens Disponíveis ({availableImages.length})
                      </h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
                        {availableImages.map((img: any, index: number) => {
                          const imageUrl = img.image_url_small || img.image_url;
                          const isSelected = index === selectedImageIndex;
                          return (
                            <div
                              key={index}
                              onClick={() => selectImage(index, img.image_url || img.image_url_small)}
                              className={`relative cursor-pointer rounded border-2 transition-all ${
                                isSelected 
                                  ? 'border-blue-500 ring-2 ring-blue-500/50' 
                                  : 'border-gray-700 hover:border-blue-400'
                              }`}
                            >
                              <img
                                src={cardImageSrc(imageUrl)}
                                alt={`${selectedApiCard.name} - Imagem ${index + 1}`}
                                className="w-full h-24 object-contain rounded"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              {isSelected && (
                                <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                  ✓
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-0.5">
                                #{index + 1}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={downloadSelectedImage}
                        disabled={loadingSearch}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-white text-sm font-bold transition-all"
                      >
                        {loadingSearch ? '⏳ Baixando...' : `📥 Baixar Imagem Selecionada (${selectedImageIndex + 1}/${availableImages.length})`}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            )}

            {/* Informações Básicas */}
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-bold mb-3 text-purple-400">📝 Informações Básicas</h3>
              
              {/* Checkbox: É Skin */}
              <div className="mb-4 p-3 bg-purple-900/20 border border-purple-500/50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSkin}
                    onChange={(e) => {
                      setIsSkin(e.target.checked);
                      if (!e.target.checked) {
                        // Se desmarcar, limpar seleção de carta original
                        setSelectedOriginalCard(null);
                        setOriginalCardSearch('');
                        setOriginalCardResults([]);
                        setOtherSkins([]);
                      }
                    }}
                    disabled={editingCard !== null && otherSkins.length > 0}
                    className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-white font-semibold text-sm">
                    🎨 Esta é uma skin de uma carta existente
                    {editingCard && otherSkins.length > 0 && (
                      <span className="text-purple-400 ml-2">(Detectado automaticamente)</span>
                    )}
                  </span>
                </label>
                <div className="text-xs text-gray-400 mt-1 ml-7">
                  {editingCard && otherSkins.length > 0 ? (
                    <>
                      {isSkin ? (
                        <>
                          <p className="mb-2">
                            <span className="text-purple-400 font-semibold">🎨 Esta é uma skin!</span> Existem {otherSkins.length} outra(s) versão(ões) de "{editingCard.name}".
                          </p>
                          {otherSkins.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <span className="text-purple-400 font-semibold">Outras versões:</span>
                              {otherSkins.map((otherCard) => {
                                // Ordenar todas as cartas para identificar qual é a original
                                const allCards = editingCard ? [editingCard, ...otherSkins] : otherSkins;
                                const sorted = [...allCards].sort((a, b) => {
                                  const dateA = new Date(a.createdAt || 0).getTime();
                                  const dateB = new Date(b.createdAt || 0).getTime();
                                  return dateA - dateB;
                                });
                                const isOriginalCard = sorted[0] && sorted[0].id === otherCard.id;
                                return (
                                  <div key={otherCard.id} className="text-gray-300 ml-2">
                                    {isOriginalCard ? '📝 Original:' : '🎨 Skin:'} {otherCard.idCarta || otherCard.id} {otherCard.rarity && `(${otherCard.rarity})`}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="mb-2">
                            <span className="text-green-400 font-semibold">📝 Esta é a carta original!</span> Existem {otherSkins.length} skin(s) desta carta.
                          </p>
                          {otherSkins.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <span className="text-purple-400 font-semibold">Skins:</span>
                              {otherSkins.map((skin) => (
                                <div key={skin.id} className="text-gray-300 ml-2">
                                  🎨 {skin.idCarta || skin.id} {skin.rarity && `(${skin.rarity})`}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <p>Marque esta opção se esta carta é uma skin (versão alternativa) de uma carta existente. Isso permite controlar se a skin aparece na loja separadamente.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-bold mb-1">
                    Nome da Carta * 
                    {selectedOriginalCard && (
                      <span className="text-orange-400 ml-1">(Bloqueado - herdado da carta original)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={selectedOriginalCard !== null}
                    className={`w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 transition-colors ${
                      selectedOriginalCard ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                    placeholder="Ex: Mago Negro"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">🆔 ID Carta *</label>
                  <input
                    type="text"
                    required
                    value={formData.idCarta}
                    onChange={(e) => setFormData({ ...formData, idCarta: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Ex: DM-001"
                  />
                </div>
              </div>
              
              <div className="mb-3">
                <label className="block text-xs font-bold mb-1">
                  Descrição * 
                  {selectedOriginalCard && (
                    <span className="text-orange-400 ml-1">(Bloqueado - herdado da carta original)</span>
                  )}
                </label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={selectedOriginalCard !== null}
                  className={`w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 h-20 transition-colors ${
                    selectedOriginalCard ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                  placeholder="Ex: The ultimate wizard..."
                />
              </div>

              {/* Upload de Imagem */}
              <div className="border-2 border-dashed border-gray-700 rounded p-3 hover:border-purple-500 transition-colors">
                <label className="block text-xs font-bold mb-2">🖼️ Imagem da Carta</label>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedImageFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setImagePreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                          setFormData({ ...formData, cardImage: '' });
                        }
                      }}
                      className="block w-full text-xs text-gray-400
                        file:mr-2 file:py-1 file:px-3
                        file:rounded file:border-0
                        file:text-xs file:font-bold
                        file:bg-purple-600 file:text-white
                        hover:file:bg-purple-700 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.cardImage}
                      onChange={(e) => {
                        setFormData({ ...formData, cardImage: e.target.value });
                        if (e.target.value) {
                          setSelectedImageFile(null);
                          setImagePreview('');
                        }
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-purple-500 mt-2"
                      placeholder="URL da imagem..."
                    />
                  </div>
                  {(imagePreview || formData.cardImage) && (
                    <div className="flex-shrink-0">
                      <img 
                        src={(imagePreview || formData.cardImage)?.startsWith('data:') ? (imagePreview || formData.cardImage) : cardImageSrc(imagePreview || formData.cardImage)} 
                        alt="Preview" 
                        className="w-24 h-32 object-contain rounded border-2 border-purple-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tipo e Raridade */}
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-bold mb-3 text-purple-400">🎯 Tipo e Classificação</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">
                  Tipo * 
                  {selectedOriginalCard && (
                    <span className="text-orange-400 ml-1">(Bloqueado)</span>
                  )}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as CardType })}
                  disabled={selectedOriginalCard !== null}
                  className={`w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 ${
                    selectedOriginalCard ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <option value="Monster">Monster</option>
                  <option value="Spell">Spell</option>
                  <option value="Trap">Trap</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Raridade *</label>
                <select
                  value={formData.rarity}
                  onChange={(e) => setFormData({ ...formData, rarity: e.target.value as CardRarity })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="Common">Common</option>
                  <option value="Rare">Rare</option>
                  <option value="Super Rare">Super Rare</option>
                  <option value="Ultra Rare">Ultra Rare</option>
                  <option value="Secret Rare">Secret Rare</option>
                  <option value="Legendary">Legendary</option>
                </select>
              </div>
              {formData.type === 'Monster' && (
                <>
                  <div>
                    <label className="block text-xs font-bold mb-1">Tipo de Monstro</label>
                    <select
                      value={formData.monsterType || ''}
                      onChange={(e) => setFormData({ ...formData, monsterType: e.target.value as MonsterType })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Effect">Effect</option>
                      <option value="Fusion">Fusion</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Atributo</label>
                    <select
                      value={formData.attribute || ''}
                      onChange={(e) => setFormData({ ...formData, attribute: e.target.value as CardAttribute })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    >
                      <option value="DARK">DARK</option>
                      <option value="LIGHT">LIGHT</option>
                      <option value="WATER">WATER</option>
                      <option value="FIRE">FIRE</option>
                      <option value="EARTH">EARTH</option>
                      <option value="WIND">WIND</option>
                    </select>
                  </div>
                </>
              )}
              </div>
            </div>

            {/* Stats de Monstro */}
            {formData.type === 'Monster' && (
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold mb-3 text-purple-400">⚔️ Atributos de Monstro</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Raça/Race *</label>
                    <select
                      value={formData.race || ''}
                      onChange={(e) => setFormData({ ...formData, race: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    >
                      <option value="Warrior">Warrior</option>
                      <option value="Spellcaster">Spellcaster</option>
                      <option value="Dragon">Dragon</option>
                      <option value="Zombie">Zombie</option>
                      <option value="Fiend">Fiend</option>
                      <option value="Machine">Machine</option>
                      <option value="Aqua">Aqua</option>
                      <option value="Pyro">Pyro</option>
                      <option value="Rock">Rock</option>
                      <option value="Winged Beast">Winged Beast</option>
                      <option value="Plant">Plant</option>
                      <option value="Insect">Insect</option>
                      <option value="Thunder">Thunder</option>
                      <option value="Beast">Beast</option>
                      <option value="Beast-Warrior">Beast-Warrior</option>
                      <option value="Dinosaur">Dinosaur</option>
                      <option value="Fish">Fish</option>
                      <option value="Sea Serpent">Sea Serpent</option>
                      <option value="Reptile">Reptile</option>
                      <option value="Psychic">Psychic</option>
                      <option value="Divine-Beast">Divine-Beast</option>
                      <option value="Creator God">Creator God</option>
                      <option value="Wyrm">Wyrm</option>
                      <option value="Cyberse">Cyberse</option>
                      <option value="Fairy">Fairy</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Level</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Arquétipo</label>
                    <input
                      type="text"
                      value={formData.archetype}
                      onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                      placeholder="Ex: Blue-Eyes"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">ATK</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.atk}
                      onChange={(e) => setFormData({ ...formData, atk: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">DEF</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.def}
                      onChange={(e) => setFormData({ ...formData, def: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Campos de Spell */}
            {formData.type === 'Spell' && (
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold mb-3 text-purple-400">✨ Atributos de Magia</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Tipo de Magia</label>
                  <select
                    value={formData.spellType || 'Normal'}
                    onChange={(e) => setFormData({ ...formData, spellType: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Quick-Play">Quick-Play</option>
                    <option value="Continuous">Continuous</option>
                    <option value="Equip">Equip</option>
                    <option value="Field">Field</option>
                    <option value="Ritual">Ritual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Arquétipo</label>
                  <input
                    type="text"
                    value={formData.archetype}
                    onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    placeholder="Ex: Dark Magician"
                  />
                </div>
              </div>
              </div>
            )}

            {/* Campos de Trap */}
            {formData.type === 'Trap' && (
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold mb-3 text-purple-400">🪤 Atributos de Armadilha</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Tipo de Armadilha</label>
                  <select
                    value={formData.trapType || 'Normal'}
                    onChange={(e) => setFormData({ ...formData, trapType: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Continuous">Continuous</option>
                    <option value="Counter">Counter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Arquétipo</label>
                  <input
                    type="text"
                    value={formData.archetype}
                    onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    placeholder="Ex: Solemn"
                  />
                </div>
              </div>
              </div>
            )}

            {/* Preços e Configurações */}
            <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-lg p-4 border border-purple-500/50">
              <h3 className="text-sm font-bold mb-4 text-purple-300">💰 Preços e Disponibilidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {/* Card Créditos */}
                <div className="bg-gray-800/50 rounded-lg p-3 border-2 border-purple-500/30 hover:border-purple-500 transition-colors">
                  <label className="flex items-center gap-2 text-xs font-bold mb-1 text-purple-400">
                    <span>💎</span> Créditos
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCredits}
                    onChange={(e) => setFormData({ ...formData, priceCredits: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Ex: 100"
                  />
                </div>

                {/* Card Cash */}
                <div className="bg-gray-800/50 rounded-lg p-3 border-2 border-green-500/30 hover:border-green-500 transition-colors">
                  <label className="flex items-center gap-2 text-xs font-bold mb-1 text-green-400">
                    <span>💵</span> Cash (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-500 transition-colors"
                    placeholder="Ex: 4.99"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-3 mb-3">
                <label className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded cursor-pointer hover:bg-gray-800 transition-colors border border-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isForSale}
                    onChange={(e) => setFormData({ ...formData, isForSale: e.target.checked })}
                    className="w-4 h-4 accent-green-500"
                  />
                  <span className="text-xs font-bold text-green-400">🛒 Na Loja</span>
                </label>
                <label className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded cursor-pointer hover:bg-gray-800 transition-colors border border-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isBanned}
                    onChange={(e) => setFormData({ ...formData, isBanned: e.target.checked })}
                    className="w-4 h-4 accent-red-500"
                  />
                  <span className="text-xs font-bold text-red-400">🚫 Banida</span>
                </label>
              </div>
              
              {/* Máximo de Cópias no Deck */}
              <div>
                <label className="block text-xs font-bold mb-1">
                  📊 Máximo de Cópias no Deck *
                </label>
                <select
                  value={formData.maxCopiesInDeck}
                  onChange={(e) => setFormData({ ...formData, maxCopiesInDeck: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="0">0 - Banida</option>
                  <option value="1">1 - Limitada</option>
                  <option value="2">2 - Semi-limitada</option>
                  <option value="3">3 - Ilimitada</option>
                </select>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded text-sm disabled:opacity-50"
              >
                {loading ? 'Salvando...' : editingCard ? '💾 Atualizar' : '✨ Criar'}
              </button>
            </div>
          </form>
          </motion.div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder="🔍 Buscar carta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
        >
          <option value="all">Todas ({cards.length})</option>
          <option value="active">Ativas ({cards.filter(c => c.isActive).length})</option>
          <option value="inactive">Inativas ({cards.filter(c => !c.isActive).length})</option>
        </select>
      </div>

      {/* Listagem de Cartas */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-2xl text-gray-300">⏳ Carregando cartas...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
          {filteredCards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02, duration: 0.2 }}
              whileHover={{ scale: 1.05, zIndex: 10 }}
              onClick={() => setSelectedCard(card)}
              className={`group relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg overflow-hidden shadow-lg border-2 transition-all duration-200 cursor-pointer ${
                card.isActive 
                  ? 'border-green-500/50 hover:border-green-400' 
                  : 'border-red-500/50 hover:border-red-400'
              }`}
            >
              {/* Badge de Status */}
              <div className={`absolute top-1 right-1 z-10 w-3 h-3 rounded-full shadow-lg ${
                card.isActive 
                  ? 'bg-green-500' 
                  : 'bg-red-500'
              }`} title={card.isActive ? 'Ativa' : 'Inativa'} />

              {/* Preview da Carta - Menor */}
              <div className="relative flex items-center justify-center p-2">
                <div className="relative w-full aspect-[2/3]">
                  <CardImage
                    card={card}
                    className="w-full h-full object-cover rounded transition-transform duration-200 group-hover:scale-110"
                    fallback="/images/fundoCarta.webp"
                  />
                </div>
              </div>

              {/* Nome - Apenas */}
              <div className="p-2 bg-slate-900/80 backdrop-blur-sm">
                <h3 className="text-xs font-bold text-white text-center line-clamp-2 min-h-[2rem] group-hover:text-purple-300 transition-colors">
                  {card.name}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de Detalhes da Carta */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setSelectedCard(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl border-2 border-purple-500/50"
          >
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold">{selectedCard.name}</h2>
              <button
                onClick={() => setSelectedCard(null)}
                className="text-gray-400 hover:text-white text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Imagem da Carta - Tamanho Completo */}
              <div className="flex justify-center items-start">
                <div className="relative w-full max-w-[400px] aspect-[2/3]">
                  <CardImage
                    card={selectedCard}
                    className="w-full h-full object-contain rounded-lg shadow-2xl"
                    fallback="/images/fundoCarta.webp"
                  />
                </div>
              </div>

              {/* Informações - Compacto */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">ID</p>
                    <p className="text-sm font-mono">{(selectedCard as any).idCarta || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Tipo</p>
                    <p className="text-sm font-bold">{selectedCard.type}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Raridade</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      selectedCard.rarity === 'Common' ? 'bg-gray-600 text-white' :
                      selectedCard.rarity === 'Rare' ? 'bg-blue-600 text-white' :
                      selectedCard.rarity === 'Super Rare' ? 'bg-purple-600 text-white' :
                      selectedCard.rarity === 'Ultra Rare' ? 'bg-yellow-600 text-white' :
                      selectedCard.rarity === 'Secret Rare' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {selectedCard.rarity}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Status</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      selectedCard.isActive 
                        ? 'bg-green-500 text-white' 
                        : 'bg-red-500 text-white'
                    }`}>
                      {selectedCard.isActive ? '✓ ATIVA' : '✗ INATIVA'}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Descrição</p>
                  <p className="text-xs text-gray-300 line-clamp-3">{selectedCard.description || 'Sem descrição'}</p>
                </div>

                {selectedCard.type === 'Monster' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {(selectedCard as any).monsterType && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Tipo</p>
                          <p className="text-xs">{(selectedCard as any).monsterType}</p>
                        </div>
                      )}
                      {selectedCard.attribute && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Atributo</p>
                          <p className="text-xs">{selectedCard.attribute}</p>
                        </div>
                      )}
                      {(selectedCard as any).race && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Raça</p>
                          <p className="text-xs">{(selectedCard as any).race}</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-yellow-900/50 px-2 py-1.5 rounded text-center border border-yellow-700/50">
                        <p className="text-xs text-yellow-300 mb-0.5">Nível</p>
                        <p className="text-sm font-bold text-yellow-400">⭐ {selectedCard.level || 0}</p>
                      </div>
                      <div className="bg-red-900/50 px-2 py-1.5 rounded text-center border border-red-700/50">
                        <p className="text-xs text-red-300 mb-0.5">ATK</p>
                        <p className="text-sm font-bold text-red-400">⚔️ {selectedCard.atk || 0}</p>
                      </div>
                      <div className="bg-blue-900/50 px-2 py-1.5 rounded text-center border border-blue-700/50">
                        <p className="text-xs text-blue-300 mb-0.5">DEF</p>
                        <p className="text-sm font-bold text-blue-400">🛡️ {selectedCard.def || 0}</p>
                      </div>
                    </div>
                  </>
                )}

                {(selectedCard.type === 'Spell' || selectedCard.type === 'Trap') && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">
                      {selectedCard.type === 'Spell' ? 'Tipo de Magia' : 'Tipo de Armadilha'}
                    </p>
                    <p className="text-xs">
                      {selectedCard.type === 'Spell' 
                        ? ((selectedCard as any).spellType || 'N/A')
                        : ((selectedCard as any).trapType || 'N/A')
                      }
                    </p>
                  </div>
                )}

                {(selectedCard.priceCredits || selectedCard.priceCash) && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Preços</p>
                    <div className="flex gap-2 flex-wrap">
                      {selectedCard.priceCredits && selectedCard.priceCredits > 0 && (
                        <span className="bg-purple-600/30 px-2 py-1 rounded text-xs font-semibold border border-purple-500/30">
                          💎 {selectedCard.priceCredits.toLocaleString()}
                        </span>
                      )}
                      {selectedCard.priceCash && selectedCard.priceCash > 0 && (
                        <span className="bg-green-600/30 px-2 py-1 rounded text-xs font-semibold border border-green-500/30">
                          💵 R$ {selectedCard.priceCash.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Criada em</p>
                  <p className="text-xs text-gray-300">{new Date(selectedCard.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>

            {/* Ações - Compacto */}
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
              <button
                onClick={() => {
                  handleEdit(selectedCard);
                  setSelectedCard(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-lg transition-colors"
                title="Editar"
              >
                ⚙️
              </button>
              {selectedCard.isActive ? (
                <button
                  onClick={() => {
                    handleDelete(selectedCard.id);
                    setSelectedCard(null);
                  }}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                >
                  🔒 Desativar
                </button>
              ) : (
                <button
                  onClick={() => {
                    handleActivate(selectedCard.id);
                    setSelectedCard(null);
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                >
                  ✅ Ativar
                </button>
              )}
              <button
                onClick={() => {
                  handleHardDelete(selectedCard.id);
                  setSelectedCard(null);
                }}
                className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                title="Deletar permanentemente"
              >
                🗑️
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {filteredCards.length === 0 && !loading && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 border-slate-700"
        >
          <div className="text-8xl mb-6 animate-bounce">📦</div>
          <p className="text-3xl font-bold text-gray-300 mb-3">Nenhuma carta encontrada</p>
          <p className="text-gray-400 mb-6">Crie sua primeira carta clicando no botão "Nova Carta" acima</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/50"
          >
            ➕ Criar Primeira Carta
          </button>
        </motion.div>
      )}
    </div>
  );
}
