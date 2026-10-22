import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';
import CardImage from '../components/CardImage';
import GameIcon from '../components/GameIcon';
import CardArtViewer from '../components/CardArtViewer';
import DeckCopyLimitBadge from '../components/DeckCopyLimitBadge';
import LatestCardsMarquee, { type MarqueeCard } from '../components/LatestCardsMarquee';
import { CARD_IMAGE_GRID_PROPS } from '../utils/cardImage';
import { useCosmeticsStore } from '../stores/cosmeticsStore';
import { getCardDescription } from '../utils/cardDescription';
import { useI18n } from '../i18n/I18nContext';
import './ShopPage.css';
import ShopFeaturedShelf from './ShopFeaturedShelf';
import ShopFeaturedTile from './ShopFeaturedTile';

interface Card {
  id: string;
  /** ID estável da carta (ex.: YGOPRO_*); necessário para caminho correto da arte no carrossel. */
  idCarta?: string;
  name: string;
  description: string;
  cardImage: string;
  rarity: string;
  type: string;
  monsterType?: string;
  attribute?: string;
  race?: string;
  atk?: number;
  def?: number;
  level?: number;
  priceCredits?: number;
  priceCash?: number;
  /** Preço com desconto de promoção (quando ativa) */
  effectivePriceCredits?: number;
  effectivePriceCash?: number;
  promotionDiscountPercent?: number;
  promotionEndsAt?: string;
  promotionLabel?: string | null;
  isForSale: boolean;
  maxCopiesInDeck?: number;
  stock?: number;
  rating?: number;
  reviews?: number;
  createdAt?: string;
}

interface Playmat {
  id: string;
  name: string;
  image: string;
  priceCredits: number;
  priceCash: number;
  stock?: number;
}

interface Sleeve {
  id: string;
  name: string;
  image: string;
  priceCredits: number;
  priceCash: number;
  stock?: number;
}

type SortOption = 'name' | 'priceAsc' | 'priceDesc' | 'atkAsc' | 'atkDesc';

function compareShopCardsByAtk(a: Card, b: Card, direction: 'asc' | 'desc'): number {
  const tier = (c: Card) => (c.type === 'Monster' ? 0 : 1);
  const t = tier(a) - tier(b);
  if (t !== 0) return t;
  const atkA = a.type === 'Monster' ? Number(a.atk ?? 0) : 0;
  const atkB = b.type === 'Monster' ? Number(b.atk ?? 0) : 0;
  const byAtk = direction === 'asc' ? atkA - atkB : atkB - atkA;
  if (byAtk !== 0) return byAtk;
  return a.name.localeCompare(b.name);
}
type CardTypeFilter = 'Monster' | 'Spell' | 'Trap';
type MonsterTypeFilter = 'Normal' | 'Effect' | 'Fusion';
interface TalismanTemplate {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  bonusScorePct: number;
  bonusCashPct: number;
  bonusArenaPointsPct: number;
  priceCredits: number | null;
  priceCash: number | null;
  initialCharges?: number;
  isActive: boolean;
  isForSale: boolean;
}
interface MaletaTemplate {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  bonusDecks: number;
  bonusMaletaCapacity: number;
  priceCredits: number | null;
  priceCash: number | null;
  isActive: boolean;
  isForSale: boolean;
  createdAt?: string;
}
type ShopCategory = 'cards' | 'playmats' | 'sleeves' | 'talismans' | 'items';

export default function ShopPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  /** null = tela inicial da loja (escolher categoria); senão mostra a categoria selecionada */
  const [category, setCategory] = useState<ShopCategory | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [playmats, setPlaymats] = useState<Playmat[]>([]);
  const [sleeves, setSleeves] = useState<Sleeve[]>([]);
  const [talismans, setTalismans] = useState<TalismanTemplate[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellingCardId, setSellingCardId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [inspectedCard, setInspectedCard] = useState<Card | null>(null);
  const [showPurchaseConfirm, setShowPurchaseConfirm] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<{ item: Card | Playmat | Sleeve | TalismanTemplate; method: 'credits' | 'cash' } | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [sellModal, setSellModal] = useState<{ userCard: any; quantity: number } | null>(null);
  /** Modal de sucesso após compra ou venda (substitui alert) */
  const [successModal, setSuccessModal] = useState<{
    type: 'purchase';
    itemName: string;
    itemImage?: string;
    quantity?: number;
    paymentMethod: 'credits' | 'cash';
    price: number;
    remainingCredits?: number;
    remainingCash?: number;
    category: 'cards' | 'playmats' | 'sleeves' | 'talismans' | 'items';
  } | {
    type: 'sell';
    cardName: string;
    cardImage?: string;
    quantity: number;
    creditsGained: number;
    cashGained: number;
  } | null>(null);
  const {
    addPlaymat,
    addSkin,
  } = useCosmeticsStore();
  
  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [atkMin, setAtkMin] = useState('');
  const [atkMax, setAtkMax] = useState('');
  const [typeFilters, setTypeFilters] = useState<CardTypeFilter[]>(['Monster', 'Spell', 'Trap']);
  const [attributeFilters, setAttributeFilters] = useState<string[]>([]);
  const [monsterTypeFilters, setMonsterTypeFilters] = useState<MonsterTypeFilter[]>([]);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  // Estado dos dropdowns
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [maletas, setMaletas] = useState<MaletaTemplate[]>([]);
  const [loadingMaletas, setLoadingMaletas] = useState(false);
  const [buyingMaletaTemplateId, setBuyingMaletaTemplateId] = useState<string | null>(null);
  const [ownedMaletaTemplateIds, setOwnedMaletaTemplateIds] = useState<Set<string>>(new Set());

  // Ao entrar na loja, mostrar sempre a aba/tela de destaque
  useEffect(() => {
    setCategory(null);
    setMode('buy');
  }, []);

  // Buscar cartas da loja
  // Destaques (category null): só lite/limit — evita baixar ~500 cartas na landing
  // Aba Cartas: catálogo completo (com promoções)
  useEffect(() => {
    let cancelled = false;
    
    const fetchCards = async () => {
      try {
        setLoading(true);
        setError(null);

        const isFeaturedLanding = category === null;
        const response = await Promise.race([
          api.get('/cards/shop/for-sale', {
            timeout: 20000,
            params: isFeaturedLanding
              ? { limit: 24, lite: 1 }
              : undefined,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 20000)
          )
        ]) as any;
        
        if (cancelled) return;
        
        const raw = response.data;
        const dataArray = Array.isArray(raw) ? raw : (raw?.cards ?? raw?.data ?? []);
        if (!Array.isArray(dataArray)) {
          setCards([]);
          setError('Resposta da API em formato inesperado.');
          return;
        }
        
        if (!cancelled) {
          setCards(dataArray);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error('❌ Erro ao carregar cartas da loja:', error);
          setError(error.response?.data?.message || error.message || 'Erro ao carregar cartas');
          setCards([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (mode === 'buy' && (category === null || category === 'cards')) {
      fetchCards();
    }
    
    return () => {
      cancelled = true;
    };
  }, [mode, category]);

  // Buscar inventário quando estiver no modo venda
  useEffect(() => {
    let cancelled = false;
    
    const fetchInventory = async () => {
      if (mode !== 'sell' || !user) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const response = await Promise.race([
          api.get('/shop/inventory', { timeout: 20000 }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 20000)
          )
        ]) as any;
        
        if (cancelled) return;
        
        const raw = response.data;
        const dataArray = Array.isArray(raw) ? raw : (raw?.cards ?? []);
        if (!Array.isArray(dataArray)) {
          setInventory([]);
          setError('Resposta da API em formato inesperado.');
          return;
        }
        
        if (!cancelled) {
          setInventory(dataArray);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error('❌ Erro ao carregar inventário:', error);
          setError(error.response?.data?.message || error.message || 'Erro ao carregar inventário');
          setInventory([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (mode === 'sell' && category === 'cards') {
      fetchInventory();
    }
    
    return () => {
      cancelled = true;
    };
    // Só refetch quando entrar na aba venda; não quando user.credits/cash mudar (ex.: após compra)
  }, [mode, category, user?.id]);

  // Buscar playmats e sleeves do backend
  useEffect(() => {
    let cancelled = false;
    
    const fetchPlaymats = async () => {
      try {
        setLoading(true);
        const response = await api.get('/cosmetics/playmats/for-sale');
        if (!cancelled) {
          setPlaymats(response.data);
        }
      } catch (error) {
        console.error('Erro ao carregar playmats:', error);
        if (!cancelled) {
          setPlaymats([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const fetchSleeves = async () => {
      try {
        setLoading(true);
        const response = await api.get('/cosmetics/sleeves/for-sale');
        if (!cancelled) {
          setSleeves(response.data);
        }
      } catch (error) {
        console.error('Erro ao carregar sleeves:', error);
        if (!cancelled) {
          setSleeves([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const fetchTalismans = async () => {
      try {
        setLoading(true);
        const response = await api.get('/shop/talismans');
        if (!cancelled) {
          setTalismans(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        console.error('Erro ao carregar talismãs:', error);
        if (!cancelled) {
          setTalismans([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const fetchMaletas = async () => {
      try {
        setLoadingMaletas(true);
        const response = await api.get('/shop/maletas');
        if (!cancelled) {
          setMaletas(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        console.error('Erro ao carregar maletas:', error);
        if (!cancelled) setMaletas([]);
      } finally {
        if (!cancelled) setLoadingMaletas(false);
      }
    };

    if (mode === 'buy') {
      if (category === null || category === 'playmats') fetchPlaymats();
      if (category === null || category === 'sleeves') fetchSleeves();
      if (category === null || category === 'talismans') fetchTalismans();
      if (category === null || category === 'items') fetchMaletas();
    }
    
    return () => {
      cancelled = true;
    };
  }, [category, mode]);

  // Quais níveis de maleta o usuário já comprou (aba Itens + desabilitar botão)
  useEffect(() => {
    if (!user || mode !== 'buy' || category !== 'items') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/shop/inventory');
        if (cancelled) return;
        const list = Array.isArray(r.data?.maletas) ? r.data.maletas : [];
        setOwnedMaletaTemplateIds(new Set(list.map((m: { maletaTemplateId: string }) => m.maletaTemplateId)));
      } catch {
        if (!cancelled) setOwnedMaletaTemplateIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, mode, category]);

  // Novos itens (últimas 8 cartas adicionadas ou featured)
  const newItems = useMemo(() => {
    return [...cards]
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 8);
  }, [cards]);

  // Filtrar e ordenar cartas
  const filteredAndSortedCards = useMemo(() => {
    let filtered = [...cards];

    if (searchTerm) {
      filtered = filtered.filter(card =>
        card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getCardDescription(card).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (typeFilters.length > 0) {
      filtered = filtered.filter(card => typeFilters.includes(card.type as CardTypeFilter));
    }

    if (attributeFilters.length > 0 && attributeFilters.length < 7) {
      filtered = filtered.filter(card => 
        card.attribute && attributeFilters.includes(card.attribute)
      );
    }

    if (monsterTypeFilters.length > 0) {
      filtered = filtered.filter(card => {
        if (card.type !== 'Monster') return true;
        const mt = (card.monsterType || '').trim();
        return mt && monsterTypeFilters.includes(mt as MonsterTypeFilter);
      });
    }

    if (priceMin) {
      const min = Number(priceMin);
      filtered = filtered.filter(card => (card.priceCredits || 0) >= min);
    }
    if (priceMax) {
      const max = Number(priceMax);
      filtered = filtered.filter(card => (card.priceCredits || 0) <= max);
    }

    const atkFilterActive = (atkMin !== '' && atkMin != null) || (atkMax !== '' && atkMax != null);
    if (atkFilterActive) {
      filtered = filtered.filter((card) => {
        if (card.type !== 'Monster') return true;
        const atk = Number(card.atk ?? 0);
        if (atkMin !== '' && !Number.isNaN(Number(atkMin)) && atk < Number(atkMin)) return false;
        if (atkMax !== '' && !Number.isNaN(Number(atkMax)) && atk > Number(atkMax)) return false;
        return true;
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'priceAsc':
          return (a.priceCredits || 0) - (b.priceCredits || 0);
        case 'priceDesc':
          return (b.priceCredits || 0) - (a.priceCredits || 0);
        case 'atkAsc':
          return compareShopCardsByAtk(a, b, 'asc');
        case 'atkDesc':
          return compareShopCardsByAtk(a, b, 'desc');
        default:
          return 0;
      }
    });

    return filtered;
  }, [cards, searchTerm, sortBy, priceMin, priceMax, atkMin, atkMax, typeFilters, attributeFilters, monsterTypeFilters]);

  // Contagem de cartas por tipo (para exibir nos filtros)
  const countByType = useMemo(() => {
    const counts: Record<string, number> = { Monster: 0, Spell: 0, Trap: 0 };
    cards.forEach(c => {
      if (c.type && counts[c.type] !== undefined) counts[c.type]++;
    });
    return counts;
  }, [cards]);

  // Contagem de cartas por atributo (para exibir nos filtros)
  const countByAttribute = useMemo(() => {
    const counts: Record<string, number> = {};
    const attrs = ['LIGHT', 'DARK', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE'];
    attrs.forEach(a => { counts[a] = 0; });
    cards.forEach(c => {
      if (c.attribute && counts[c.attribute] !== undefined) counts[c.attribute]++;
    });
    return counts;
  }, [cards]);

  const MONSTER_TYPES: MonsterTypeFilter[] = ['Normal', 'Effect', 'Fusion'];

  // Contagem de monstros por tipo (Normal, Effect, Fusion) – só cartas Monster
  const countByMonsterType = useMemo(() => {
    const counts: Record<string, number> = { Normal: 0, Effect: 0, Fusion: 0 };
    cards.forEach(c => {
      if (c.type === 'Monster' && c.monsterType && counts[c.monsterType] !== undefined)
        counts[c.monsterType]++;
    });
    return counts;
  }, [cards]);

  // Lista base para venda (cartas com pelo menos 1 cópia vendável)
  const sellListBase = useMemo(() => {
    return inventory.filter((uc: any) => ((uc.sellableQuantity ?? uc.quantity) > 0));
  }, [inventory]);

  // Filtrar e ordenar cartas na aba Vender (mesma lógica que Comprar)
  const filteredAndSortedSellList = useMemo(() => {
    let filtered = [...sellListBase];

    if (searchTerm) {
      filtered = filtered.filter((uc: any) => {
        const card = uc.card;
        if (!card) return false;
        return (
          card.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          getCardDescription(card).toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    if (typeFilters.length > 0) {
      filtered = filtered.filter((uc: any) => uc.card && typeFilters.includes(uc.card.type as CardTypeFilter));
    }

    if (attributeFilters.length > 0 && attributeFilters.length < 7) {
      filtered = filtered.filter((uc: any) =>
        uc.card?.attribute && attributeFilters.includes(uc.card.attribute)
      );
    }

    if (monsterTypeFilters.length > 0) {
      filtered = filtered.filter((uc: any) => {
        const card = uc.card;
        if (!card || card.type !== 'Monster') return card ? true : false;
        const mt = (card.monsterType || '').trim();
        return mt && monsterTypeFilters.includes(mt as MonsterTypeFilter);
      });
    }

    const priceCredits = (uc: any) => uc.card?.priceCredits ?? 0;
    if (priceMin) {
      const min = Number(priceMin);
      filtered = filtered.filter((uc: any) => priceCredits(uc) >= min);
    }
    if (priceMax) {
      const max = Number(priceMax);
      filtered = filtered.filter((uc: any) => priceCredits(uc) <= max);
    }

    const atkFilterActiveSell = (atkMin !== '' && atkMin != null) || (atkMax !== '' && atkMax != null);
    if (atkFilterActiveSell) {
      filtered = filtered.filter((uc: any) => {
        const card = uc.card;
        if (!card) return false;
        if (card.type !== 'Monster') return true;
        const atk = Number(card.atk ?? 0);
        if (atkMin !== '' && !Number.isNaN(Number(atkMin)) && atk < Number(atkMin)) return false;
        if (atkMax !== '' && !Number.isNaN(Number(atkMax)) && atk > Number(atkMax)) return false;
        return true;
      });
    }

    filtered.sort((a: any, b: any) => {
      const cardA = a.card;
      const cardB = b.card;
      if (!cardA || !cardB) return 0;
      switch (sortBy) {
        case 'name':
          return (cardA.name || '').localeCompare(cardB.name || '');
        case 'priceAsc':
          return (cardA.priceCredits || 0) - (cardB.priceCredits || 0);
        case 'priceDesc':
          return (cardB.priceCredits || 0) - (cardA.priceCredits || 0);
        case 'atkAsc':
          return compareShopCardsByAtk(cardA as Card, cardB as Card, 'asc');
        case 'atkDesc':
          return compareShopCardsByAtk(cardA as Card, cardB as Card, 'desc');
        default:
          return 0;
      }
    });

    return filtered;
  }, [sellListBase, searchTerm, sortBy, priceMin, priceMax, atkMin, atkMax, typeFilters, attributeFilters, monsterTypeFilters]);

  // Contagens para filtros na aba Vender
  const countByTypeSell = useMemo(() => {
    const counts: Record<string, number> = { Monster: 0, Spell: 0, Trap: 0 };
    sellListBase.forEach((uc: any) => {
      const t = uc.card?.type;
      if (t && counts[t] !== undefined) counts[t]++;
    });
    return counts;
  }, [sellListBase]);

  const countByAttributeSell = useMemo(() => {
    const counts: Record<string, number> = {};
    const attrs = ['LIGHT', 'DARK', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE'];
    attrs.forEach(a => { counts[a] = 0; });
    sellListBase.forEach((uc: any) => {
      const a = uc.card?.attribute;
      if (a && counts[a] !== undefined) counts[a]++;
    });
    return counts;
  }, [sellListBase]);

  const countByMonsterTypeSell = useMemo(() => {
    const counts: Record<string, number> = { Normal: 0, Effect: 0, Fusion: 0 };
    sellListBase.forEach((uc: any) => {
      const c = uc.card;
      if (c?.type === 'Monster' && c.monsterType && counts[c.monsterType] !== undefined)
        counts[c.monsterType]++;
    });
    return counts;
  }, [sellListBase]);

  // Contagens exibidas nos filtros (Comprar = loja, Vender = inventário à venda)
  const countByTypeDisplay = mode === 'sell' ? countByTypeSell : countByType;
  const countByAttributeDisplay = mode === 'sell' ? countByAttributeSell : countByAttribute;
  const countByMonsterTypeDisplay = mode === 'sell' ? countByMonsterTypeSell : countByMonsterType;

  // Paginação
  const getCurrentItems = () => {
    if (category === 'cards' && mode === 'sell') {
      return filteredAndSortedSellList;
    }
    if (mode === 'sell' && category === 'talismans') {
      return []; // venda de talismãs não disponível
    }
    if (category === 'cards') {
      return filteredAndSortedCards;
    } else if (category === 'playmats') {
      return playmats;
    } else if (category === 'talismans') {
      return talismans;
    } else if (category === 'items') {
      return maletas;
    } else {
      return sleeves;
    }
  };

  const currentItems = getCurrentItems();
  const totalPages = Math.ceil(currentItems.length / itemsPerPage);
  const paginatedItems = currentItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Toggle de filtros
  const toggleTypeFilter = (type: CardTypeFilter) => {
    setTypeFilters(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleSellClick = (userCard: any) => {
    if (!userCard?.card?.id) {
      alert('Erro: Carta inválida');
      return;
    }
    const sellable = userCard.sellableQuantity ?? userCard.quantity;
    if (sellable <= 0) return;
    setSellModal({ userCard, quantity: 1 });
  };

  const handleSellConfirm = async () => {
    if (!sellModal) return;
    const { userCard, quantity } = sellModal;
    const sellable = (userCard as any).sellableQuantity ?? userCard.quantity;
    if (!userCard?.card?.id || quantity < 1 || quantity > sellable) return;

    if (sellingCardId === userCard.card.id) return;
    setSellingCardId(userCard.card.id);
    setSellModal(null);

    try {
      const response = await api.post('/shop/sell', {
        cardId: userCard.card.id,
        quantity,
      });

      setSuccessModal({
        type: 'sell',
        cardName: userCard.card.name,
        cardImage: userCard.card.cardImage,
        quantity,
        creditsGained: response.data.creditsGained ?? 0,
        cashGained: response.data.cashGained ?? 0,
      });

      // Atualização otimista: não refetch para evitar “atualizar a tela”
      const cardId = userCard.card.id;
      setInventory((prev) => {
        return prev
          .map((uc: any) => {
            if (uc.cardId !== cardId && uc.card?.id !== cardId) return uc;
            const newQty = (uc.quantity ?? 0) - quantity;
            if (newQty <= 0) return null;
            const newSellable = Math.max(0, (uc.sellableQuantity ?? uc.quantity ?? 0) - quantity);
            return { ...uc, quantity: newQty, sellableQuantity: newSellable };
          })
          .filter(Boolean);
      });

      // Atualizar só o saldo do usuário (uma chamada leve, sem refetch do inventário)
      const userResponse = await api.get('/users/me');
      if (userResponse.data) {
        useAuthStore.getState().setUser(userResponse.data);
      }
    } catch (error: any) {
      console.error('❌ Erro ao vender carta:', error);
      alert(`❌ Erro: ${error.response?.data?.message || error.message || 'Erro ao vender carta'}`);
    } finally {
      setSellingCardId(null);
    }
  };

  const toggleAttributeFilter = (attr: string) => {
    setAttributeFilters(prev =>
      prev.includes(attr)
        ? prev.filter(a => a !== attr)
        : [...prev, attr]
    );
  };

  const toggleMonsterTypeFilter = (mt: MonsterTypeFilter) => {
    setMonsterTypeFilters(prev =>
      prev.includes(mt)
        ? prev.filter(m => m !== mt)
        : [...prev, mt]
    );
  };

  const handlePurchaseClick = (
    item: Card | Playmat | Sleeve | TalismanTemplate,
    paymentMethod: 'credits' | 'cash'
  ) => {
    if (!user) {
      alert(t('shop.mustLogin'));
      return;
    }

    const priceCredits = (item as Card).effectivePriceCredits ?? item.priceCredits ?? 0;
    const priceCash = (item as Card).effectivePriceCash ?? item.priceCash ?? 0;
    const price = paymentMethod === 'credits' ? priceCredits : (typeof priceCash === 'number' ? priceCash : Number(priceCash) || 0);

    if (price <= 0) {
      alert(`Esta opção de pagamento não está disponível para este item.`);
      return;
    }

    setPurchaseItem({ item, method: paymentMethod });
    setPurchaseQuantity(1);
    setShowPurchaseConfirm(true);
  };

  const handlePurchaseMaleta = async (maletaTemplateId: string, paymentMethod: 'credits' | 'cash') => {
    if (!user || buyingMaletaTemplateId) return;

    const template = maletas.find(m => m.id === maletaTemplateId);
    if (!template) return;

    const price = paymentMethod === 'credits' ? (template.priceCredits ?? 0) : (template.priceCash ?? 0);
    const balance = paymentMethod === 'credits' ? (user.credits || 0) : (user.cash || 0);
    if (balance < price) {
      alert(`${paymentMethod === 'credits' ? 'Créditos' : 'Cash'} insuficientes! Você tem ${balance} mas precisa de ${price}`);
      return;
    }

    if (!price || price <= 0) {
      alert('Este modo de pagamento não está disponível para esta maleta.');
      return;
    }

    const ok = window.confirm(
      `Comprar ${template.name} por ${price} ${paymentMethod === 'credits' ? 'créditos' : 'cash'}?` +
      `\nBônus: +${template.bonusDecks} deck(s) e +${template.bonusMaletaCapacity} cartas na maleta.`,
    );
    if (!ok) return;

    try {
      setBuyingMaletaTemplateId(maletaTemplateId);
      const response = await api.post('/shop/purchase-briefcase', { maletaTemplateId, paymentMethod });
      const updatedUser = {
        ...user,
        credits: response.data.remainingBalance?.credits ?? user.credits,
        cash: response.data.remainingBalance?.cash ?? user.cash,
        maxDecks: response.data.limits?.maxDecks ?? user.maxDecks,
        maletaCapacity: response.data.limits?.maletaCapacity ?? user.maletaCapacity,
      };
      useAuthStore.getState().setUser(updatedUser);
      setOwnedMaletaTemplateIds((prev) => new Set(prev).add(maletaTemplateId));
      alert(response.data.message || 'Maleta comprada com sucesso!');
    } catch (error: any) {
      alert(`❌ Erro: ${error.response?.data?.message || error.message}`);
    } finally {
      setBuyingMaletaTemplateId(null);
    }
  };

  const handlePurchaseConfirm = async () => {
    if (!purchaseItem || !user) return;

    const { item, method: paymentMethod } = purchaseItem;
    const priceCredits = (item as Card).effectivePriceCredits ?? item.priceCredits ?? 0;
    const priceCash = (item as Card).effectivePriceCash ?? item.priceCash ?? 0;
    const cashNum = typeof priceCash === 'number' ? priceCash : Number(priceCash) || 0;
    const qty = category === 'cards' ? Math.min(99, Math.max(1, purchaseQuantity)) : 1;
    const price = (paymentMethod === 'credits' ? priceCredits : cashNum) * qty;

    try {
      setShowPurchaseConfirm(false);
      // Não usar setLoading aqui para evitar “atualização” da tela após compra

      if (category === 'cards') {
        const hasBalance =
          paymentMethod === 'credits'
            ? (user.credits || 0) >= price
            : (user.cash || 0) >= price;

        if (!hasBalance) {
          const current =
            paymentMethod === 'credits' ? user.credits || 0 : user.cash || 0;
          alert(
            `${
              paymentMethod === 'credits' ? 'Créditos' : 'Cash'
            } insuficientes! Você tem ${current} mas precisa de ${price} (${qty}x)`
          );
          setPurchaseItem(null);
          return;
        }

        const response = await api.post('/shop/purchase', {
          cardId: item.id,
          paymentMethod,
          quantity: qty,
        });

        const updatedUser = {
          ...user,
          credits: response.data.remainingBalance.credits,
          cash: response.data.remainingBalance.cash,
        };
        
        useAuthStore.getState().setUser(updatedUser);
        setSuccessModal({
          type: 'purchase',
          itemName: item.name,
          itemImage: (item as Card).cardImage,
          quantity: qty,
          paymentMethod,
          price,
          remainingCredits: response.data.remainingBalance?.credits,
          remainingCash: response.data.remainingBalance?.cash,
          category: 'cards',
        });
      } else if (category === 'playmats') {
        const hasBalance =
          paymentMethod === 'credits'
            ? (user.credits || 0) >= price
            : (user.cash || 0) >= price;
        if (!hasBalance) {
          const current = paymentMethod === 'credits' ? user.credits || 0 : user.cash || 0;
          alert(`${paymentMethod === 'credits' ? 'Créditos' : 'Cash'} insuficientes! Você tem ${current} mas precisa de ${price}`);
          setPurchaseItem(null);
          return;
        }
        const response = await api.post('/shop/purchase-playmat', {
          playmatId: (item as Playmat).id,
          paymentMethod,
        });
        const updatedUser = {
          ...user,
          credits: response.data.remainingBalance.credits,
          cash: response.data.remainingBalance.cash,
        };
        useAuthStore.getState().setUser(updatedUser);
        addPlaymat({
          id: (item as Playmat).id,
          name: item.name,
          image: (item as Playmat).image,
        });
        setSuccessModal({
          type: 'purchase',
          itemName: item.name,
          itemImage: (item as Playmat).image,
          paymentMethod,
          price,
          remainingCredits: response.data.remainingBalance?.credits,
          remainingCash: response.data.remainingBalance?.cash,
          category: 'playmats',
        });
      } else if (category === 'sleeves') {
        const hasBalance =
          paymentMethod === 'credits'
            ? (user.credits || 0) >= price
            : (user.cash || 0) >= price;
        if (!hasBalance) {
          const current = paymentMethod === 'credits' ? user.credits || 0 : user.cash || 0;
          alert(`${paymentMethod === 'credits' ? 'Créditos' : 'Cash'} insuficientes! Você tem ${current} mas precisa de ${price}`);
          setPurchaseItem(null);
          return;
        }
        const response = await api.post('/shop/purchase-sleeve', {
          sleeveId: (item as Sleeve).id,
          paymentMethod,
        });
        const updatedUser = {
          ...user,
          credits: response.data.remainingBalance.credits,
          cash: response.data.remainingBalance.cash,
        };
        useAuthStore.getState().setUser(updatedUser);
        addSkin({
          id: (item as Sleeve).id,
          name: item.name,
          image: (item as Sleeve).image,
        });
        setSuccessModal({
          type: 'purchase',
          itemName: item.name,
          itemImage: (item as Sleeve).image,
          paymentMethod,
          price,
          remainingCredits: response.data.remainingBalance?.credits,
          remainingCash: response.data.remainingBalance?.cash,
          category: 'sleeves',
        });
      } else if (category === 'talismans') {
        const hasBalance =
          paymentMethod === 'credits'
            ? (user.credits || 0) >= price
            : (user.cash || 0) >= price;
        if (!hasBalance) {
          const current = paymentMethod === 'credits' ? user.credits || 0 : user.cash || 0;
          alert(`${paymentMethod === 'credits' ? 'Créditos' : 'Cash'} insuficientes! Você tem ${current} mas precisa de ${price}`);
          setPurchaseItem(null);
          return;
        }
        const response = await api.post('/shop/purchase-talisman', {
          talismanTemplateId: (item as TalismanTemplate).id,
          paymentMethod,
        });
        const updatedUser = {
          ...user,
          credits: response.data.remainingBalance.credits,
          cash: response.data.remainingBalance.cash,
        };
        useAuthStore.getState().setUser(updatedUser);
        setSuccessModal({
          type: 'purchase',
          itemName: item.name,
          itemImage: (item as TalismanTemplate).image ?? undefined,
          paymentMethod,
          price,
          remainingCredits: response.data.remainingBalance?.credits,
          remainingCash: response.data.remainingBalance?.cash,
          category: 'talismans',
        });
      }
      
      setPurchaseItem(null);
    } catch (error: any) {
      alert(`❌ Erro: ${error.response?.data?.message || error.message}`);
      setPurchaseItem(null);
    }
  };

  const attributes = ['LIGHT', 'DARK', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE'];

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdown]);

  // Resetar página quando mudar categoria
  useEffect(() => {
    setCurrentPage(1);
  }, [category]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, priceMin, priceMax, atkMin, atkMax, typeFilters, attributeFilters, monsterTypeFilters]);

  // Novos itens no formato do carrossel (para a seção "Novos Itens Adicionados")
  const newItemsMarqueeCards: MarqueeCard[] = useMemo(() => {
    return newItems.map((c) => ({
      id: c.id,
      idCarta: c.idCarta,
      name: c.name,
      cardImage: c.cardImage,
      type: c.type,
      rarity: c.rarity,
      createdAt: c.createdAt,
      maxCopiesInDeck: c.maxCopiesInDeck ?? 3,
    }));
  }, [newItems]);

  // Itens em destaque: cartas = últimas cadastradas (carrossel); demais = primeiros da lista
  const featuredCards = useMemo(() => {
    return [...cards]
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 16);
  }, [cards]);
  const featuredCardsMarquee: MarqueeCard[] = useMemo(() => {
    return featuredCards.map((c) => ({
      id: c.id,
      idCarta: c.idCarta,
      name: c.name,
      cardImage: c.cardImage,
      type: c.type,
      rarity: c.rarity,
      createdAt: c.createdAt,
      maxCopiesInDeck: c.maxCopiesInDeck ?? 3,
    }));
  }, [featuredCards]);
  const featuredPlaymats = useMemo(() => playmats.slice(0, 3), [playmats]);
  const featuredSleeves = useMemo(() => sleeves.slice(0, 3), [sleeves]);
  const featuredTalismans = useMemo(() => talismans.slice(0, 3), [talismans]);
  const featuredMaletas = useMemo(() => maletas.slice(0, 4), [maletas]);

  // Cartas em promoção (com desconto ativo)
  const promotionCards = useMemo(() => {
    return cards.filter((c) => c.promotionDiscountPercent != null && c.promotionDiscountPercent > 0);
  }, [cards]);
  const promotionCardsMarquee: MarqueeCard[] = useMemo(() => {
    return promotionCards.map((c) => ({
      id: c.id,
      idCarta: c.idCarta,
      name: c.name,
      cardImage: c.cardImage,
      type: c.type,
      rarity: c.rarity,
      createdAt: c.createdAt,
      promotionDiscountPercent: c.promotionDiscountPercent,
      maxCopiesInDeck: c.maxCopiesInDeck ?? 3,
    }));
  }, [promotionCards]);

  return (
    <div className="duelist-market min-h-screen text-white py-4 sm:py-6">
      <div className="max-w-[1500px] mx-auto px-2.5 sm:px-4 lg:px-5">
        {/* Identidade da loja — RPG de cartas, sem o antigo tema azul. */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="market-hero"
        >
          <div className="market-hero-copy">
            <p className="market-eyebrow">✦ Mercado dos Duelistas · Arena de Relíquias</p>
            <div className="market-hero-heading">
              <div className="market-hero-emblem"><GameIcon route="/shop" size={40} /></div>
              <div>
                <h1>{t('shop.title')}</h1>
                <p>{t('shop.subtitle')}</p>
              </div>
            </div>
            <div className="market-hero-links">
              <Link to="/loot-boxes" className="market-link market-link--primary">
                <GameIcon route="/loot-boxes" size={21} />
                <span>{t('shop.openLootBoxes')}</span>
              </Link>
              <Link to="/collection" className="market-link">
                <GameIcon route="/collection" size={21} />
                <span>{t('collection.title')}</span>
              </Link>
              <Link to="/credit" className="market-link">
                <GameIcon route="/credit" size={21} />
                <span>{t('shop.buyCredits')}</span>
              </Link>
            </div>
          </div>
          <div className="market-hero-aside" aria-label="Saldo do duelista">
            <div className="market-hero-crest" aria-hidden="true"><GameIcon route="/shop" size={39} /></div>
            <p className="market-eyebrow">Sua carteira</p>
            <div className="market-balance-list">
              <div className="market-balance">
                <GameIcon route="/credit" size={24} />
                <span>Créditos</span>
                <strong>{Number(user?.credits ?? 0).toLocaleString('pt-BR')}</strong>
              </div>
              <div className="market-balance">
                <span className="market-balance-gem" aria-hidden="true">◆</span>
                <span>Cash</span>
                <strong>{Math.floor(Number(user?.cash ?? 0)).toLocaleString('pt-BR')}</strong>
              </div>
            </div>
            <p className="market-aside-caption">Escolha suas cartas, equipe seu duelo e conquiste a arena.</p>
          </div>
        </motion.header>

        {/* Compra / Venda: ações persistem mesmo ao trocar de categoria. */}
        <div className="market-mode-switch" role="group" aria-label="Operação da loja">
          <button type="button" aria-pressed={mode === 'buy'}
            onClick={() => { setMode('buy'); setCurrentPage(1); }}
            className={`market-mode ${mode === 'buy' ? 'is-active' : ''}`}>
            <GameIcon route="/shop" size={21} /> {t('shop.buy')}
          </button>
          <button type="button" aria-pressed={mode === 'sell'}
            onClick={() => { setMode('sell'); setCategory('cards'); setCurrentPage(1); }}
            className={`market-mode ${mode === 'sell' ? 'is-active' : ''}`}>
            <GameIcon route="/credit" size={21} /> {t('shop.sell')}
          </button>
          <span className="market-mode-hint">Negocie seus itens com segurança</span>
        </div>

        {/* Categorias ilustradas usando o atlas de imagens do próprio jogo. */}
        <nav className="market-categories" aria-label="Categorias da loja">
          {([
            { id: null, name: t('shop.featured'), route: '/shop', hint: 'Vitrine' },
            { id: 'cards', name: t('shop.cards'), route: '/collection', hint: 'Duelo' },
            { id: 'items', name: t('shop.items'), route: '/inventory', hint: 'Maletas' },
            { id: 'playmats', name: t('shop.playmats'), route: '/arena', hint: 'Campo' },
            { id: 'sleeves', name: t('shop.sleeves'), route: '/deck-builder', hint: 'Protetores' },
            { id: 'talismans', name: t('shop.talismans'), route: '/missions', hint: 'Artefatos' },
          ] as const).map((item) => (
            <button
              key={item.id ?? 'featured'}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => { setCategory(item.id); setCurrentPage(1); }}
              className={`market-category ${category === item.id ? 'is-active' : ''}`}
            >
              <span className="market-category-icon"><GameIcon route={item.route} size={25} /></span>
              <span className="market-category-copy"><strong>{item.name}</strong><small>{item.hint}</small></span>
            </button>
          ))}
        </nav>

        {category !== null && (
          <div className="market-section-intro">
            <div>
              <p className="market-eyebrow">{mode === 'buy' ? 'Explore o catálogo' : 'Sua coleção à venda'}</p>
              <h2>{category === 'cards' ? t('shop.cards') : category === 'items' ? t('shop.items') : category === 'playmats' ? t('shop.playmats') : category === 'sleeves' ? t('shop.sleeves') : t('shop.talismans')}</h2>
            </div>
            <span className="market-results-badge">{currentItems.length.toLocaleString('pt-BR')} itens</span>
          </div>
        )}

        {category === null ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="market-featured-content"
          >
            <header className="market-featured-intro">
              <div>
                <p className="market-eyebrow">Escolhas da arena</p>
                <h2><span aria-hidden="true">✦</span> {t('shop.featuredItems')}</h2>
                <p>Cartas, acessórios e artefatos em destaque. Selecione um item para explorar sua categoria.</p>
              </div>
            </header>

            {featuredCardsMarquee.length > 0 && (
              <ShopFeaturedShelf title={t('shop.latestCards')} route="/collection"
                onExplore={() => { setCategory('cards'); setMode('buy'); setCurrentPage(1); }}>
                <LatestCardsMarquee
                  cards={featuredCardsMarquee}
                  className="market-featured-marquee"
                  showVerLoja={false}
                  hideTitle
                  onCardClick={(card) => {
                    const full = cards.find((item) => item.id === card.id);
                    if (full) {
                      setCategory('cards');
                      setMode('buy');
                      setSelectedCard(full);
                      setCurrentPage(1);
                    }
                  }}
                />
              </ShopFeaturedShelf>
            )}

            {promotionCardsMarquee.length > 0 && (
              <ShopFeaturedShelf title={t('shop.promoCards')} route="/credit"
                onExplore={() => { setCategory('cards'); setMode('buy'); setCurrentPage(1); }}>
                <LatestCardsMarquee
                  cards={promotionCardsMarquee}
                  className="market-featured-marquee"
                  showVerLoja={false}
                  hideTitle
                  showPromotionBadge
                  onCardClick={(card) => {
                    const full = cards.find((item) => item.id === card.id);
                    if (full) {
                      setCategory('cards');
                      setMode('buy');
                      setSelectedCard(full);
                      setCurrentPage(1);
                    }
                  }}
                />
              </ShopFeaturedShelf>
            )}

            {featuredPlaymats.length > 0 && (
              <ShopFeaturedShelf title={t('shop.playmats')} route="/arena"
                onExplore={() => { setCategory('playmats'); setMode('buy'); setCurrentPage(1); }}>
                <div className="market-featured-grid">
                  {featuredPlaymats.map((item) => (
                    <ShopFeaturedTile key={item.id} name={item.name} image={item.image}
                      category="playmats" credits={item.priceCredits} cash={item.priceCash}
                      onExplore={() => { setCategory('playmats'); setMode('buy'); setCurrentPage(1); }} />
                  ))}
                </div>
              </ShopFeaturedShelf>
            )}

            {featuredSleeves.length > 0 && (
              <ShopFeaturedShelf title={t('shop.sleeves')} route="/deck-builder"
                onExplore={() => { setCategory('sleeves'); setMode('buy'); setCurrentPage(1); }}>
                <div className="market-featured-grid">
                  {featuredSleeves.map((item) => (
                    <ShopFeaturedTile key={item.id} name={item.name} image={item.image}
                      category="sleeves" credits={item.priceCredits} cash={item.priceCash}
                      onExplore={() => { setCategory('sleeves'); setMode('buy'); setCurrentPage(1); }} />
                  ))}
                </div>
              </ShopFeaturedShelf>
            )}

            {featuredTalismans.length > 0 && (
              <ShopFeaturedShelf title={t('shop.talismans')} route="/missions"
                onExplore={() => { setCategory('talismans'); setMode('buy'); setCurrentPage(1); }}>
                <div className="market-featured-grid">
                  {featuredTalismans.map((item) => (
                    <ShopFeaturedTile key={item.id} name={item.name} image={item.image}
                      category="talismans" credits={item.priceCredits} cash={item.priceCash}
                      onExplore={() => { setCategory('talismans'); setMode('buy'); setCurrentPage(1); }} />
                  ))}
                </div>
              </ShopFeaturedShelf>
            )}

            {featuredMaletas.length > 0 && (
              <ShopFeaturedShelf title="Maletas" route="/inventory"
                onExplore={() => { setCategory('items'); setMode('buy'); setCurrentPage(1); }}>
                <div className="market-featured-grid">
                  {featuredMaletas.map((item) => (
                    <ShopFeaturedTile key={item.id} name={item.name} image={item.image}
                      category="items" credits={item.priceCredits} cash={item.priceCash}
                      onExplore={() => { setCategory('items'); setMode('buy'); setCurrentPage(1); }} />
                  ))}
                </div>
              </ShopFeaturedShelf>
            )}

            {featuredCardsMarquee.length === 0 && promotionCardsMarquee.length === 0 &&
             featuredPlaymats.length === 0 && featuredSleeves.length === 0 &&
             featuredTalismans.length === 0 && featuredMaletas.length === 0 && (
              <div className="market-featured-empty" role="status">
                {loading || loadingMaletas ? t('common.loading') : 'Ainda não há itens em destaque. Explore as categorias acima.'}
              </div>
            )}
          </motion.div>
        ) : (
          <>
        {/* Barra de pesquisa (cartas – Comprar e Vender) */}
        {category === 'cards' && (
          <div className="market-search mb-5">
            <label htmlFor="market-card-search">Encontre sua carta</label>
            <div className="market-search-field">
              <span aria-hidden="true" className="market-search-glyph">⌕</span>
              <input
              id="market-card-search"
              type="search"
              placeholder="Nome da carta..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="market-search-input"
              />
            </div>
          </div>
        )}

        {/* Filtros (cartas – Comprar e Vender; contagens por modo) */}
        {category === 'cards' && (
          <div className="market-filter-bar rounded-xl p-3 sm:p-4 mb-5 relative z-30">
            <div className="flex flex-wrap gap-4">
              {/* Ordenar por */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>
                    Ordenar:{' '}
                    {sortBy === 'name'
                      ? 'Nome'
                      : sortBy === 'priceAsc'
                        ? 'Preço ↑'
                        : sortBy === 'priceDesc'
                          ? 'Preço ↓'
                          : sortBy === 'atkAsc'
                            ? 'ATK ↑'
                            : 'ATK ↓'}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'sort' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'sort' && (
                  <div className="absolute top-full left-0 mt-2 w-56 duel-modal-scrim border border-white/20 rounded-lg shadow-2xl z-[100]">
                    <div className="py-2">
                      <button
                        onClick={() => {
                          setSortBy('name');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-rose-500/20 transition-colors ${
                          sortBy === 'name' ? 'bg-rose-600/50 text-amber-300' : 'text-white'
                        }`}
                      >
                        Nome
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('priceAsc');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-rose-500/20 transition-colors ${
                          sortBy === 'priceAsc' ? 'bg-rose-600/50 text-amber-300' : 'text-white'
                        }`}
                      >
                        Preço: Menor → Maior
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('priceDesc');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-rose-500/20 transition-colors ${
                          sortBy === 'priceDesc' ? 'bg-rose-600/50 text-amber-300' : 'text-white'
                        }`}
                      >
                        Preço: Maior → Menor
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('atkAsc');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-rose-500/20 transition-colors ${
                          sortBy === 'atkAsc' ? 'bg-rose-600/50 text-amber-300' : 'text-white'
                        }`}
                      >
                        ATK: Menor → Maior
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('atkDesc');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-rose-500/20 transition-colors ${
                          sortBy === 'atkDesc' ? 'bg-rose-600/50 text-amber-300' : 'text-white'
                        }`}
                      >
                        ATK: Maior → Menor
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Preço */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setOpenDropdown(openDropdown === 'price' ? null : 'price')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>Preço {(priceMin || priceMax) ? `(${priceMin || '0'} - ${priceMax || '∞'})` : ''}</span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'price' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'price' && (
                  <div className="absolute top-full left-0 mt-2 w-64 duel-modal-scrim border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-300 mb-1">Preço Mínimo</label>
                        <input
                          type="number"
                          placeholder="Min"
                          value={priceMin}
                          onChange={(e) => setPriceMin(e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300 mb-1">Preço Máximo</label>
                        <input
                          type="number"
                          placeholder="Max"
                          value={priceMax}
                          onChange={(e) => setPriceMax(e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      {(priceMin || priceMax) && (
                        <button
                          onClick={() => {
                            setPriceMin('');
                            setPriceMax('');
                          }}
                          className="w-full px-3 py-1 bg-rose-600/80 hover:bg-rose-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ATK (monstros) */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'atk' ? null : 'atk')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>
                    ATK{' '}
                    {(atkMin || atkMax) &&
                      `(${atkMin || '0'} – ${atkMax || '∞'})`}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'atk' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'atk' && (
                  <div className="absolute top-full left-0 mt-2 w-64 duel-modal-scrim border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <p className="text-xs text-gray-400 mb-2">Só aplica a monstros; magias e armadilhas continuam na lista.</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-300 mb-1">ATK mínimo (≥)</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="Ex.: 1500"
                          value={atkMin}
                          onChange={(e) => setAtkMin(e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300 mb-1">ATK máximo (≤)</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="Ex.: 2000"
                          value={atkMax}
                          onChange={(e) => setAtkMax(e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      {(atkMin || atkMax) && (
                        <button
                          onClick={() => {
                            setAtkMin('');
                            setAtkMax('');
                          }}
                          className="w-full px-3 py-1 bg-rose-600/80 hover:bg-rose-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
                        >
                          Limpar faixa
                        </button>
                      )}
                      <div>
                        <label className="block text-xs text-gray-300 mb-1.5">Ordenar por ATK</label>
                        <div className="flex flex-col gap-1 rounded-lg border border-white/20 bg-gray-950/90 p-1.5">
                          <button
                            type="button"
                            onClick={() => setSortBy('atkAsc')}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                              sortBy === 'atkAsc'
                                ? 'bg-rose-600/55 text-amber-100'
                                : 'text-white hover:bg-rose-500/20'
                            }`}
                          >
                            Menor → maior
                          </button>
                          <button
                            type="button"
                            onClick={() => setSortBy('atkDesc')}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                              sortBy === 'atkDesc'
                                ? 'bg-rose-600/55 text-amber-100'
                                : 'text-white hover:bg-rose-500/20'
                            }`}
                          >
                            Maior → menor
                          </button>
                          <button
                            type="button"
                            onClick={() => setSortBy('name')}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                              sortBy !== 'atkAsc' && sortBy !== 'atkDesc'
                                ? 'bg-rose-600/55 text-amber-100'
                                : 'text-white hover:bg-rose-500/20'
                            }`}
                          >
                            Nome / preço (menu Ordenar)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tipo */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>Tipo ({typeFilters.length})</span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'type' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'type' && (
                  <div className="absolute top-full left-0 mt-2 w-48 duel-modal-scrim border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="space-y-2">
                      {(['Monster', 'Spell', 'Trap'] as CardTypeFilter[]).map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={typeFilters.includes(type)}
                            onChange={() => toggleTypeFilter(type)}
                            className="w-4 h-4 text-amber-600 bg-white/10 border-white/20 rounded focus:ring-amber-500"
                          />
                          <span className="text-sm text-white">
                            {type === 'Monster' ? 'Monstro' : type === 'Spell' ? 'Magia' : 'Armadilha'}
                            <span className="text-gray-400 ml-1">({countByTypeDisplay[type] ?? 0})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Atributo */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setOpenDropdown(openDropdown === 'attribute' ? null : 'attribute')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>Atributo ({attributeFilters.length})</span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'attribute' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'attribute' && (
                  <div className="absolute top-full left-0 mt-2 w-64 duel-modal-scrim border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="grid grid-cols-2 gap-2">
                      {attributes.map(attr => (
                        <label key={attr} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={attributeFilters.includes(attr)}
                            onChange={() => toggleAttributeFilter(attr)}
                            className="w-4 h-4 text-amber-600 bg-white/10 border-white/20 rounded focus:ring-amber-500"
                          />
                          <span className="text-sm text-white">
                            {attr}
                            <span className="text-gray-400 ml-1">({countByAttributeDisplay[attr] ?? 0})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {attributeFilters.length > 0 && (
                      <button
                        onClick={() => setAttributeFilters([])}
                        className="w-full mt-3 px-3 py-1 bg-rose-600/80 hover:bg-rose-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tipo de monstro (Normal, Effect, Fusion) */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setOpenDropdown(openDropdown === 'monsterType' ? null : 'monsterType')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>Tipo de monstro ({monsterTypeFilters.length ? monsterTypeFilters.length : 'todos'})</span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'monsterType' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'monsterType' && (
                  <div className="absolute top-full left-0 mt-2 w-52 duel-modal-scrim border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="space-y-2">
                      {MONSTER_TYPES.map(mt => (
                        <label key={mt} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={monsterTypeFilters.includes(mt)}
                            onChange={() => toggleMonsterTypeFilter(mt)}
                            className="w-4 h-4 text-amber-600 bg-white/10 border-white/20 rounded focus:ring-amber-500"
                          />
                          <span className="text-sm text-white">
                            {mt === 'Normal' ? 'Normal' : mt === 'Effect' ? 'Effect' : 'Fusion'}
                            <span className="text-gray-400 ml-1">({countByMonsterTypeDisplay[mt] ?? 0})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {monsterTypeFilters.length > 0 && (
                      <button
                        onClick={() => setMonsterTypeFilters([])}
                        className="w-full mt-3 px-3 py-1 bg-rose-600/80 hover:bg-rose-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {mode === 'buy' ? (
          // MODO COMPRAR
          <>
            {/* Seção: Novos Itens Adicionados — carrossel igual ao da tela de login */}
            {newItemsMarqueeCards.length > 0 && category === 'cards' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                    ✨ Novos Itens Adicionados
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-yellow-400/50 to-transparent"></div>
                </div>
                <LatestCardsMarquee cards={newItemsMarqueeCards} showVerLoja={false} />
              </motion.div>
            )}

            {/* Grid de Itens */}
            {(mode === 'buy' && category === 'items' ? loadingMaletas : loading) ? (
              <div className="game-panel text-center py-12 rounded-xl">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-amber-800 border-t-amber-300"></div>
                <p className="mt-4 text-gray-200">{t('common.loading')}</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 bg-red-900/30 backdrop-blur-md border border-red-500/50 rounded-xl shadow-xl">
                <p className="text-red-300">{error}</p>
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="game-panel text-center py-12 rounded-xl">
                <p className="text-gray-200 text-lg">{t('shop.noItems')}</p>
              </div>
            ) : (
              <div className="market-catalog p-1 sm:p-3 mb-6">
                <div className={category === 'playmats' || category === 'talismans' || category === 'items'
                  ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5"
                  : "market-card-grid"
                }>
                  {paginatedItems.map((item, index) => {
                    if (category === 'cards') {
                      const card = item as Card;
                      return (
                        <motion.div
                          key={card.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          className="ui-market-card market-product-card market-playing-card flex flex-col p-2"
                        >
                          <div 
                            className="ui-card-frame market-card-visual w-full mb-2 cursor-pointer"
                            role="button"
                            tabIndex={0}
                            aria-label={`Ver detalhes da carta ${card.name}`}
                            onClick={() => setSelectedCard(card)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedCard(card);
                              }
                            }}
                          >
                            <CardImage
                              {...CARD_IMAGE_GRID_PROPS}
                              card={card}
                              className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-xl transition-all"
                              fallback="/images/fundoCarta.webp"
                              loading={index < 8 ? 'eager' : 'lazy'}
                              fetchPriority={index < 12 ? 'high' : 'auto'}
                            />
                            <div className="absolute top-1 right-1 z-20 flex flex-col items-end gap-1 pointer-events-none">
                              <DeckCopyLimitBadge maxCopiesInDeck={card.maxCopiesInDeck} variant="inline" showStandardLimit />
                              {card.promotionDiscountPercent ? (
                                <div
                                  className="flex items-center justify-center min-w-[24px] h-6 px-1 rounded-md bg-rose-500/95 text-white text-xs font-bold shadow-lg border border-rose-300/50"
                                  title={card.promotionLabel || `${card.promotionDiscountPercent}% off`}
                                >
                                  -{card.promotionDiscountPercent}%
                                </div>
                              ) : null}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity rounded-lg"></div>
                          </div>
                          <div className="market-card-details space-y-1 flex-1">
                            <h3 
                              className="market-card-name text-[11px] font-bold text-white line-clamp-2 cursor-pointer hover:text-amber-200 transition-colors" 
                              title={card.name}
                              onClick={() => setSelectedCard(card)}
                            >
                              {card.name}
                            </h3>
                            <div className="market-card-prices flex flex-col gap-1">
                              {(card.effectivePriceCredits ?? card.priceCredits) ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurchaseClick(card, 'credits');
                                  }}
                                  className="flex-1 inline-flex justify-center items-center gap-1 bg-gradient-to-r from-amber-600 to-yellow-700 hover:from-amber-500 hover:to-amber-700 px-1.5 py-1 rounded-md text-[10px] font-bold text-white transition-all shadow-md"
                                >
                                  💰 {card.effectivePriceCredits ?? card.priceCredits}
                                  {card.promotionDiscountPercent ? (
                                    <span className="ml-0.5 text-rose-200" title={card.promotionLabel || `${card.promotionDiscountPercent}% off`}> (-{card.promotionDiscountPercent}%)</span>
                                  ) : null}
                                </button>
                              ) : null}
                              {(card.effectivePriceCash ?? card.priceCash) ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurchaseClick(card, 'cash');
                                  }}
                                  className="flex-1 inline-flex justify-center items-center gap-1 bg-gradient-to-r from-rose-900 to-red-800 hover:from-rose-800 hover:to-red-700 px-1.5 py-1 rounded-md text-[10px] font-bold text-white transition-all shadow-md"
                                >
                                  💵 {Math.floor(Number(card.effectivePriceCash ?? card.priceCash))}
                                  {card.promotionDiscountPercent ? (
                                    <span className="ml-0.5 text-rose-200" title={card.promotionLabel || `${card.promotionDiscountPercent}% off`}> (-{card.promotionDiscountPercent}%)</span>
                                  ) : null}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      );
                    } else if (category === 'playmats') {
                      const playmat = item as Playmat;
                      const imageSrc = playmat.image
                        ? (playmat.image.startsWith('http')
                            ? playmat.image
                            : `${API_URL}${playmat.image}`)
                        : '';
                      return (
                        <motion.div
                          key={playmat.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.03, zIndex: 10 }}
                          className="market-cosmetic-card flex flex-col rounded-xl p-4 sm:p-5 border border-amber-400/35 hover:border-amber-300/60 transition-all w-full"
                        >
                          <div className="market-item-image-frame relative w-full aspect-[21/9] mb-4 rounded-xl overflow-hidden border border-amber-300/40">
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={playmat.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-5xl text-amber-200/80">
                                🎨
                              </div>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-white mb-2 truncate" title={playmat.name}>
                            {playmat.name}
                          </h3>
                          <div className="flex flex-col gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 bg-yellow-500/80 backdrop-blur-sm px-2 py-1 rounded">
                                <span className="text-white text-xs">💰</span>
                                <span className="text-xs font-bold text-white">
                                  {playmat.priceCredits}
                                </span>
                              </div>
                              {playmat.priceCash ? (
                                <div className="flex items-center gap-1 bg-emerald-500/80 backdrop-blur-sm px-2 py-1 rounded">
                                  <span className="text-white text-xs">💵</span>
                                  <span className="text-xs font-bold text-white">
                                    {Math.floor(Number(playmat.priceCash))}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex gap-2">
                              {playmat.priceCredits ? (
                                <button
                                  onClick={() => handlePurchaseClick(playmat, 'credits')}
                                  className="flex-1 px-3 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded text-xs font-bold transition-all shadow-lg hover:shadow-amber-500/60 text-white"
                                >
                                  💰 {playmat.priceCredits}
                                </button>
                              ) : null}
                              {playmat.priceCash ? (
                                <button
                                  onClick={() => handlePurchaseClick(playmat, 'cash')}
                                  className="flex-1 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded text-xs font-bold transition-all shadow-lg hover:shadow-emerald-500/60 text-white"
                                >
                                  💵 {Math.floor(Number(playmat.priceCash))}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      );
                    } else if (category === 'talismans') {
                      const talisman = item as TalismanTemplate;
                      const imageSrc = talisman.image
                        ? (talisman.image.startsWith('http')
                            ? talisman.image
                            : `${API_URL}${talisman.image}`)
                        : '';
                      return (
                        <motion.div
                          key={talisman.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.03, zIndex: 10 }}
                          className="market-cosmetic-card flex flex-col items-center w-full rounded-xl border border-amber-400/35 p-3 sm:p-4 gap-2"
                        >
                          <div className="market-item-image-frame relative w-full aspect-square flex items-center justify-center">
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt=""
                                className="max-w-full max-h-full w-auto h-auto object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                          </div>
                          <h3 className="text-sm font-bold text-white text-center px-1 line-clamp-2 w-full" title={talisman.name}>
                            {talisman.name}
                          </h3>
                          <div className="flex gap-2 w-full">
                            {(talisman.priceCredits ?? 0) > 0 ? (
                              <button
                                onClick={() => handlePurchaseClick(talisman, 'credits')}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 rounded text-xs font-bold transition-all shadow-lg text-white"
                              >
                                💰 {talisman.priceCredits}
                              </button>
                            ) : null}
                            {(talisman.priceCash ?? 0) > 0 ? (
                              <button
                                onClick={() => handlePurchaseClick(talisman, 'cash')}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded text-xs font-bold transition-all shadow-lg text-white"
                              >
                                💵 {Math.floor(Number(talisman.priceCash ?? 0))}
                              </button>
                            ) : null}
                          </div>
                        </motion.div>
                      );
                    } else if (category === 'items') {
                      const m = item as MaletaTemplate;
                      const imageSrc = m.image
                        ? (m.image.startsWith('http') ? m.image : `${API_URL}${m.image}`)
                        : '';
                      const owned = ownedMaletaTemplateIds.has(m.id);
                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.03, zIndex: 10 }}
                          className="market-cosmetic-card flex flex-col rounded-xl p-4 sm:p-5 border border-amber-400/35 hover:border-amber-300/60 transition-all w-full"
                        >
                          <div className="market-item-image-frame relative w-full aspect-[4/3] mb-4 rounded-xl overflow-hidden border border-amber-400/40 flex items-center justify-center">
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={m.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-5xl text-amber-200/80">🧳</div>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-white mb-1 truncate" title={m.name}>
                            {m.name}
                          </h3>
                          {m.description ? (
                            <p className="text-xs text-gray-400 mb-2 line-clamp-2">{m.description}</p>
                          ) : null}
                          <p className="text-xs text-amber-100/90 mb-3">
                            +{m.bonusDecks} deck(s) • +{m.bonusMaletaCapacity} cartas na maleta
                          </p>
                          {user ? (
                            <p className="text-[10px] text-gray-400 mb-2">
                              Seus limites: {user.maxDecks ?? 3} decks • {user.maletaCapacity ?? 500} cartas
                            </p>
                          ) : null}
                          {owned ? (
                            <p className="text-xs font-bold text-emerald-300 mb-2">✓ Você já possui este nível</p>
                          ) : null}
                          <div className="flex gap-2 mt-auto">
                            {(m.priceCredits ?? 0) > 0 ? (
                              <button
                                onClick={() => handlePurchaseMaleta(m.id, 'credits')}
                                disabled={buyingMaletaTemplateId !== null || owned}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 rounded text-xs font-bold transition-all shadow-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                💰 {m.priceCredits}
                              </button>
                            ) : null}
                            {(m.priceCash ?? 0) > 0 ? (
                              <button
                                onClick={() => handlePurchaseMaleta(m.id, 'cash')}
                                disabled={buyingMaletaTemplateId !== null || owned}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded text-xs font-bold transition-all shadow-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                💵 {Math.floor(Number(m.priceCash ?? 0))}
                              </button>
                            ) : null}
                          </div>
                        </motion.div>
                      );
                    } else if (category === 'sleeves') {
                      const sleeve = item as Sleeve;
                      const sleeveImageSrc = sleeve.image
                        ? (sleeve.image.startsWith('http')
                            ? sleeve.image
                            : `${API_URL}${sleeve.image}`)
                        : '';
                      return (
                        <motion.div
                          key={sleeve.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          className="market-cosmetic-card flex flex-col rounded-xl p-3 border border-amber-400/35 hover:border-amber-300/60 transition-all"
                        >
                          <div className="relative w-full aspect-[2/3] mb-3 rounded-lg overflow-hidden">
                            <div className="market-item-image-glow absolute inset-0 rounded-xl pointer-events-none" />
                            <div className="relative w-full h-full rounded-xl border border-white/40 overflow-hidden">
                              {sleeveImageSrc ? (
                                <img
                                  src={sleeveImageSrc}
                                  alt={sleeve.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl text-emerald-100/80">
                                  🎭
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2 flex-1">
                            <h3 className="text-sm font-bold text-white line-clamp-2 min-h-[2.5rem]" title={sleeve.name}>
                              {sleeve.name}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              {sleeve.priceCredits ? (
                                <button
                                  onClick={() => handlePurchaseClick(sleeve, 'credits')}
                                  className="flex items-center gap-1 bg-gradient-to-r from-green-600/90 to-emerald-600/90 hover:from-green-600 hover:to-emerald-600 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg text-white"
                                >
                                  💰 {sleeve.priceCredits}
                                </button>
                              ) : null}
                              {sleeve.priceCash ? (
                                <button
                                  onClick={() => handlePurchaseClick(sleeve, 'cash')}
                                  className="flex items-center gap-1 bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-600 hover:to-teal-600 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg text-white"
                                >
                                  💵 {Math.floor(Number(sleeve.priceCash))}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      );
                    }
                  })}
                </div>
              </div>
            )}

            {/* Paginação */}
            {mode === 'buy' && (totalPages > 1 || currentItems.length > 0) && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {totalPages > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      &lt;
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-4 py-2 rounded-lg backdrop-blur-sm transition-all ${
                            currentPage === pageNum
                              ? 'bg-rose-600/80 text-white shadow-lg'
                              : 'bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 5 && (
                      <>
                        <span className="px-2 text-gray-300">...</span>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      &gt;
                    </button>
                  </>
                )}
                <span className="text-white text-sm">
                  Página {currentPage} de {Math.max(totalPages, 1)}
                  {category === 'cards' && ` (${currentItems.length} cartas)`}
                  {category === 'playmats' && ` (${currentItems.length} playmats)`}
                  {category === 'sleeves' && ` (${currentItems.length} sleeves)`}
                  {category === 'talismans' && ` (${currentItems.length} talismãs)`}
                  {category === 'items' && ` (${currentItems.length} maletas)`}
                </span>
              </div>
            )}
          </>
        ) : (
          // MODO VENDER
          <div>
            {category === 'cards' ? (
              <>
                {loading ? (
                  <div className="game-panel text-center py-12 rounded-xl">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
                    <p className="mt-4 text-gray-200">Carregando inventário...</p>
                  </div>
                ) : error ? (
                  <div className="text-center py-12 bg-red-900/30 backdrop-blur-md border border-red-500/50 rounded-xl shadow-xl">
                    <p className="text-red-300">{error}</p>
                  </div>
                ) : (() => {
                  // Lista filtrada e paginada na venda (usa filteredAndSortedSellList e paginatedItems)
                  const sellListEmpty = sellListBase.length === 0;
                  const noResults = filteredAndSortedSellList.length === 0;
                  const listToShow = noResults ? [] : paginatedItems as any[];
                  if (sellListEmpty) {
                    return (
                      <div className="game-panel text-center py-12 rounded-xl">
                        <p className="text-gray-200 text-lg mb-2">📦 Nenhuma carta na maleta para vender</p>
                        <p className="text-gray-400 text-sm">Só aparecem aqui as cartas que não estão em nenhum deck.</p>
                      </div>
                    );
                  }
                  if (noResults) {
                    return (
                      <div className="game-panel text-center py-12 rounded-xl">
                        <p className="text-gray-200 text-lg mb-2">{t('common.noResults')}</p>
                        <p className="text-gray-400 text-sm">Tente alterar pesquisa ou filtros.</p>
                      </div>
                    );
                  }
                  return (
                  <>
                  <div className="market-catalog p-1 sm:p-3 mb-6">
                    <div className="market-card-grid">
                      {listToShow.map((userCard: any, index: number) => {
                        if (!userCard?.card) return null;
                        const card = userCard.card;
                        const sellPriceCredits = Math.floor((card.priceCredits || 0) / 2);
                        const sellPriceCash = Math.floor((card.priceCash || 0) / 2);
                        const isSelling = sellingCardId === card.id;

                        return (
                          <motion.div
                            key={userCard.id || card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            whileHover={{ scale: 1.05, zIndex: 10 }}
                            className="ui-market-card market-product-card market-playing-card flex flex-col p-2"
                          >
                            <div className="ui-card-frame market-card-visual w-full mb-2">
                              <CardImage
                                {...CARD_IMAGE_GRID_PROPS}
                                card={card}
                                className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-xl transition-all"
                                fallback="/images/fundoCarta.webp"
                                loading={index < 8 ? 'eager' : 'lazy'}
                                fetchPriority={index < 12 ? 'high' : 'auto'}
                              />
                              <DeckCopyLimitBadge maxCopiesInDeck={card.maxCopiesInDeck} showStandardLimit />
                              {(() => {
                                const sellableQty = (userCard as any).sellableQuantity ?? userCard.quantity;
                                if (sellableQty < 1) return null;
                                return (
                                  <div className="absolute top-1 left-1 z-20 bg-green-500/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-white shadow-lg border border-white/20">
                                    x{sellableQty}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="market-card-details space-y-1 flex-1">
                              <h3 className="market-card-name text-[11px] font-bold text-white line-clamp-2" title={card.name}>
                                {card.name}
                              </h3>
                              {card.type === 'Monster' && (
                                <div className="flex gap-1 flex-wrap">
                                  <div className="bg-red-500/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px]">
                                    <span className="text-white font-bold">ATK {card.atk || 0}</span>
                                  </div>
                                  <div className="bg-amber-500/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px]">
                                    <span className="text-white font-bold">DEF {card.def || 0}</span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-1 flex-wrap">
                                {sellPriceCredits > 0 && (
                                  <div className="flex items-center gap-0.5 bg-yellow-500/80 backdrop-blur-sm px-2 py-1 rounded text-[10px]">
                                    <span className="text-white">💰</span>
                                    <span className="font-bold text-white">{sellPriceCredits}</span>
                                  </div>
                                )}
                                {sellPriceCash > 0 && (
                                  <div className="flex items-center gap-0.5 bg-green-500/80 backdrop-blur-sm px-2 py-1 rounded text-[10px]">
                                    <span className="text-white">💵</span>
                                    <span className="font-bold text-white">{sellPriceCash}</span>
                                  </div>
                                )}
                              </div>
                              {(() => {
                                const sellableQty = (userCard as any).sellableQuantity ?? userCard.quantity;
                                const canSell = sellableQty > 0 && (sellPriceCredits > 0 || sellPriceCash > 0);
                                return (
                                  <button
                                    onClick={() => canSell && handleSellClick(userCard)}
                                    disabled={isSelling || !canSell}
                                    title={sellableQty <= 0 ? 'Cartas em deck não podem ser vendidas. Só a maleta.' : undefined}
                                    className="w-full mt-1 px-1.5 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSelling ? '⏳ Vendendo...' : sellableQty <= 0 ? '🔒 Em deck' : `💰 ${t('shop.sell')}`}
                                  </button>
                                );
                              })()}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paginação na aba Vender (cartas) */}
                  {(totalPages > 1 || currentItems.length > 0) && (
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                      {totalPages > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            &lt;
                          </button>
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            const pageNum = i + 1;
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setCurrentPage(pageNum)}
                                className={`px-4 py-2 rounded-lg backdrop-blur-sm transition-all ${
                                  currentPage === pageNum
                                    ? 'bg-green-600/80 text-white shadow-lg'
                                    : 'bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          {totalPages > 5 && (
                            <>
                              <span className="px-2 text-gray-300">...</span>
                              <button
                                onClick={() => setCurrentPage(totalPages)}
                                className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
                              >
                                {totalPages}
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            &gt;
                          </button>
                        </>
                      )}
                      <span className="text-white text-sm">
                        Página {currentPage} de {Math.max(totalPages, 1)} ({currentItems.length} cartas)
                      </span>
                    </div>
                  )}
                  </>
                  );
                })()}
              </>
            ) : (
              <div className="game-panel text-center py-12 rounded-xl">
                <p className="text-gray-200 text-lg">
                  {category === 'items' || category === 'talismans'
                    ? 'Esta categoria é só para compra. Use a aba Comprar.'
                    : category === 'playmats'
                      ? 'Venda de playmats em breve!'
                      : 'Venda de sleeves em breve!'}
                </p>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Modal de Informações da Carta */}
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`bg-gradient-to-br backdrop-blur-xl ${
                selectedCard.rarity === 'Common' ? 'from-gray-600/80 to-gray-700/80' :
                selectedCard.rarity === 'Rare' ? 'from-amber-600/80 to-orange-700/80' :
                selectedCard.rarity === 'Super Rare' ? 'from-rose-600/80 to-amber-700/80' :
                selectedCard.rarity === 'Ultra Rare' ? 'from-yellow-600/80 to-yellow-700/80' :
                selectedCard.rarity === 'Secret Rare' ? 'from-yellow-400/80 to-orange-500/80' :
                'from-gray-600/80 to-gray-700/80'
              } rounded-xl p-6 max-w-md w-full border-2 border-white/20 shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-white">Informações da Carta</h2>
                <button
                  onClick={() => setSelectedCard(null)}
                  className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="w-full mb-4 relative rounded-lg overflow-hidden border-2 border-white/20 shadow-lg mx-auto" style={{ aspectRatio: '421/614', maxWidth: '200px', maxHeight: '280px' }}>
                <CardImage
                  {...CARD_IMAGE_GRID_PROPS}
                  card={selectedCard}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '140px' }}
                  fallback="/images/fundoCarta.webp"
                  loading="eager"
                  fetchPriority="high"
                  sizes="200px"
                />
                <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
                  <DeckCopyLimitBadge maxCopiesInDeck={selectedCard.maxCopiesInDeck} variant="inline" showStandardLimit />
                  {selectedCard.promotionDiscountPercent ? (
                    <div
                      className="min-w-[36px] h-9 px-2 rounded-lg bg-rose-500/95 text-white text-sm font-bold shadow-lg border border-rose-300/50 flex items-center justify-center"
                      title={selectedCard.promotionLabel || `${selectedCard.promotionDiscountPercent}% off`}
                    >
                      -{selectedCard.promotionDiscountPercent}%
                    </div>
                  ) : null}
                </div>
              </div>
              
              <button type="button" className="ui-button-secondary mb-4 w-full" onClick={() => setInspectedCard(selectedCard)} aria-label={`Ampliar imagem de ${selectedCard.name}`}>
                🔍 Ver arte da carta em tamanho maior
              </button>
              <h3 className="text-xl font-bold text-white mb-2">{selectedCard.name}</h3>
              <p className="mb-2 text-sm font-semibold text-amber-200/95">
                {(selectedCard.maxCopiesInDeck ?? 3) === 0
                  ? 'Banida — não pode ser usada no deck.'
                  : `Pode incluir até ${selectedCard.maxCopiesInDeck ?? 3} cópia${(selectedCard.maxCopiesInDeck ?? 3) === 1 ? '' : 's'} com o mesmo nome no deck.`}
              </p>
              <p className="text-white/80 mb-4">{getCardDescription(selectedCard)}</p>
              
              {selectedCard.type === 'Monster' && (
                <div className="space-y-2 mb-4">
                  <div className="flex gap-2">
                    <div className="bg-red-500/80 px-3 py-1 rounded">
                      <span className="text-white font-bold">ATK: {selectedCard.atk || 0}</span>
                    </div>
                    <div className="bg-amber-500/80 px-3 py-1 rounded">
                      <span className="text-white font-bold">DEF: {selectedCard.def || 0}</span>
                    </div>
                    {selectedCard.level && (
                      <div className="bg-rose-500/80 px-3 py-1 rounded">
                        <span className="text-white font-bold">Nível: {selectedCard.level}</span>
                      </div>
                    )}
                  </div>
                  {selectedCard.attribute && (
                    <div className="text-white/80 text-sm">
                      <span className="font-semibold">Atributo:</span> {selectedCard.attribute}
                    </div>
                  )}
                  {selectedCard.race && (
                    <div className="text-white/80 text-sm">
                      <span className="font-semibold">Tipo:</span> {selectedCard.race}
                    </div>
                  )}
                </div>
              )}
              
              {(selectedCard.effectivePriceCredits ?? selectedCard.priceCredits) || (selectedCard.effectivePriceCash ?? selectedCard.priceCash) ? (
                selectedCard.promotionDiscountPercent ? (
                  <p className="text-rose-300 text-sm pt-2">
                    🏷️ Promoção: {selectedCard.promotionLabel || `${selectedCard.promotionDiscountPercent}% off`}
                  </p>
                ) : null
              ) : null}
              <div className="flex gap-2 pt-4 border-t border-white/20">
                {(selectedCard.effectivePriceCredits ?? selectedCard.priceCredits) ? (
                  <button
                    onClick={() => {
                      setSelectedCard(null);
                      handlePurchaseClick(selectedCard, 'credits');
                    }}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 rounded-lg text-white font-bold transition-all"
                  >
                    💰 {selectedCard.effectivePriceCredits ?? selectedCard.priceCredits} Créditos
                  </button>
                ) : null}
                {(selectedCard.effectivePriceCash ?? selectedCard.priceCash) ? (
                  <button
                    onClick={() => {
                      setSelectedCard(null);
                      handlePurchaseClick(selectedCard, 'cash');
                    }}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-lg text-white font-bold transition-all"
                  >
                    💵 {Math.floor(Number(selectedCard.effectivePriceCash ?? selectedCard.priceCash))} Cash
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Modal de Confirmação de Compra */}
        {showPurchaseConfirm && purchaseItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowPurchaseConfirm(false);
              setPurchaseItem(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-gradient-to-br from-slate-800/70 to-slate-900/70 backdrop-blur-xl rounded-xl p-6 max-w-md w-full border-2 border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4">{t('shop.confirmPurchase')}</h2>
              <div className="mb-4">
                {category === 'talismans' && 'image' in purchaseItem.item && (purchaseItem.item as TalismanTemplate).image ? (
                  <div className="flex flex-col items-center gap-2 mb-4">
                    <img
                      src={
                        (purchaseItem.item as TalismanTemplate).image!.startsWith('http')
                          ? (purchaseItem.item as TalismanTemplate).image!
                          : `${API_URL}${(purchaseItem.item as TalismanTemplate).image}`
                      }
                      alt=""
                      className="max-h-52 w-auto max-w-full object-contain"
                    />
                    <p className="text-white font-semibold text-center text-sm">
                      {(purchaseItem.item as TalismanTemplate).name}
                    </p>
                  </div>
                ) : (
                  <p className="text-white/80 mb-2">
                    <span className="font-semibold">Item:</span> {purchaseItem.item.name}
                  </p>
                )}
                {category === 'cards' && (
                  <div className="mb-2">
                    <span className="text-white/80 font-semibold block mb-2">Quantidade:</span>
                    <div className="inline-flex items-center rounded-lg overflow-hidden border border-white/20 bg-slate-700/80">
                      <button
                        type="button"
                        onClick={() => setPurchaseQuantity((q) => Math.max(1, q - 1))}
                        disabled={purchaseQuantity <= 1}
                        className="w-10 h-10 flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-600 text-white font-bold text-lg transition-colors"
                        aria-label="Diminuir quantidade"
                      >
                        −
                      </button>
                      <span className="w-12 h-10 flex items-center justify-center text-white font-bold bg-slate-700 border-x border-white/10 text-center tabular-nums">
                        {purchaseQuantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPurchaseQuantity((q) => Math.min(99, q + 1))}
                        disabled={purchaseQuantity >= 99}
                        className="w-10 h-10 flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-600 text-white font-bold text-lg transition-colors"
                        aria-label="Aumentar quantidade"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-white/80 mb-2">
                  <span className="font-semibold">Preço:</span>{' '}
                  {purchaseItem.method === 'credits' ? '💰' : '💵'}{' '}
                  {purchaseItem.method === 'credits' 
                    ? ((('effectivePriceCredits' in purchaseItem.item ? purchaseItem.item.effectivePriceCredits : undefined) ?? purchaseItem.item.priceCredits) || 0) * (category === 'cards' ? purchaseQuantity : 1)
                    : Math.floor((Number(('effectivePriceCash' in purchaseItem.item ? purchaseItem.item.effectivePriceCash : undefined) ?? purchaseItem.item.priceCash) || 0) * (category === 'cards' ? purchaseQuantity : 1))}{' '}
                  {purchaseItem.method === 'credits' ? 'Créditos' : 'Cash'}
                  {category === 'cards' && purchaseQuantity > 1 && (
                    <span className="text-white/60 text-sm ml-1">
                      ({purchaseQuantity} × {purchaseItem.method === 'credits' ? (('effectivePriceCredits' in purchaseItem.item ? purchaseItem.item.effectivePriceCredits : undefined) ?? purchaseItem.item.priceCredits) : Math.floor(Number(('effectivePriceCash' in purchaseItem.item ? purchaseItem.item.effectivePriceCash : undefined) ?? purchaseItem.item.priceCash))})
                    </span>
                  )}
                </p>
                {user && (
                  <p className="text-white/80">
                    <span className="font-semibold">Seu saldo:</span>{' '}
                    {purchaseItem.method === 'credits' 
                      ? `💰 ${user.credits || 0} Créditos`
                      : `💵 ${Math.floor(Number(user.cash) || 0)} Cash`}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPurchaseConfirm(false);
                    setPurchaseItem(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handlePurchaseConfirm}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-bold transition-all"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Modal de Confirmação de Venda com Quantidade */}
        {sellModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
            onClick={() => setSellModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-gradient-to-br from-slate-800/70 to-slate-900/70 backdrop-blur-xl rounded-xl p-6 max-w-md w-full border-2 border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4">{t('shop.sellCard')}</h2>
              <div className="mb-4">
                <p className="text-white/80 mb-2">
                  <span className="font-semibold">Carta:</span> {sellModal.userCard.card.name}
                </p>
                {(() => {
                  const sellable = sellModal.userCard.sellableQuantity ?? sellModal.userCard.quantity;
                  return (
                    <>
                      <p className="text-white/80 mb-2">
                        <span className="font-semibold">Quantidade disponível:</span> {sellable} cópia(s)
                      </p>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-white/80 font-semibold">Quantidade a vender:</span>
                        <input
                          type="number"
                          min={1}
                          max={sellable}
                          value={Math.min(sellModal.quantity, sellable)}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10) || 1;
                            setSellModal(prev => prev ? { ...prev, quantity: Math.min(sellable, Math.max(1, v)) } : null);
                          }}
                          className="w-20 px-2 py-1 rounded bg-slate-700 text-white border border-white/20"
                        />
                      </div>
                    </>
                  );
                })()}
                <p className="text-white/80">
                  <span className="font-semibold">Valor (metade do preço):</span>{' '}
                  💰 {Math.floor((sellModal.userCard.card.priceCredits || 0) / 2) * sellModal.quantity} créditos{' '}
                  💵 {Math.floor((sellModal.userCard.card.priceCash || 0) / 2) * sellModal.quantity} cash
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setSellModal(null)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSellConfirm}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-bold transition-all"
                >
                  {t('shop.sell')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Modal de sucesso: Compra ou Venda realizada */}
        {successModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-[60] p-4"
            onClick={() => setSuccessModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 backdrop-blur-xl rounded-2xl p-6 max-w-sm w-full border-2 border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {successModal.type === 'purchase' ? (
                <>
                  <div className="flex flex-col items-center text-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-4xl mb-3">
                      ✅
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">{t('shop.purchaseDone')}</h2>
                    <p className="text-gray-300 text-sm">Item adicionado ao seu inventário</p>
                  </div>
                  {successModal.itemImage && (
                    <div className="w-full max-w-[120px] mx-auto aspect-[2/3] rounded-lg overflow-hidden border border-white/20 mb-4">
                      {successModal.category === 'cards' ? (
                        <CardImage
                          card={{ cardImage: successModal.itemImage, name: successModal.itemName }}
                          className="w-full h-full object-cover"
                          fallback="/images/fundoCarta.webp"
                          loading="eager"
                          sizes="120px"
                        />
                      ) : (
                        <img
                          src={successModal.itemImage}
                          alt={successModal.itemName}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  )}
                  <p className="text-white font-semibold text-center mb-2">{successModal.itemName}</p>
                  {successModal.quantity != null && successModal.quantity > 1 && (
                    <p className="text-gray-400 text-sm text-center mb-2">{successModal.quantity} cópias</p>
                  )}
                  <div className="space-y-1 text-sm text-gray-300 mb-4">
                    <p>
                      Pago: {successModal.paymentMethod === 'credits' ? '💰' : '💵'} {successModal.price}{' '}
                      {successModal.paymentMethod === 'credits' ? 'Créditos' : 'Cash'}
                    </p>
                    {(successModal.remainingCredits != null || successModal.remainingCash != null) && (
                      <p className="text-green-300/90">
                        Saldo: 💰 {successModal.remainingCredits ?? 0} créditos · 💵 {Number(successModal.remainingCash ?? 0).toFixed(2)} cash
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSuccessModal(null)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-700 hover:from-rose-700 hover:to-amber-800 text-white font-bold transition-all"
                  >
                    OK
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-4xl mb-3">
                      💰
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">{t('shop.saleDone')}</h2>
                    <p className="text-gray-300 text-sm">Créditos e cash creditados</p>
                  </div>
                  {successModal.cardImage && (
                    <div className="w-full max-w-[120px] mx-auto aspect-[2/3] rounded-lg overflow-hidden border border-white/20 mb-4">
                      <CardImage
                        card={{ cardImage: successModal.cardImage, name: successModal.cardName }}
                        className="w-full h-full object-cover"
                        fallback="/images/fundoCarta.webp"
                        loading="eager"
                        sizes="120px"
                      />
                    </div>
                  )}
                  <p className="text-white font-semibold text-center mb-2">{successModal.cardName}</p>
                  {successModal.quantity > 1 && (
                    <p className="text-gray-400 text-sm text-center mb-2">{successModal.quantity} cópias vendidas</p>
                  )}
                  <div className="flex gap-4 justify-center text-sm mb-4">
                    <span className="text-yellow-300 font-semibold">💰 +{successModal.creditsGained} créditos</span>
                    <span className="text-green-300 font-semibold">💵 +{successModal.cashGained} cash</span>
                  </div>
                  <button
                    onClick={() => setSuccessModal(null)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold transition-all"
                  >
                    OK
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
        {inspectedCard && <CardArtViewer card={inspectedCard} onClose={() => setInspectedCard(null)} />}
      </div>
    </div>
  );
}
