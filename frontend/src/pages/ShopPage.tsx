import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';
import CardImage from '../components/CardImage';
import LatestCardsMarquee, { type MarqueeCard } from '../components/LatestCardsMarquee';
import { useCosmeticsStore } from '../stores/cosmeticsStore';

interface Card {
  id: string;
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

type SortOption = 'name' | 'priceAsc' | 'priceDesc';
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
type ShopCategory = 'cards' | 'playmats' | 'sleeves' | 'talismans';

export default function ShopPage() {
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
  const [showPurchaseConfirm, setShowPurchaseConfirm] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<{ item: Card | Playmat | Sleeve | TalismanTemplate; method: 'credits' | 'cash' } | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [sellModal, setSellModal] = useState<{ userCard: any; quantity: number } | null>(null);
  const {
    addPlaymat,
    addSkin,
  } = useCosmeticsStore();
  
  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [typeFilters, setTypeFilters] = useState<CardTypeFilter[]>(['Monster', 'Spell', 'Trap']);
  const [attributeFilters, setAttributeFilters] = useState<string[]>([]);
  const [monsterTypeFilters, setMonsterTypeFilters] = useState<MonsterTypeFilter[]>([]);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  // Estado dos dropdowns
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Ao entrar na loja, mostrar sempre a aba/tela de destaque
  useEffect(() => {
    setCategory(null);
    setMode('buy');
  }, []);

  // Buscar cartas da loja
  useEffect(() => {
    let cancelled = false;
    
    const fetchCards = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await Promise.race([
          api.get('/cards/shop/for-sale', { timeout: 20000 }),
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
        
        const cardsWithExtras = dataArray.map((card: any) => ({
          ...card,
          stock: Math.floor(Math.random() * 250) + 1,
        }));
        
        if (!cancelled) {
          setCards(cardsWithExtras);
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
  }, [mode, category, user]);

  // Buscar playmats e skins de cartas do backend
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
        console.error('Erro ao carregar skins de cartas:', error);
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

    if (mode === 'buy') {
      if (category === null || category === 'playmats') fetchPlaymats();
      if (category === null || category === 'sleeves') fetchSleeves();
      if (category === null || category === 'talismans') fetchTalismans();
    }
    
    return () => {
      cancelled = true;
    };
  }, [category, mode]);

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
        card.description?.toLowerCase().includes(searchTerm.toLowerCase())
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

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'priceAsc':
          return (a.priceCredits || 0) - (b.priceCredits || 0);
        case 'priceDesc':
          return (b.priceCredits || 0) - (a.priceCredits || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [cards, searchTerm, sortBy, priceMin, priceMax, typeFilters, attributeFilters, monsterTypeFilters]);

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
          card.description?.toLowerCase().includes(searchTerm.toLowerCase())
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
        default:
          return 0;
      }
    });

    return filtered;
  }, [sellListBase, searchTerm, sortBy, priceMin, priceMax, typeFilters, attributeFilters, monsterTypeFilters]);

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

      alert(`✅ ${response.data.message}\n💰 Créditos: +${response.data.creditsGained || 0}\n💵 Cash: +${response.data.cashGained || 0}`);

      const inventoryResponse = await api.get('/shop/inventory');
      const invData = inventoryResponse.data;
      setInventory(Array.isArray(invData) ? invData : (invData?.cards ?? []));

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
      alert('Você precisa estar logado para comprar!');
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

  const handlePurchaseConfirm = async () => {
    if (!purchaseItem || !user) return;

    const { item, method: paymentMethod } = purchaseItem;
    const priceCredits = (item as Card).effectivePriceCredits ?? item.priceCredits ?? 0;
    const priceCash = (item as Card).effectivePriceCash ?? item.priceCash ?? 0;
    const cashNum = typeof priceCash === 'number' ? priceCash : Number(priceCash) || 0;
    const qty = category === 'cards' ? Math.min(99, Math.max(1, purchaseQuantity)) : 1;
    const price = (paymentMethod === 'credits' ? priceCredits : cashNum) * qty;

    try {
      setLoading(true);
      setShowPurchaseConfirm(false);

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
        alert(
          `✅ Compra realizada com sucesso!\n\n🎴 ${item.name}${qty > 1 ? ` (${qty} cópias)` : ''} adicionada(s) ao seu inventário!\n${
            paymentMethod === 'credits' ? '💰' : '💵'
          } ${price} ${
            paymentMethod === 'credits' ? 'Créditos' : 'Cash'
          } foram descontados.`
        );
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
        alert('✅ Playmat adquirido e adicionado ao seu inventário de cosméticos!');
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
        alert('✅ Skin de carta adquirida e adicionada ao seu inventário de cosméticos!');
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
        alert('✅ Talismã adquirido! Equipe-o no inventário para ganhar bônus de Score, Cash e Arena Points na Arena.');
      }
      
      setPurchaseItem(null);
    } catch (error: any) {
      alert(`❌ Erro: ${error.response?.data?.message || error.message}`);
      setPurchaseItem(null);
    } finally {
      setLoading(false);
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

  // Novos itens no formato do carrossel (para a seção "Novos Itens Adicionados")
  const newItemsMarqueeCards: MarqueeCard[] = useMemo(() => {
    return newItems.map((c) => ({
      id: c.id,
      name: c.name,
      cardImage: c.cardImage,
      type: c.type,
      rarity: c.rarity,
      createdAt: c.createdAt,
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
      name: c.name,
      cardImage: c.cardImage,
      type: c.type,
      rarity: c.rarity,
      createdAt: c.createdAt,
    }));
  }, [featuredCards]);
  const featuredPlaymats = useMemo(() => playmats.slice(0, 3), [playmats]);
  const featuredSleeves = useMemo(() => sleeves.slice(0, 3), [sleeves]);
  const featuredTalismans = useMemo(() => talismans.slice(0, 3), [talismans]);

  // Cartas em promoção (com desconto ativo)
  const promotionCards = useMemo(() => {
    return cards.filter((c) => c.promotionDiscountPercent != null && c.promotionDiscountPercent > 0);
  }, [cards]);
  const promotionCardsMarquee: MarqueeCard[] = useMemo(() => {
    return promotionCards.map((c) => ({
      id: c.id,
      name: c.name,
      cardImage: c.cardImage,
      type: c.type,
      rarity: c.rarity,
      createdAt: c.createdAt,
    }));
  }, [promotionCards]);

  return (
    <div className="min-h-screen text-white py-6">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">
            🛒 Loja
          </h1>
          <p className="text-sm text-gray-300">Compre cartas, playmats e skins de cartas para personalizar seu deck</p>
        </motion.div>

        {/* Tabs Comprar / Vender */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setMode('buy'); setCurrentPage(1); }}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-xl border-2 ${
              mode === 'buy'
                ? 'bg-gradient-to-r from-blue-600/80 to-blue-700/80 text-white border-blue-500/50 shadow-lg shadow-blue-500/30'
                : 'text-gray-300 hover:bg-white/10 border-white/20'
            }`}
          >
            🛒 Comprar
          </button>
          <button
            onClick={() => { setMode('sell'); setCurrentPage(1); }}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-xl border-2 ${
              mode === 'sell'
                ? 'bg-gradient-to-r from-green-600/80 to-green-700/80 text-white border-green-500/50 shadow-lg shadow-green-500/30'
                : 'text-gray-300 hover:bg-white/10 border-white/20'
            }`}
          >
            💰 Vender
          </button>
        </div>

        {/* Abas: Destaques | Cartas | Playmats | Skins | Talismãs */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 rounded-xl p-2">
            <button
              onClick={() => { setCategory(null); setCurrentPage(1); }}
              className={`px-4 py-2.5 text-sm font-bold transition-all rounded-lg ${
                category === null
                  ? 'bg-gradient-to-r from-yellow-500/90 to-orange-500/90 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              ⭐ Destaques
            </button>
            <button
              onClick={() => { setCategory('cards'); setCurrentPage(1); }}
              className={`px-4 py-2.5 text-sm font-bold transition-all rounded-lg ${
                category === 'cards'
                  ? 'bg-gradient-to-r from-purple-600/80 to-pink-600/80 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              🎴 Cartas
            </button>
            <button
              onClick={() => { setCategory('playmats'); setCurrentPage(1); }}
              className={`px-4 py-2.5 text-sm font-bold transition-all rounded-lg ${
                category === 'playmats'
                  ? 'bg-gradient-to-r from-blue-600/80 to-cyan-600/80 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              🎨 Playmats
            </button>
            <button
              onClick={() => { setCategory('sleeves'); setCurrentPage(1); }}
              className={`px-4 py-2.5 text-sm font-bold transition-all rounded-lg ${
                category === 'sleeves'
                  ? 'bg-gradient-to-r from-green-600/80 to-emerald-600/80 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              🎭 Skins de cartas
            </button>
            <button
              onClick={() => { setCategory('talismans'); setCurrentPage(1); }}
              className={`px-4 py-2.5 text-sm font-bold transition-all rounded-lg ${
                category === 'talismans'
                  ? 'bg-gradient-to-r from-amber-600/80 to-yellow-600/80 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              ✨ Talismãs
            </button>
          </div>
        </div>

        {category === null ? (
          /* ---------- Aba Destaques: promoções + itens em destaque ---------- */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-10"
          >
            {/* Cartas em promoção */}
            {promotionCardsMarquee.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-500">
                    🏷️ Cartas em promoção
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-rose-400/50 to-transparent" />
                </div>
                <div className="rounded-2xl p-4 bg-white/5 border border-rose-500/20 space-y-2">
                  <p className="text-sm text-gray-400">Aproveite descontos por tempo limitado</p>
                  <div className="max-w-full -mx-2 md:mx-0">
                    <LatestCardsMarquee
                      cards={promotionCardsMarquee}
                      showVerLoja={false}
                      hideTitle
                      onCardClick={(c) => {
                        const full = cards.find((x) => x.id === c.id);
                        if (full) {
                          setCategory('cards');
                          setMode('buy');
                          setSelectedCard(full);
                          setCurrentPage(1);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Itens em destaque */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                  ⭐ Itens em destaque
                </h2>
                <div className="flex-1 h-px bg-gradient-to-r from-yellow-400/50 to-transparent" />
              </div>
              <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-6">
                {featuredCardsMarquee.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">🎴 Últimas cartas cadastradas</p>
                    <div className="max-w-full -mx-2 md:mx-0">
                      <LatestCardsMarquee
                        cards={featuredCardsMarquee}
                        showVerLoja={false}
                        hideTitle
                        onCardClick={(c) => {
                          const full = cards.find((x) => x.id === c.id);
                          if (full) {
                            setCategory('cards');
                            setMode('buy');
                            setSelectedCard(full);
                            setCurrentPage(1);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
                {featuredPlaymats.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">🎨 Playmats</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {featuredPlaymats.map((pm) => {
                        const src = pm.image ? (pm.image.startsWith('http') ? pm.image : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${pm.image}`) : '';
                        return (
                          <motion.div
                            key={pm.id}
                            whileHover={{ scale: 1.03 }}
                            onClick={() => { setCategory('playmats'); setMode('buy'); setCurrentPage(1); }}
                            className="flex-shrink-0 w-32 cursor-pointer rounded-lg overflow-hidden border border-white/20 bg-slate-800/50"
                          >
                            {src ? <img src={src} alt={pm.name} className="w-full aspect-video object-cover" /> : <div className="w-full aspect-video flex items-center justify-center text-2xl">🎨</div>}
                            <p className="text-[10px] text-white truncate p-1">{pm.name}</p>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {featuredSleeves.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">🎭 Skins de cartas</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {featuredSleeves.map((sl) => {
                        const src = sl.image ? (sl.image.startsWith('http') ? sl.image : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${sl.image}`) : '';
                        return (
                          <motion.div
                            key={sl.id}
                            whileHover={{ scale: 1.03 }}
                            onClick={() => { setCategory('sleeves'); setMode('buy'); setCurrentPage(1); }}
                            className="flex-shrink-0 w-20 cursor-pointer rounded-lg overflow-hidden border border-white/20 bg-slate-800/50"
                          >
                            {src ? <img src={src} alt={sl.name} className="w-full aspect-[2/3] object-cover" /> : <div className="w-full aspect-[2/3] flex items-center justify-center text-xl">🎭</div>}
                            <p className="text-[10px] text-white truncate p-1">{sl.name}</p>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {featuredTalismans.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">✨ Talismãs</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {featuredTalismans.map((t) => {
                        const src = t.image ? (t.image.startsWith('http') ? t.image : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${t.image}`) : '';
                        return (
                          <motion.div
                            key={t.id}
                            whileHover={{ scale: 1.03 }}
                            onClick={() => { setCategory('talismans'); setMode('buy'); setCurrentPage(1); }}
                            className="flex-shrink-0 w-24 cursor-pointer rounded-lg overflow-hidden border border-amber-500/30 bg-slate-800/50"
                          >
                            {src ? <img src={src} alt={t.name} className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square flex items-center justify-center text-2xl">✨</div>}
                            <p className="text-[10px] text-white truncate p-1">{t.name}</p>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {featuredCardsMarquee.length === 0 && featuredPlaymats.length === 0 && featuredSleeves.length === 0 && featuredTalismans.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">Carregando itens em destaque...</p>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <>
        {/* Barra de pesquisa (cartas – Comprar e Vender) */}
        {category === 'cards' && (
          <div className="mb-6">
            <input
              type="text"
              placeholder="🔍 Pesquisar..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30 transition-all"
            />
          </div>
        )}

        {/* Filtros (cartas – Comprar e Vender; contagens por modo) */}
        {category === 'cards' && (
          <div className="rounded-xl p-4 mb-6 relative z-30">
            <div className="flex flex-wrap gap-4">
              {/* Ordenar por */}
              <div className="relative z-[100]" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
                  className="px-4 py-2 hover:bg-white/10 border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                >
                  <span>Ordenar: {sortBy === 'name' ? 'Nome' : sortBy === 'priceAsc' ? 'Preço ↑' : 'Preço ↓'}</span>
                  <svg className={`w-4 h-4 transition-transform ${openDropdown === 'sort' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'sort' && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-black/80 border border-white/20 rounded-lg shadow-2xl z-[100]">
                    <div className="py-2">
                      <button
                        onClick={() => {
                          setSortBy('name');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-white/10 transition-colors ${
                          sortBy === 'name' ? 'bg-purple-600/50 text-purple-300' : 'text-white'
                        }`}
                      >
                        Nome
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('priceAsc');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-white/10 transition-colors ${
                          sortBy === 'priceAsc' ? 'bg-purple-600/50 text-purple-300' : 'text-white'
                        }`}
                      >
                        Preço: Menor → Maior
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('priceDesc');
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-white/10 transition-colors ${
                          sortBy === 'priceDesc' ? 'bg-purple-600/50 text-purple-300' : 'text-white'
                        }`}
                      >
                        Preço: Maior → Menor
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
                  <div className="absolute top-full left-0 mt-2 w-64 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-300 mb-1">Preço Mínimo</label>
                        <input
                          type="number"
                          placeholder="Min"
                          value={priceMin}
                          onChange={(e) => setPriceMin(e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300 mb-1">Preço Máximo</label>
                        <input
                          type="number"
                          placeholder="Max"
                          value={priceMax}
                          onChange={(e) => setPriceMax(e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-sm focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                      {(priceMin || priceMax) && (
                        <button
                          onClick={() => {
                            setPriceMin('');
                            setPriceMax('');
                          }}
                          className="w-full px-3 py-1 bg-purple-600/80 hover:bg-purple-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
                        >
                          Limpar
                        </button>
                      )}
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
                  <div className="absolute top-full left-0 mt-2 w-48 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="space-y-2">
                      {(['Monster', 'Spell', 'Trap'] as CardTypeFilter[]).map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={typeFilters.includes(type)}
                            onChange={() => toggleTypeFilter(type)}
                            className="w-4 h-4 text-purple-600 bg-white/10 border-white/20 rounded focus:ring-purple-500"
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
                  <div className="absolute top-full left-0 mt-2 w-64 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="grid grid-cols-2 gap-2">
                      {attributes.map(attr => (
                        <label key={attr} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={attributeFilters.includes(attr)}
                            onChange={() => toggleAttributeFilter(attr)}
                            className="w-4 h-4 text-purple-600 bg-white/10 border-white/20 rounded focus:ring-purple-500"
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
                        className="w-full mt-3 px-3 py-1 bg-purple-600/80 hover:bg-purple-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
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
                  <div className="absolute top-full left-0 mt-2 w-52 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-[100] p-4">
                    <div className="space-y-2">
                      {MONSTER_TYPES.map(mt => (
                        <label key={mt} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={monsterTypeFilters.includes(mt)}
                            onChange={() => toggleMonsterTypeFilter(mt)}
                            className="w-4 h-4 text-purple-600 bg-white/10 border-white/20 rounded focus:ring-purple-500"
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
                        className="w-full mt-3 px-3 py-1 bg-purple-600/80 hover:bg-purple-600 rounded text-sm font-medium transition-colors backdrop-blur-sm"
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
            {loading ? (
              <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                <p className="mt-4 text-gray-200">Carregando...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 bg-red-900/30 backdrop-blur-md border border-red-500/50 rounded-xl shadow-xl">
                <p className="text-red-300">{error}</p>
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                <p className="text-gray-200 text-lg">Nenhum item encontrado</p>
              </div>
            ) : (
              <div className="bg-transparent p-4 mb-6">
                <div className={category === 'playmats' || category === 'talismans'
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center"
                  : "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3"
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
                          className="flex flex-col bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-xl p-2 border border-white/10 hover:border-purple-500/50 shadow-lg hover:shadow-2xl transition-all"
                        >
                          <div 
                            className="relative w-full aspect-[2/3] mb-2 cursor-pointer rounded-lg overflow-hidden"
                            onClick={() => setSelectedCard(card)}
                          >
                            <CardImage
                              card={card}
                              className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-xl transition-all"
                              fallback="/images/fundoCarta.webp"
                            />
                            {card.promotionDiscountPercent ? (
                              <div
                                className="absolute top-1 right-1 flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md bg-rose-500/95 text-white text-xs font-bold shadow-lg border border-rose-300/50"
                                title={card.promotionLabel || `${card.promotionDiscountPercent}% off`}
                              >
                                -{card.promotionDiscountPercent}%
                              </div>
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity rounded-lg"></div>
                          </div>
                          <div className="space-y-2 flex-1">
                            <h3 
                              className="text-xs font-bold text-white line-clamp-2 min-h-[2rem] cursor-pointer hover:text-purple-300 transition-colors" 
                              title={card.name}
                              onClick={() => setSelectedCard(card)}
                            >
                              {card.name}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              {(card.effectivePriceCredits ?? card.priceCredits) ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurchaseClick(card, 'credits');
                                  }}
                                  className="flex items-center gap-1 bg-gradient-to-r from-yellow-500/90 to-yellow-600/90 hover:from-yellow-500 hover:to-yellow-600 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white transition-all shadow-md hover:shadow-lg"
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
                                  className="flex items-center gap-1 bg-gradient-to-r from-emerald-500/90 to-emerald-600/90 hover:from-emerald-500 hover:to-emerald-600 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white transition-all shadow-md hover:shadow-lg"
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
                          className="flex flex-col bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-blue-400/50 shadow-xl hover:shadow-2xl transition-all w-full max-w-md mx-auto"
                        >
                          <div className="relative w-full aspect-[21/9] mb-4 bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-purple-500/30 rounded-xl overflow-hidden border border-blue-300/40 shadow-[0_0_25px_rgba(59,130,246,0.5)]">
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
                              <div className="w-full h-full flex items-center justify-center text-5xl text-blue-200/80">
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
                                  className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded text-xs font-bold transition-all shadow-lg hover:shadow-blue-500/60 text-white"
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
                          className="flex flex-col bg-gradient-to-br from-amber-900/40 to-yellow-900/40 backdrop-blur-sm rounded-xl p-5 border border-amber-500/30 hover:border-amber-400/50 shadow-xl hover:shadow-2xl transition-all w-full max-w-md mx-auto"
                        >
                          <div className="relative w-full aspect-square mb-4 bg-gradient-to-br from-amber-500/30 via-yellow-500/20 to-orange-500/30 rounded-xl overflow-hidden border border-amber-400/40 flex items-center justify-center">
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={talisman.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-5xl text-amber-200/80">
                                ✨
                              </div>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-white mb-1 truncate" title={talisman.name}>
                            {talisman.name}
                          </h3>
                          {talisman.description ? (
                            <p className="text-xs text-gray-400 mb-3 line-clamp-2">{talisman.description}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-1 mb-3 text-[10px] text-amber-200/90">
                            {talisman.bonusScorePct > 0 && <span>Score +{talisman.bonusScorePct}%</span>}
                            {talisman.bonusCashPct > 0 && <span>• Cash +{talisman.bonusCashPct}%</span>}
                            {talisman.bonusArenaPointsPct > 0 && <span>• Arena +{talisman.bonusArenaPointsPct}%</span>}
                            {(talisman.initialCharges ?? 0) > 0 && <span>• ⚡ {talisman.initialCharges} cargas</span>}
                          </div>
                          <div className="flex gap-2">
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
                    } else {
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
                          className="flex flex-col bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-xl p-3 border border-white/10 hover:border-emerald-500/50 shadow-lg hover:shadow-2xl transition-all"
                        >
                          <div className="relative w-full aspect-[2/3] mb-3 rounded-lg overflow-hidden">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-green-500/40 via-emerald-500/20 to-cyan-500/30 shadow-[0_0_20px_rgba(16,185,129,0.6)]" />
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
                              ? 'bg-purple-600/80 text-white shadow-lg'
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
                  {category === 'sleeves' && ` (${currentItems.length} skins)`}
                  {category === 'talismans' && ` (${currentItems.length} talismãs)`}
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
                  <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
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
                      <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                        <p className="text-gray-200 text-lg mb-2">📦 Nenhuma carta na maleta para vender</p>
                        <p className="text-gray-400 text-sm">Só aparecem aqui as cartas que não estão em nenhum deck.</p>
                      </div>
                    );
                  }
                  if (noResults) {
                    return (
                      <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                        <p className="text-gray-200 text-lg mb-2">Nenhum resultado para os filtros</p>
                        <p className="text-gray-400 text-sm">Tente alterar pesquisa ou filtros.</p>
                      </div>
                    );
                  }
                  return (
                  <>
                  <div className="bg-transparent p-4 mb-6">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
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
                            className="flex flex-col bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-xl p-2 border border-white/10 hover:border-green-500/50 shadow-lg hover:shadow-2xl transition-all"
                          >
                            <div className="relative w-full aspect-[2/3] mb-2 rounded-lg overflow-hidden">
                              <CardImage
                                card={card}
                                className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-xl transition-all"
                                fallback="/images/fundoCarta.webp"
                              />
                              {(() => {
                                const sellableQty = (userCard as any).sellableQuantity ?? userCard.quantity;
                                if (sellableQty < 1) return null;
                                return (
                                  <div className="absolute top-2 right-2 bg-green-500/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-white shadow-lg border border-white/20">
                                    x{sellableQty}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="space-y-2 flex-1">
                              <h3 className="text-xs font-bold text-white line-clamp-2 min-h-[2rem]" title={card.name}>
                                {card.name}
                              </h3>
                              {card.type === 'Monster' && (
                                <div className="flex gap-1 flex-wrap">
                                  <div className="bg-red-500/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px]">
                                    <span className="text-white font-bold">ATK {card.atk || 0}</span>
                                  </div>
                                  <div className="bg-blue-500/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px]">
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
                                    className="w-full mt-2 px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSelling ? '⏳ Vendendo...' : sellableQty <= 0 ? '🔒 Em deck' : '💰 Vender'}
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
              <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                <p className="text-gray-200 text-lg">Venda de {category === 'playmats' ? 'playmats' : 'sleeves'} em breve!</p>
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
            className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`bg-gradient-to-br backdrop-blur-xl ${
                selectedCard.rarity === 'Common' ? 'from-gray-600/80 to-gray-700/80' :
                selectedCard.rarity === 'Rare' ? 'from-blue-600/80 to-blue-700/80' :
                selectedCard.rarity === 'Super Rare' ? 'from-purple-600/80 to-purple-700/80' :
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
                  card={selectedCard}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '140px' }}
                  fallback="/images/fundoCarta.webp"
                />
                {selectedCard.promotionDiscountPercent ? (
                  <div
                    className="absolute top-2 right-2 min-w-[36px] h-9 px-2 rounded-lg bg-rose-500/95 text-white text-sm font-bold shadow-lg border border-rose-300/50 flex items-center justify-center"
                    title={selectedCard.promotionLabel || `${selectedCard.promotionDiscountPercent}% off`}
                  >
                    -{selectedCard.promotionDiscountPercent}%
                  </div>
                ) : null}
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">{selectedCard.name}</h3>
              <p className="text-white/80 mb-4">{selectedCard.description || 'Sem descrição'}</p>
              
              {selectedCard.type === 'Monster' && (
                <div className="space-y-2 mb-4">
                  <div className="flex gap-2">
                    <div className="bg-red-500/80 px-3 py-1 rounded">
                      <span className="text-white font-bold">ATK: {selectedCard.atk || 0}</span>
                    </div>
                    <div className="bg-blue-500/80 px-3 py-1 rounded">
                      <span className="text-white font-bold">DEF: {selectedCard.def || 0}</span>
                    </div>
                    {selectedCard.level && (
                      <div className="bg-purple-500/80 px-3 py-1 rounded">
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
            className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4"
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
              <h2 className="text-2xl font-bold text-white mb-4">Confirmar Compra</h2>
              <div className="mb-4">
                <p className="text-white/80 mb-2">
                  <span className="font-semibold">Item:</span> {purchaseItem.item.name}
                </p>
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
                    ? ((purchaseItem.item.effectivePriceCredits ?? purchaseItem.item.priceCredits) || 0) * (category === 'cards' ? purchaseQuantity : 1)
                    : Math.floor((Number(purchaseItem.item.effectivePriceCash ?? purchaseItem.item.priceCash) || 0) * (category === 'cards' ? purchaseQuantity : 1))}{' '}
                  {purchaseItem.method === 'credits' ? 'Créditos' : 'Cash'}
                  {category === 'cards' && purchaseQuantity > 1 && (
                    <span className="text-white/60 text-sm ml-1">
                      ({purchaseQuantity} × {purchaseItem.method === 'credits' ? (purchaseItem.item.effectivePriceCredits ?? purchaseItem.item.priceCredits) : Math.floor(Number(purchaseItem.item.effectivePriceCash ?? purchaseItem.item.priceCash))})
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
                  Cancelar
                </button>
                <button
                  onClick={handlePurchaseConfirm}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-bold transition-all"
                >
                  Confirmar
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
            className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setSellModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-gradient-to-br from-slate-800/70 to-slate-900/70 backdrop-blur-xl rounded-xl p-6 max-w-md w-full border-2 border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4">Vender carta</h2>
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
                  Cancelar
                </button>
                <button
                  onClick={handleSellConfirm}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-bold transition-all"
                >
                  Vender
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
