import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/axios';
import { CardType, CardAttribute, CardRarity, MonsterType } from './types';
import CardImage from '../components/CardImage';
import { getCardDescription } from '../utils/cardDescription';
import BulkYgoproDeckImportSection from '../components/admin/BulkYgoproDeckImportSection';

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
  idCarta?: string;
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

type TriState = 'all' | 'yes' | 'no';

interface AdminAdvancedFilters {
  types: CardType[];
  rarities: CardRarity[];
  monsterType: string;
  attribute: string;
  race: string;
  spellType: string;
  trapType: string;
  archetype: string;
  forSale: TriState;
  banned: TriState;
  hasImage: TriState;
  levelMin: string;
  levelMax: string;
  rankMin: string;
  rankMax: string;
  atkMin: string;
  atkMax: string;
  defMin: string;
  defMax: string;
  creditsMin: string;
  creditsMax: string;
  cashMin: string;
  cashMax: string;
  copiesMin: string;
  copiesMax: string;
}

const CARD_FILTER_TYPES: CardType[] = ['Monster', 'Spell', 'Trap'];

const CARD_FILTER_RARITIES: CardRarity[] = [
  'Common',
  'Rare',
  'Super Rare',
  'Ultra Rare',
  'Secret Rare',
  'Legendary',
];

/** Tipos de monstro aceitos pelo backend (admin) */
const MONSTER_TYPES_ADMIN = [
  'Normal',
  'Effect',
  'Ritual',
  'Fusion',
  'Synchro',
  'Xyz',
  'Pendulum',
  'Link',
] as const;

const ATTRIBUTE_OPTIONS: CardAttribute[] = [
  'DARK',
  'LIGHT',
  'WATER',
  'FIRE',
  'EARTH',
  'WIND',
  'DIVINE',
];

const RACE_OPTIONS = [
  'Warrior',
  'Spellcaster',
  'Dragon',
  'Zombie',
  'Fiend',
  'Machine',
  'Aqua',
  'Pyro',
  'Rock',
  'Winged Beast',
  'Plant',
  'Insect',
  'Thunder',
  'Beast',
  'Beast-Warrior',
  'Dinosaur',
  'Fish',
  'Sea Serpent',
  'Reptile',
  'Psychic',
  'Divine-Beast',
  'Creator God',
  'Wyrm',
  'Cyberse',
  'Fairy',
] as const;

const SPELL_TYPE_OPTIONS = [
  'Normal',
  'Quick-Play',
  'Continuous',
  'Equip',
  'Field',
  'Ritual',
] as const;

const TRAP_TYPE_OPTIONS = ['Normal', 'Continuous', 'Counter'] as const;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'createdAt_desc', label: 'Cadastro (mais recentes)' },
  { value: 'createdAt_asc', label: 'Cadastro (mais antigos)' },
  { value: 'name_asc', label: 'Nome A–Z' },
  { value: 'name_desc', label: 'Nome Z–A' },
  { value: 'rarity_asc', label: 'Raridade (menor → maior)' },
  { value: 'rarity_desc', label: 'Raridade (maior → menor)' },
  { value: 'priceCredits_asc', label: 'Créditos (menor)' },
  { value: 'priceCredits_desc', label: 'Créditos (maior)' },
  { value: 'priceCash_asc', label: 'Cash (menor)' },
  { value: 'priceCash_desc', label: 'Cash (maior)' },
  { value: 'atk_desc', label: 'ATK (maior)' },
  { value: 'atk_asc', label: 'ATK (menor)' },
  { value: 'level_desc', label: 'Nível (maior)' },
  { value: 'level_asc', label: 'Nível (menor)' },
];

function emptyAdminAdvanced(): AdminAdvancedFilters {
  return {
    types: [],
    rarities: [],
    monsterType: '',
    attribute: '',
    race: '',
    spellType: '',
    trapType: '',
    archetype: '',
    forSale: 'all',
    banned: 'all',
    hasImage: 'all',
    levelMin: '',
    levelMax: '',
    rankMin: '',
    rankMax: '',
    atkMin: '',
    atkMax: '',
    defMin: '',
    defMax: '',
    creditsMin: '',
    creditsMax: '',
    cashMin: '',
    cashMax: '',
    copiesMin: '',
    copiesMax: '',
  };
}

/** Preço da carta: inteiro ≥ 0 (0 é válido; evita `parseInt(x) || null`). */
function parseCardPriceInt(value: unknown): number {
  if (value === '' || value === undefined || value === null) return 0;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function advancedToQueryParams(a: AdminAdvancedFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (a.types.length) p.type = a.types.join(',');
  if (a.rarities.length) p.rarity = a.rarities.join(',');
  if (a.monsterType) p.monsterType = a.monsterType;
  if (a.attribute) p.attribute = a.attribute;
  if (a.race) p.race = a.race;
  if (a.spellType) p.spellType = a.spellType;
  if (a.trapType) p.trapType = a.trapType;
  const arch = a.archetype.trim();
  if (arch) p.archetype = arch;
  if (a.forSale !== 'all') p.forSale = a.forSale;
  if (a.banned !== 'all') p.banned = a.banned;
  if (a.hasImage !== 'all') p.hasImage = a.hasImage;
  if (a.levelMin.trim()) p.levelMin = a.levelMin.trim();
  if (a.levelMax.trim()) p.levelMax = a.levelMax.trim();
  if (a.rankMin.trim()) p.rankMin = a.rankMin.trim();
  if (a.rankMax.trim()) p.rankMax = a.rankMax.trim();
  if (a.atkMin.trim()) p.atkMin = a.atkMin.trim();
  if (a.atkMax.trim()) p.atkMax = a.atkMax.trim();
  if (a.defMin.trim()) p.defMin = a.defMin.trim();
  if (a.defMax.trim()) p.defMax = a.defMax.trim();
  if (a.creditsMin.trim()) p.priceCreditsMin = a.creditsMin.trim();
  if (a.creditsMax.trim()) p.priceCreditsMax = a.creditsMax.trim();
  if (a.cashMin.trim()) p.priceCashMin = a.cashMin.trim();
  if (a.cashMax.trim()) p.priceCashMax = a.cashMax.trim();
  if (a.copiesMin.trim()) p.maxCopiesMin = a.copiesMin.trim();
  if (a.copiesMax.trim()) p.maxCopiesMax = a.copiesMax.trim();
  return p;
}

function countActiveAdvanced(a: AdminAdvancedFilters): number {
  let n = 0;
  if (a.types.length) n++;
  if (a.rarities.length) n++;
  if (a.monsterType) n++;
  if (a.attribute) n++;
  if (a.race) n++;
  if (a.spellType) n++;
  if (a.trapType) n++;
  if (a.archetype.trim()) n++;
  if (a.forSale !== 'all') n++;
  if (a.banned !== 'all') n++;
  if (a.hasImage !== 'all') n++;
  if (a.levelMin.trim() || a.levelMax.trim()) n++;
  if (a.rankMin.trim() || a.rankMax.trim()) n++;
  if (a.atkMin.trim() || a.atkMax.trim()) n++;
  if (a.defMin.trim() || a.defMax.trim()) n++;
  if (a.creditsMin.trim() || a.creditsMax.trim()) n++;
  if (a.cashMin.trim() || a.cashMax.trim()) n++;
  if (a.copiesMin.trim() || a.copiesMax.trim()) n++;
  return n;
}

export default function AdminCardsPanel() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [listTotal, setListTotal] = useState(0);
  const [cardCounts, setCardCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listSort, setListSort] = useState('createdAt_desc');
  const [advancedDraft, setAdvancedDraft] = useState<AdminAdvancedFilters>(() => emptyAdminAdvanced());
  const [advancedApplied, setAdvancedApplied] = useState<AdminAdvancedFilters>(() => emptyAdminAdvanced());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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

  // Cache-bust: quando salvamos uma carta, forçar a imagem a recarregar na lista
  const [imageJustSavedAt, setImageJustSavedAt] = useState<Record<string, number>>({});
  /** Imagem da carta ao abrir edição — se o campo ainda for a mesma URL externa, não baixar de novo. */
  const initialCardImageOnEditRef = useRef<string>('');

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
    rank: 0,
    atk: 0,
    def: 0,
    spellType: 'Normal' as string | undefined,
    trapType: 'Normal' as string | undefined,
    priceCredits: 0,
    priceCash: 0,
    isForSale: true,
    isActive: true,
    cardImage: '',
    archetype: '',
    isBanned: false,
    maxCopiesInDeck: 3,
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  /** Seleção para ativar/desativar em lote (ids UUID) */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get<{ total: number; active: number; inactive: number }>('/cards/admin/counts');
      setCardCounts(data);
    } catch (error) {
      console.error('Erro ao carregar totais de cartas:', error);
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{
        items: Card[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>('/cards/admin/list', {
        params: {
          page,
          limit: pageSize,
          search: debouncedSearch || undefined,
          status: filter,
          sort: listSort,
          ...advancedToQueryParams(advancedApplied),
        },
      });
      setCards(data.items ?? []);
      setListTotal(Number(data.total) || 0);
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
      setCards([]);
      setListTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, filter, listSort, advancedApplied]);

  const reloadAdminCards = useCallback(async () => {
    await fetchCounts();
    await fetchList();
  }, [fetchCounts, fetchList]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    const ms = searchTerm === '' ? 0 : 350;
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, ms);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(listTotal / pageSize) || 1);
    if (page > tp) setPage(tp);
  }, [listTotal, pageSize, page]);

  useEffect(() => {
    setPage(1);
  }, [listSort]);

  useEffect(() => {
    if (!showBulkImport) return;
    const id = requestAnimationFrame(() => {
      document.getElementById('admin-bulk-ygopro-import')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [showBulkImport]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, filter, advancedApplied, pageSize]);

  const selectedCount = selectedIds.size;
  const selectedOnPageInactive = useMemo(
    () => cards.filter((c) => selectedIds.has(c.id) && !c.isActive).length,
    [cards, selectedIds],
  );
  const selectedOnPageActive = useMemo(
    () => cards.filter((c) => selectedIds.has(c.id) && c.isActive).length,
    [cards, selectedIds],
  );

  const toggleCardSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of cards) next.add(c.id);
      return next;
    });
  };

  const selectNormalMonstersOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of cards) {
        if (c.type === 'Monster' && c.monsterType === 'Normal') next.add(c.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkSetActive = async (isActive: boolean) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (ids.length > 200) {
      setMessage({
        type: 'error',
        text: 'Selecione no máximo 200 cartas por operação. Reduza a seleção ou faça em etapas.',
      });
      return;
    }
    const verb = isActive ? 'ativar' : 'desativar';
    if (
      !confirm(
        `Confirma ${verb} ${ids.length} carta(s) selecionada(s)? As que já estão no estado desejado serão ignoradas.`,
      )
    ) {
      return;
    }
    setBulkLoading(true);
    try {
      const { data } = await api.post<{ updated: number; skipped: number }>(
        '/cards/admin/bulk-set-active',
        { ids, isActive },
      );
      const u = data?.updated ?? 0;
      const s = data?.skipped ?? 0;
      setMessage({
        type: 'success',
        text:
          u > 0
            ? `✅ ${u} carta(s) ${isActive ? 'ativada(s)' : 'desativada(s)'}.${s > 0 ? ` (${s} ignorada(s) — já no estado desejado ou id não encontrado)` : ''}`
            : `Nenhuma carta alterada.${s > 0 ? ` (${s} id(s) conferidos)` : ''}`,
      });
      setSelectedIds(new Set());
      await reloadAdminCards();
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        `Erro ao ${verb} cartas em lote`;
      setMessage({ type: 'error', text: String(msg) });
    } finally {
      setBulkLoading(false);
    }
  };

  const activeAdvancedCount = useMemo(
    () => countActiveAdvanced(advancedApplied),
    [advancedApplied],
  );

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

  // Função para buscar cartas existentes (para criar skin) — servidor (lista paginada no painel)
  const searchOriginalCards = async (query: string) => {
    if (query.length < 2) {
      setOriginalCardResults([]);
      return;
    }
    try {
      const { data } = await api.get<{ items: Card[] }>('/cards/admin/list', {
        params: { page: 1, limit: 15, search: query.trim(), status: 'active' },
      });
      setOriginalCardResults((data.items ?? []).slice(0, 10));
    } catch {
      setOriginalCardResults([]);
    }
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
      isActive: (originalCard as any).isActive ?? true,
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
        text: `✅ Carta "${cardData.name}" carregada! Selecione uma imagem e clique em "Salvar" — a imagem será baixada e salva automaticamente.` 
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
        text: `✅ Imagem baixada no servidor! Agora clique em "Salvar" abaixo para gravar a carta (e a imagem) no banco.` 
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

      // Se a imagem é URL externa (ex.: Yugioh API), baixar e salvar no servidor antes de criar/editar
      // (exceto ao editar sem trocar a imagem: mesma URL de quando abriu o formulário → não baixa de novo)
      const isSupabaseStorageUrl =
        typeof imagePath === 'string' && imagePath.startsWith('https://') && imagePath.includes('supabase.co/storage');
      const isExternalHttp =
        imagePath &&
        (imagePath.startsWith('http://') || imagePath.startsWith('https://')) &&
        !isSupabaseStorageUrl;

      if (isExternalHttp) {
        const initialImg = initialCardImageOnEditRef.current ?? '';
        const skipDownload =
          !!editingCard &&
          !selectedImageFile &&
          imagePath === initialImg;

        if (!skipDownload) {
          let idCartaForImage = formData.idCarta?.trim();
          if (!idCartaForImage) {
            const baseName = formData.name ? formData.name.replace(/[^a-zA-Z0-9]/g, '') : 'card';
            idCartaForImage = `${baseName}_${Date.now()}`;
            if (!editingCard) formData.idCarta = idCartaForImage;
          }
          try {
            const downloadRes = await api.post('/cards/yugioh-api/download-image', {
              imageUrl: imagePath,
              cardName: formData.name || idCartaForImage,
              cardId: idCartaForImage,
            });
            const newPath = downloadRes.data?.imagePath;
            if (typeof newPath !== 'string' || newPath.trim() === '') {
              setMessage({ type: 'error', text: '❌ Resposta inválida ao baixar imagem. Tente novamente.' });
              setLoading(false);
              return;
            }
            imagePath = newPath.trim();
            console.log('✅ Imagem baixada e salva no servidor:', imagePath);
          } catch (e: any) {
            const msg = e.response?.data?.message || e.message || 'Não foi possível baixar e salvar a imagem.';
            setMessage({ type: 'error', text: `❌ ${msg}` });
            setLoading(false);
            return;
          }
        }
      }

      // URL externa (não do nosso storage) não pode ser cardImage; Supabase URL é aceita
      const isOurStorageUrl = imagePath && typeof imagePath === 'string' && imagePath.startsWith('https://') && imagePath.includes('supabase.co/storage');
      if (imagePath && (imagePath.startsWith('http://') || imagePath.startsWith('https://')) && !isOurStorageUrl) {
        if (editingCard?.cardImage) {
          imagePath = editingCard.cardImage;
        } else {
          setMessage({ type: 'error', text: '❌ Selecione uma imagem e use "Baixar Imagem" antes de salvar.' });
          setLoading(false);
          return;
        }
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
        
        // cardImage: path (/images/, /uploads/) ou URL do nosso storage (Supabase)
        const validCardImage = (v: string) => typeof v === 'string' && (
          v.startsWith('/images/') || v.startsWith('/uploads/') || (v.startsWith('https://') && v.includes('supabase.co/storage'))
        );
        const cardImageToSend = validCardImage(imagePath) ? imagePath : (validCardImage(formData.cardImage) ? formData.cardImage : (editingCard?.cardImage ?? ''));
        if (cardImageToSend !== undefined && cardImageToSend !== null) {
          cleanedFormData.cardImage = cardImageToSend;
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
          cleanedFormData.priceCredits = parseCardPriceInt(formData.priceCredits);
        }
        if (formData.priceCash !== undefined && formData.priceCash !== null) {
          cleanedFormData.priceCash = parseCardPriceInt(formData.priceCash);
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
        const updated = response.data;
        const savedImagePath = cleanedFormData.cardImage;
        const merged = { ...updated, ...(savedImagePath && { cardImage: savedImagePath }) };
        setCards(prev => prev.map(c => c.id === updated.id ? { ...c, ...merged } : c));
        setSelectedCard(prev => prev && prev.id === updated.id ? { ...prev, ...merged } : prev);
        setImageJustSavedAt(prev => ({ ...prev, [updated.id]: Date.now() }));
        setMessage({ type: 'success', text: '✅ Carta atualizada com sucesso!' });
        // Lista local já atualizada; evita refetch desnecessário (imagem aparece na hora).
        // Assim a nova imagem aparece na hora (evita redeploy/refresh).
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
          } else if (key === 'priceCredits' || key === 'priceCash') {
            cleanedFormData[key] = parseCardPriceInt(formData[key as keyof typeof formData]);
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
        const created = response.data;
        setImageJustSavedAt(prev => ({ ...prev, [created.id]: Date.now() }));
        setMessage({ type: 'success', text: '✅ Carta criada com sucesso!' });
      }

      resetForm();
      if (!editingCard) {
        setPage(1);
        await reloadAdminCards();
      }
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
    initialCardImageOnEditRef.current = card.cardImage || '';
    setSelectedApiCard(null);
    setAvailableImages([]);
    setSelectedImageIndex(0);
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
      priceCredits: parseCardPriceInt(card.priceCredits),
      priceCash: parseCardPriceInt(card.priceCash),
      isForSale: card.isForSale ?? true,
      isActive: (card as any).isActive ?? true,
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
    if (
      !confirm(
        'Desativar esta carta?\n\nEla sai da loja, mas continua no banco. Para cadastrar de novo com o mesmo idCarta, use exclusão permanente (🗑️) ou basta salvar de novo — o sistema reativa cartas inativas.',
      )
    )
      return;

    try {
      const response = await api.delete(`/cards/${id}`);
      setMessage({ type: 'success', text: response.data?.message || '✅ Carta desativada com sucesso!' });
      await reloadAdminCards();
    } catch (error: any) {
      console.error('❌ Erro ao desativar carta:', error);
      const errorMessage = error.response?.data?.message || error.message || '❌ Erro ao desativar carta';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleHardDelete = async (id: string) => {
    if (
      !confirm(
        '⚠️ Exclusão PERMANENTE: remove a carta do banco (e de inventários/decks).\nSó use se precisar liberar o idCarta de verdade. Tem certeza?',
      )
    )
      return;

    try {
      const response = await api.delete(`/cards/${id}/hard`);
      setMessage({ type: 'success', text: response.data?.message || '✅ Carta deletada permanentemente!' });
      await reloadAdminCards();
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
      await reloadAdminCards();
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
      isActive: true,
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
    initialCardImageOnEditRef.current = '';
  };

  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize) || 1);
  const rangeFrom = listTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, listTotal);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">🎴 Gerenciamento de Cartas</h1>
            <p className="text-gray-300">Crie e gerencie todas as cartas do jogo</p>
            <p className="text-sm text-purple-200/90 mt-2">
              Clique em <strong className="text-amber-200">Cadastro em massa</strong> para importar da YGOPRODeck.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <Link
              to="/admin/cartas/efeitos"
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-lg font-bold transition-all text-center"
            >
              ✅ Efeitos OK
            </Link>
            <button
              type="button"
              onClick={() => {
                if (showBulkImport) {
                  document.getElementById('admin-bulk-ygopro-import')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                  setShowBulkImport(true);
                }
              }}
              className="bg-amber-600 hover:bg-amber-500 text-black px-5 py-3 rounded-lg font-bold transition-all"
            >
              📥 Cadastro em massa
            </button>
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
      </div>

      {showBulkImport && (
        <BulkYgoproDeckImportSection
          defaultExpanded
          onAfterRealImport={() => void reloadAdminCards()}
          onNotify={(m) => setMessage(m)}
        />
      )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-800 rounded-lg p-3 w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl border border-purple-500/50 text-sm"
          >
          <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-800/95 z-10 py-1">
            <div>
              <h2 className="text-base font-bold">
                {editingCard ? '✏️ Editar Carta' : '➕ Nova Carta'}
              </h2>
              {editingCard && (
                <p className="text-xs text-gray-400 mt-1">
                  Preço na loja:{' '}
                  <span className="text-purple-300 font-semibold tabular-nums">
                    💎 {parseCardPriceInt(formData.priceCredits).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-gray-500 mx-1">·</span>
                  <span className="text-emerald-300 font-semibold tabular-nums">
                    💵 R$ {parseCardPriceInt(formData.priceCash).toLocaleString('pt-BR')}
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="text-gray-400 hover:text-white text-lg font-bold transition-colors"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Busca na API YGOPRODeck */}
            {!selectedOriginalCard && (
              <div className="bg-blue-900/30 rounded p-2 border border-blue-500/50">
                <h3 className="text-xs font-bold mb-2 text-blue-400">🔍 Buscar na API YGOPRODeck</h3>
                <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchYugiohCards(e.target.value);
                  }}
                  placeholder="Nome da carta..."
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                />
                {loadingSearch && (
                  <div className="absolute right-2 top-1.5 text-blue-400 text-xs">⏳</div>
                )}
                </div>
              
              {searchResults.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-1">
                    📋 {searchResults.length} resultado(s)
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded max-h-40 overflow-y-auto">
                    {searchResults.map((card, index) => (
                      <div
                        key={`${card.id || card.name}-${index}`}
                        onClick={() => selectCardFromApi(card)}
                        className="px-2 py-1.5 hover:bg-gray-800 cursor-pointer border-b border-gray-700 last:border-b-0 flex items-center gap-2"
                      >
                        {card.card_images?.[0]?.image_url_small && (
                          <img 
                            src={cardImageSrc(card.card_images[0].image_url_small)} 
                            alt={card.name}
                            className="w-8 h-11 object-contain flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-xs truncate">{card.name}</div>
                          <div className="text-xs text-gray-400">{card.type}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedApiCard && (
                <div className="mt-2 space-y-2">
                  <div className="px-2 py-1.5 bg-green-900/20 border border-green-500 rounded flex items-center justify-between gap-2">
                    <p className="text-green-400 font-semibold text-xs truncate">
                      ✅ {selectedApiCard.name}
                    </p>
                    <span className="text-gray-400 text-xs flex-shrink-0">{availableImages.length} img</span>
                  </div>

                  {availableImages.length > 0 && (
                    <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mb-2">
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
                                className="w-full h-14 object-contain rounded"
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
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-2 py-1.5 rounded text-white text-xs font-bold"
                      >
                        {loadingSearch ? '⏳ Baixando...' : `📥 Baixar imagem #${selectedImageIndex + 1}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            )}

            {/* Informações Básicas */}
            <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
              <h3 className="text-xs font-bold mb-2 text-purple-400">📝 Básico</h3>
              
              {/* Checkbox: É Skin */}
              <div className="mb-2 p-2 bg-purple-900/20 border border-purple-500/50 rounded">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSkin}
                    onChange={(e) => {
                      setIsSkin(e.target.checked);
                      if (!e.target.checked) {
                        setSelectedOriginalCard(null);
                        setOriginalCardSearch('');
                        setOriginalCardResults([]);
                        setOtherSkins([]);
                      }
                    }}
                    disabled={editingCard !== null && otherSkins.length > 0}
                    className="w-4 h-4 text-purple-500 rounded focus:ring-purple-500 disabled:opacity-50"
                  />
                  <span className="text-white font-semibold text-xs">
                    🎨 Skin de carta existente
                    {editingCard && otherSkins.length > 0 && (
                      <span className="text-purple-400 ml-1">({otherSkins.length} versões)</span>
                    )}
                  </span>
                </label>
                <div className="text-xs text-gray-400 mt-1 ml-6">
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold mb-0.5">Nome *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={selectedOriginalCard !== null}
                    className={`w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-500 ${selectedOriginalCard ? 'opacity-60' : ''}`}
                    placeholder="Mago Negro"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-0.5">ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.idCarta}
                    onChange={(e) => setFormData({ ...formData, idCarta: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-500"
                    placeholder="DM-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-0.5">🖼️ Imagem</label>
                  <div className="flex gap-1 items-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedImageFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => setImagePreview(reader.result as string);
                          reader.readAsDataURL(file);
                          setFormData({ ...formData, cardImage: '' });
                        }
                      }}
                      className="flex-1 min-w-0 text-xs text-gray-400 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-purple-600 file:text-white"
                    />
                    {(imagePreview || formData.cardImage) && (
                      <img 
                        src={(imagePreview || formData.cardImage)?.startsWith('data:') ? (imagePreview || formData.cardImage) : cardImageSrc(imagePreview || formData.cardImage)} 
                        alt="Preview" 
                        className="w-10 h-14 object-contain rounded border border-purple-500 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold mb-0.5">Descrição *</label>
                  <textarea
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={selectedOriginalCard !== null}
                    className={`w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-500 h-14 resize-none ${selectedOriginalCard ? 'opacity-60' : ''}`}
                    placeholder="The ultimate wizard..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-0.5">URL imagem</label>
                  <input
                    type="text"
                    value={formData.cardImage}
                    onChange={(e) => {
                      setFormData({ ...formData, cardImage: e.target.value });
                      if (e.target.value) { setSelectedImageFile(null); setImagePreview(''); }
                    }}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                    placeholder="Ou cole URL..."
                  />
                </div>
              </div>
            </div>

            {/* Tipo e Raridade */}
            <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
              <h3 className="text-xs font-bold mb-2 text-purple-400">🎯 Tipo</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-xs font-bold mb-0.5">Tipo *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as CardType })}
                  disabled={selectedOriginalCard !== null}
                  className={`w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm ${selectedOriginalCard ? 'opacity-60' : ''}`}
                >
                  <option value="Monster">Monster</option>
                  <option value="Spell">Spell</option>
                  <option value="Trap">Trap</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-0.5">Raridade *</label>
                <select
                  value={formData.rarity}
                  onChange={(e) => setFormData({ ...formData, rarity: e.target.value as CardRarity })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
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
                    <label className="block text-xs font-bold mb-0.5">Tipo monstro</label>
                    <select
                      value={formData.monsterType || ''}
                      onChange={(e) => setFormData({ ...formData, monsterType: e.target.value as MonsterType })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Effect">Effect</option>
                      <option value="Fusion">Fusion</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-0.5">Atributo</label>
                    <select
                      value={formData.attribute || ''}
                      onChange={(e) => setFormData({ ...formData, attribute: e.target.value as CardAttribute })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
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

            {formData.type === 'Monster' && (
              <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                <h3 className="text-xs font-bold mb-2 text-purple-400">⚔️ Monstro</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  <div>
                    <label className="block text-xs font-bold mb-0.5">Raça</label>
                    <select
                      value={formData.race || ''}
                      onChange={(e) => setFormData({ ...formData, race: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
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
                    <label className="block text-xs font-bold mb-0.5">Level</label>
                    <input type="number" min="1" max="12" value={formData.level} onChange={(e) => setFormData({ ...formData, level: Number(e.target.value) })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-0.5">Arquétipo</label>
                    <input type="text" value={formData.archetype} onChange={(e) => setFormData({ ...formData, archetype: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" placeholder="Blue-Eyes" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-0.5">ATK</label>
                    <input type="number" min="0" value={formData.atk} onChange={(e) => setFormData({ ...formData, atk: Number(e.target.value) })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-0.5">DEF</label>
                    <input type="number" min="0" value={formData.def} onChange={(e) => setFormData({ ...formData, def: Number(e.target.value) })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" />
                  </div>
                </div>
              </div>
            )}

            {formData.type === 'Spell' && (
              <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                <h3 className="text-xs font-bold mb-2 text-purple-400">✨ Magia</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-0.5">Tipo</label>
                  <select value={formData.spellType || 'Normal'} onChange={(e) => setFormData({ ...formData, spellType: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm">
                    <option value="Normal">Normal</option>
                    <option value="Quick-Play">Quick-Play</option>
                    <option value="Continuous">Continuous</option>
                    <option value="Equip">Equip</option>
                    <option value="Field">Field</option>
                    <option value="Ritual">Ritual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-0.5">Arquétipo</label>
                  <input type="text" value={formData.archetype} onChange={(e) => setFormData({ ...formData, archetype: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" placeholder="Dark Magician" />
                </div>
              </div>
              </div>
            )}

            {formData.type === 'Trap' && (
              <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                <h3 className="text-xs font-bold mb-2 text-purple-400">🪤 Armadilha</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-0.5">Tipo</label>
                  <select value={formData.trapType || 'Normal'} onChange={(e) => setFormData({ ...formData, trapType: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm">
                    <option value="Normal">Normal</option>
                    <option value="Continuous">Continuous</option>
                    <option value="Counter">Counter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-0.5">Arquétipo</label>
                  <input type="text" value={formData.archetype} onChange={(e) => setFormData({ ...formData, archetype: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm" placeholder="Solemn" />
                </div>
              </div>
              </div>
            )}

            {/* Preços e botões em uma linha */}
            <div className="bg-gray-900/50 rounded p-2 border border-gray-700 flex flex-wrap items-end gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                <div className="w-full text-[10px] font-bold text-amber-200/90 uppercase tracking-wide mb-0.5">
                  💰 Preços na loja (inteiros)
                </div>
                <div className="w-20">
                  <label className="block text-xs font-bold mb-0.5">💎 Créd.</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={formData.priceCredits}
                    onChange={(e) => setFormData({ ...formData, priceCredits: parseCardPriceInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-bold mb-0.5">💵 R$</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: parseCardPriceInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-bold mb-0.5">Cópias</label>
                  <select value={formData.maxCopiesInDeck} onChange={(e) => setFormData({ ...formData, maxCopiesInDeck: Number(e.target.value) })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm">
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
                {/* Ativar/Desativar: ao editar usa o botão (chama API); ao criar usa checkbox */}
                {editingCard ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (formData.isActive) {
                        if (!confirm('Deseja realmente desativar esta carta? Ela sairá da loja.')) return;
                        try {
                          const response = await api.delete(`/cards/${editingCard.id}`);
                          setMessage({ type: 'success', text: response.data?.message || '✅ Carta desativada com sucesso!' });
                          setFormData(prev => ({ ...prev, isActive: false }));
                          setEditingCard(prev => prev ? { ...prev, isActive: false } : null);
                          await reloadAdminCards();
                        } catch (err: any) {
                          setMessage({ type: 'error', text: err.response?.data?.message || '❌ Erro ao desativar carta' });
                        }
                      } else {
                        try {
                          await api.post(`/cards/${editingCard.id}/activate`, {});
                          setMessage({ type: 'success', text: '✅ Carta reativada com sucesso!' });
                          setFormData(prev => ({ ...prev, isActive: true }));
                          setEditingCard(prev => prev ? { ...prev, isActive: true } : null);
                          await reloadAdminCards();
                        } catch {
                          setMessage({ type: 'error', text: '❌ Erro ao reativar carta' });
                        }
                      }
                    }}
                    className={`px-3 py-1.5 rounded text-xs font-bold ${formData.isActive ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'} text-white transition-colors`}
                  >
                    {formData.isActive ? '🔒 Desativar' : '✅ Ativar'}
                  </button>
                ) : (
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="w-3.5 h-3.5 accent-emerald-500" />
                    <span className="text-xs text-emerald-400">Carta ativa (aparece na loja)</span>
                  </label>
                )}
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={formData.isBanned} onChange={(e) => setFormData({ ...formData, isBanned: e.target.checked })} className="w-3.5 h-3.5 accent-red-500" />
                  <span className="text-xs text-red-400">Banida</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="bg-gray-600 hover:bg-gray-500 text-white font-bold px-3 py-1.5 rounded text-xs">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1.5 rounded text-xs disabled:opacity-50">
                  {loading ? '...' : editingCard ? '💾 Atualizar' : '✨ Criar'}
                </button>
              </div>
            </div>
          </form>
          </motion.div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-4 border border-gray-700/80">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-400 mb-1">Busca (nome, idCarta, descrição)</label>
            <input
              type="text"
              placeholder="🔍 Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="w-full sm:w-auto min-w-[140px]">
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={filter}
              onChange={(e) => {
                setPage(1);
                setFilter(e.target.value as typeof filter);
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
            >
              <option value="all">Todas ({cardCounts.total})</option>
              <option value="active">Ativas ({cardCounts.active})</option>
              <option value="inactive">Inativas ({cardCounts.inactive})</option>
            </select>
          </div>
          <div className="w-full sm:w-auto min-w-[160px]">
            <label className="block text-xs text-gray-400 mb-1">Ordenar</label>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto min-w-[120px]">
            <label className="block text-xs text-gray-400 mb-1">Por página</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 text-sm"
              aria-label="Itens por página"
            >
              <option value={24}>24</option>
              <option value={48}>48</option>
              <option value={96}>96</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAdvancedFilters((open) => {
                if (!open) setAdvancedDraft({ ...advancedApplied });
                return !open;
              });
            }}
            className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 border border-indigo-500/50 text-white text-sm font-bold whitespace-nowrap"
          >
            {showAdvancedFilters ? '▲ Ocultar filtros' : '▼ Filtros avançados'}
            {activeAdvancedCount > 0 ? (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500 text-black text-xs">
                {activeAdvancedCount}
              </span>
            ) : null}
          </button>
        </div>

        {showAdvancedFilters ? (
          <div className="rounded-lg border border-purple-500/30 bg-gray-900/60 p-4 space-y-5">
            <p className="text-xs text-gray-400">
              Ajuste os campos e clique em <strong className="text-purple-300">Aplicar filtros</strong>. Nível, rank,
              ATK e DEF restringem apenas <strong className="text-amber-200/90">monstros</strong>; magias e armadilhas
              continuam listadas salvo se você filtrar também por tipo.
            </p>

            <div>
              <p className="text-sm font-bold text-purple-300 mb-2">Tipo de carta</p>
              <div className="flex flex-wrap gap-3">
                {CARD_FILTER_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={advancedDraft.types.includes(t)}
                      onChange={() => {
                        setAdvancedDraft((d) => ({
                          ...d,
                          types: d.types.includes(t) ? d.types.filter((x) => x !== t) : [...d.types, t],
                        }));
                      }}
                      className="rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-purple-300 mb-2">Raridade</p>
              <div className="flex flex-wrap gap-2">
                {CARD_FILTER_RARITIES.map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-1.5 cursor-pointer text-xs px-2 py-1 rounded border ${
                      advancedDraft.rarities.includes(r)
                        ? 'border-amber-400/60 bg-amber-900/20'
                        : 'border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={advancedDraft.rarities.includes(r)}
                      onChange={() => {
                        setAdvancedDraft((d) => ({
                          ...d,
                          rarities: d.rarities.includes(r)
                            ? d.rarities.filter((x) => x !== r)
                            : [...d.rarities, r],
                        }));
                      }}
                      className="rounded border-gray-600 text-amber-500 focus:ring-amber-500"
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo de monstro</label>
                <select
                  value={advancedDraft.monsterType}
                  onChange={(e) => setAdvancedDraft((d) => ({ ...d, monsterType: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Qualquer</option>
                  {MONSTER_TYPES_ADMIN.map((mt) => (
                    <option key={mt} value={mt}>
                      {mt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Atributo</label>
                <select
                  value={advancedDraft.attribute}
                  onChange={(e) => setAdvancedDraft((d) => ({ ...d, attribute: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Qualquer</option>
                  {ATTRIBUTE_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Raça</label>
                <select
                  value={advancedDraft.race}
                  onChange={(e) => setAdvancedDraft((d) => ({ ...d, race: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Qualquer</option>
                  {RACE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo de magia</label>
                <select
                  value={advancedDraft.spellType}
                  onChange={(e) => setAdvancedDraft((d) => ({ ...d, spellType: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Qualquer</option>
                  {SPELL_TYPE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo de armadilha</label>
                <select
                  value={advancedDraft.trapType}
                  onChange={(e) => setAdvancedDraft((d) => ({ ...d, trapType: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Qualquer</option>
                  {TRAP_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Arquétipo (contém)</label>
                <input
                  type="text"
                  value={advancedDraft.archetype}
                  onChange={(e) => setAdvancedDraft((d) => ({ ...d, archetype: e.target.value }))}
                  placeholder="Ex.: Blue-Eyes, Tearlaments"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">À venda na loja</label>
                <select
                  value={advancedDraft.forSale}
                  onChange={(e) =>
                    setAdvancedDraft((d) => ({ ...d, forSale: e.target.value as TriState }))
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Sim</option>
                  <option value="no">Não</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Banidas</label>
                <select
                  value={advancedDraft.banned}
                  onChange={(e) =>
                    setAdvancedDraft((d) => ({ ...d, banned: e.target.value as TriState }))
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Banidas</option>
                  <option value="no">Não banidas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Imagem cadastrada</label>
                <select
                  value={advancedDraft.hasImage}
                  onChange={(e) =>
                    setAdvancedDraft((d) => ({ ...d, hasImage: e.target.value as TriState }))
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Com imagem</option>
                  <option value="no">Sem imagem</option>
                </select>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-purple-300 mb-2">Estatísticas (monstros)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {(
                  [
                    ['levelMin', 'levelMax', 'Nível min', 'Nível max'],
                    ['rankMin', 'rankMax', 'Rank min', 'Rank max'],
                    ['atkMin', 'atkMax', 'ATK min', 'ATK max'],
                    ['defMin', 'defMax', 'DEF min', 'DEF max'],
                  ] as const
                ).map(([a, b, la, lb]) => (
                  <div key={a} className="contents">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{la}</label>
                      <input
                        type="number"
                        value={(advancedDraft as any)[a]}
                        onChange={(e) => setAdvancedDraft((d) => ({ ...d, [a]: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{lb}</label>
                      <input
                        type="number"
                        value={(advancedDraft as any)[b]}
                        onChange={(e) => setAdvancedDraft((d) => ({ ...d, [b]: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                        placeholder="—"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-purple-300 mb-2">Preços e cópias</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Créditos min</label>
                  <input
                    type="number"
                    min={0}
                    value={advancedDraft.creditsMin}
                    onChange={(e) => setAdvancedDraft((d) => ({ ...d, creditsMin: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Créditos max</label>
                  <input
                    type="number"
                    min={0}
                    value={advancedDraft.creditsMax}
                    onChange={(e) => setAdvancedDraft((d) => ({ ...d, creditsMax: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Cash min</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={advancedDraft.cashMin}
                    onChange={(e) => setAdvancedDraft((d) => ({ ...d, cashMin: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Cash max</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={advancedDraft.cashMax}
                    onChange={(e) => setAdvancedDraft((d) => ({ ...d, cashMax: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Cópias min</label>
                  <input
                    type="number"
                    min={0}
                    max={3}
                    value={advancedDraft.copiesMin}
                    onChange={(e) => setAdvancedDraft((d) => ({ ...d, copiesMin: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Cópias max</label>
                  <input
                    type="number"
                    min={0}
                    max={3}
                    value={advancedDraft.copiesMax}
                    onChange={(e) => setAdvancedDraft((d) => ({ ...d, copiesMax: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    placeholder="—"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setAdvancedApplied({ ...advancedDraft });
                  setPage(1);
                }}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm"
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={() => {
                  const e = emptyAdminAdvanced();
                  setAdvancedDraft(e);
                  setAdvancedApplied(e);
                  setPage(1);
                }}
                className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium text-sm"
              >
                Limpar tudo
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-4 rounded-lg border border-purple-500/40 bg-slate-900/80 p-3 shadow-inner">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-amber-200">
              Selecionadas:{' '}
              <span className="text-2xl font-extrabold text-white tabular-nums">{selectedCount}</span>
            </p>
            {selectedCount > 0 ? (
              <p className="mt-1 text-xs text-slate-400">
                Nesta página, entre as selecionadas:{' '}
                <span className="text-emerald-400">{selectedOnPageActive} ativa(s)</span>
                {' · '}
                <span className="text-red-300">{selectedOnPageInactive} inativa(s)</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Marque as cartas abaixo ou use os atalhos. Até 200 por operação.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!cards.length || bulkLoading}
              onClick={selectAllOnPage}
              className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Todas na página
            </button>
            <button
              type="button"
              disabled={!cards.length || bulkLoading}
              onClick={selectNormalMonstersOnPage}
              className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Monstros normais (página)
            </button>
            <button
              type="button"
              disabled={selectedCount === 0 || bulkLoading}
              onClick={clearSelection}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              disabled={selectedCount === 0 || bulkLoading}
              onClick={() => void handleBulkSetActive(true)}
              className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkLoading ? '…' : 'Ativar selecionadas'}
            </button>
            <button
              type="button"
              disabled={selectedCount === 0 || bulkLoading}
              onClick={() => void handleBulkSetActive(false)}
              className="rounded-lg bg-orange-700 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkLoading ? '…' : 'Desativar selecionadas'}
            </button>
          </div>
        </div>
      </div>

      {/* Listagem de Cartas */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-2xl text-gray-300">⏳ Carregando cartas...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
          {cards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02, duration: 0.2 }}
              whileHover={{ scale: 1.05, zIndex: 10 }}
              onClick={() => setSelectedCard(card)}
              className={`group relative rounded-lg border-2 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg transition-all duration-200 cursor-pointer overflow-hidden ${
                selectedIds.has(card.id)
                  ? 'border-cyan-400 ring-2 ring-cyan-500/40'
                  : card.isActive
                    ? 'border-green-500/50 hover:border-green-400'
                    : 'border-red-500/50 hover:border-red-400'
              }`}
            >
              <label
                className="absolute left-1 top-1 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-black/70 ring-1 ring-white/25"
                title="Selecionar para ação em lote"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={() => toggleCardSelected(card.id)}
                  className="h-3.5 w-3.5 cursor-pointer accent-amber-400"
                  aria-label={`Selecionar ${card.name}`}
                />
              </label>
              {/* Badge de Status */}
              <div className={`absolute top-1 right-1 z-10 w-3 h-3 rounded-full shadow-lg ${
                card.isActive 
                  ? 'bg-green-500' 
                  : 'bg-red-500'
              }`} title={card.isActive ? 'Ativa' : 'Inativa'} />

              {/* Preview da Carta - Menor */}
              <div className="relative flex items-center justify-center p-2">
                <div
                  className="relative w-full aspect-[2/3] [content-visibility:auto] [contain-intrinsic-size:120px_180px]"
                >
                  <CardImage
                    key={`${card.id}-${imageJustSavedAt[card.id] ?? 0}`}
                    card={card}
                    cacheBuster={imageJustSavedAt[card.id]}
                    className="h-full w-full rounded transition-transform duration-200 group-hover:scale-110"
                    fallback="/images/fundoCarta.webp"
                    singleLayerImage
                    omitNameBasedPaths
                    pathExtensions={['.webp', '.jpg', '.jpeg', '.png']}
                    sizes="(max-width: 640px) 28vw, (max-width: 1024px) 14vw, 120px"
                    fetchPriority="low"
                  />
                </div>
              </div>

              {/* Nome + preço */}
              <div className="p-2 bg-slate-900/80 backdrop-blur-sm">
                <h3 className="text-xs font-bold text-white text-center line-clamp-2 min-h-[2rem] group-hover:text-purple-300 transition-colors">
                  {card.name}
                </h3>
                <p className="text-[10px] text-center tabular-nums mt-1 leading-tight text-gray-400">
                  <span className="text-purple-300/95">💎 {parseCardPriceInt(card.priceCredits).toLocaleString('pt-BR')}</span>
                  <span className="text-gray-600 mx-0.5">·</span>
                  <span className="text-emerald-300/95">R$ {parseCardPriceInt(card.priceCash).toLocaleString('pt-BR')}</span>
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && listTotal > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-slate-400">
          <p>
            Mostrando <span className="text-slate-200 font-medium">{rangeFrom}</span>–
            <span className="text-slate-200 font-medium">{rangeTo}</span> de{' '}
            <span className="text-slate-200 font-medium">{listTotal}</span>
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
            >
              Anterior
            </button>
            <span className="text-slate-300 px-2">
              Página {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
            >
              Próxima
            </button>
          </div>
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
            <div className="flex justify-between items-start gap-4 mb-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold">{selectedCard.name}</h2>
                <div className="flex flex-wrap gap-2 mt-2 tabular-nums">
                  <span className="bg-purple-600/35 px-2.5 py-1 rounded-md text-sm font-semibold border border-purple-500/40 text-purple-100">
                    💎 {parseCardPriceInt(selectedCard.priceCredits).toLocaleString('pt-BR')} créd.
                  </span>
                  <span className="bg-emerald-600/35 px-2.5 py-1 rounded-md text-sm font-semibold border border-emerald-500/40 text-emerald-100">
                    💵 R$ {parseCardPriceInt(selectedCard.priceCash).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCard(null)}
                className="text-gray-400 hover:text-white text-2xl font-bold transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Imagem da Carta - Tamanho Completo */}
              <div className="flex justify-center items-start">
                <div className="relative w-full max-w-[400px] aspect-[2/3]">
                  <CardImage
                    key={`modal-${selectedCard.id}-${imageJustSavedAt[selectedCard.id] ?? 0}`}
                    card={selectedCard}
                    cacheBuster={imageJustSavedAt[selectedCard.id]}
                    className="h-full w-full rounded-lg shadow-2xl"
                    fallback="/images/fundoCarta.webp"
                    singleLayerImage
                    loading="eager"
                    objectFit="contain"
                    sizes="400px"
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
                  <p className="text-xs text-gray-300 line-clamp-3">{getCardDescription(selectedCard)}</p>
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

      {cards.length === 0 && !loading && (
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
