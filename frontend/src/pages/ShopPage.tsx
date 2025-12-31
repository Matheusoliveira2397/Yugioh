import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';
import CardImage from '../components/CardImage';
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
type ShopCategory = 'cards' | 'playmats' | 'sleeves';

export default function ShopPage() {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [category, setCategory] = useState<ShopCategory>('cards');
  const [cards, setCards] = useState<Card[]>([]);
  const [playmats, setPlaymats] = useState<Playmat[]>([]);
  const [sleeves, setSleeves] = useState<Sleeve[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellingCardId, setSellingCardId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showPurchaseConfirm, setShowPurchaseConfirm] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<{ item: Card | Playmat | Sleeve; method: 'credits' | 'cash' } | null>(null);
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
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  // Estado dos dropdowns
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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
        
        if (!Array.isArray(response.data)) {
          throw new Error('Resposta da API não é um array');
        }
        
        const cardsWithExtras = response.data.map((card: any) => ({
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

    if (mode === 'buy' && category === 'cards') {
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
        
        if (!Array.isArray(response.data)) {
          throw new Error('Resposta da API não é um array');
        }
        
        if (!cancelled) {
          setInventory(response.data);
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

    if (category === 'playmats' && mode === 'buy') {
      fetchPlaymats();
    } else if (category === 'sleeves' && mode === 'buy') {
      fetchSleeves();
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
  }, [cards, searchTerm, sortBy, priceMin, priceMax, typeFilters, attributeFilters]);

  // Paginação
  const getCurrentItems = () => {
    if (category === 'cards') {
      return filteredAndSortedCards;
    } else if (category === 'playmats') {
      return playmats;
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

  // Função para vender carta
  const handleSell = async (userCard: any) => {
    if (!userCard?.card?.id) {
      alert('Erro: Carta inválida');
      return;
    }

    if (sellingCardId === userCard.card.id) {
      return; // Já está processando
    }

    const confirmMessage = `Deseja vender ${userCard.quantity > 1 ? `1 cópia de ` : ''}"${userCard.card.name}"?\n\nVocê receberá:\n💰 ${Math.floor((userCard.card.priceCredits || 0) / 2)} créditos\n💵 ${Math.floor((userCard.card.priceCash || 0) / 2)} cash`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setSellingCardId(userCard.card.id);

    try {
      const response = await api.post('/shop/sell', {
        cardId: userCard.card.id,
        quantity: 1,
      });

      alert(`✅ ${response.data.message}\n💰 Créditos: +${response.data.creditsGained || 0}\n💵 Cash: +${response.data.cashGained || 0}`);

      // Recarregar inventário
      const inventoryResponse = await api.get('/shop/inventory');
      setInventory(inventoryResponse.data);

      // Atualizar saldo do usuário
      const userResponse = await api.get('/auth/profile');
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

  const handlePurchaseClick = (
    item: Card | Playmat | Sleeve,
    paymentMethod: 'credits' | 'cash'
  ) => {
    if (!user) {
      alert('Você precisa estar logado para comprar!');
      return;
    }

    const priceCredits = item.priceCredits || 0;
    const priceCash = item.priceCash || 0;
    const price = paymentMethod === 'credits' ? priceCredits : priceCash;

    if (price <= 0) {
      alert(`Esta opção de pagamento não está disponível para este item.`);
      return;
    }

    setPurchaseItem({ item, method: paymentMethod });
    setShowPurchaseConfirm(true);
  };

  const handlePurchaseConfirm = async () => {
    if (!purchaseItem || !user) return;

    const { item, method: paymentMethod } = purchaseItem;
    const priceCredits = item.priceCredits || 0;
    const priceCash = item.priceCash || 0;
    const price = paymentMethod === 'credits' ? priceCredits : priceCash;

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
            } insuficientes! Você tem ${current} mas precisa de ${price}`
          );
          setPurchaseItem(null);
          return;
        }

        const response = await api.post('/shop/purchase', {
          cardId: item.id,
          paymentMethod,
        });

        const updatedUser = {
          ...user,
          credits: response.data.remainingBalance.credits,
          cash: response.data.remainingBalance.cash,
        };
        
        useAuthStore.getState().setUser(updatedUser);
        alert(
          `✅ Compra realizada com sucesso!\n\n🎴 ${
            item.name
          } foi adicionada ao seu inventário!\n${
            paymentMethod === 'credits' ? '💰' : '💵'
          } ${price} ${
            paymentMethod === 'credits' ? 'Créditos' : 'Cash'
          } foram descontados.`
        );
      } else if (category === 'playmats') {
        addPlaymat({
          id: (item as Playmat).id,
          name: item.name,
          image: (item as Playmat).image,
        });

        alert(
          '✅ Playmat adquirido e adicionado ao seu inventário de cosméticos!'
        );
      } else if (category === 'sleeves') {
        addSkin({
          id: (item as Sleeve).id,
          name: item.name,
          image: (item as Sleeve).image,
        });

        alert(
          '✅ Skin de carta adquirida e adicionada ao seu inventário de cosméticos!'
        );
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

  return (
    <div className="min-h-screen text-white py-6">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">
            🛒 Loja
          </h1>
          <p className="text-sm text-gray-300">Compre cartas, playmats e skins de cartas para personalizar seu deck</p>
        </motion.div>

        {/* Tabs para Comprar/Vender */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('buy')}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-xl border-2 ${
              mode === 'buy'
                ? 'bg-gradient-to-r from-blue-600/80 to-blue-700/80 text-white border-blue-500/50 shadow-lg shadow-blue-500/30'
                : 'text-gray-300 hover:bg-white/10 border-white/20'
            }`}
          >
            🛒 Comprar
          </button>
          <button
            onClick={() => setMode('sell')}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-xl border-2 ${
              mode === 'sell'
                ? 'bg-gradient-to-r from-green-600/80 to-green-700/80 text-white border-green-500/50 shadow-lg shadow-green-500/30'
                : 'text-gray-300 hover:bg-white/10 border-white/20'
            }`}
          >
            💰 Vender
          </button>
        </div>

        {mode === 'buy' ? (
          // MODO COMPRAR
          <>
            {/* Seção: Novos Itens Adicionados */}
            {newItems.length > 0 && category === 'cards' && (
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
                <div className="rounded-2xl p-6">
                  <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {newItems.map((card, index) => (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.05, zIndex: 10 }}
                        className="flex-shrink-0 w-20"
                      >
                        <div 
                          className="relative aspect-[2/3] mb-1.5 cursor-pointer" 
                          onClick={() => setSelectedCard(card)}
                        >
                          <CardImage
                            card={card}
                            className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-2xl transition-all"
                            fallback="/images/fundoCarta.webp"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <h3 
                            className="text-[9px] font-bold text-white truncate cursor-pointer hover:text-purple-300 transition-colors"
                            onClick={() => setSelectedCard(card)}
                            title={card.name}
                          >
                            {card.name}
                          </h3>
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {card.priceCredits ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchaseClick(card, 'credits');
                                }}
                                className="flex items-center gap-0.5 bg-yellow-500/80 hover:bg-yellow-500 backdrop-blur-sm px-1 py-0.5 rounded text-[8px] font-bold text-white transition-all"
                              >
                                💰 {card.priceCredits}
                              </button>
                            ) : null}
                            {card.priceCash ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchaseClick(card, 'cash');
                                }}
                                className="flex items-center gap-0.5 bg-emerald-500/80 hover:bg-emerald-500 backdrop-blur-sm px-1 py-0.5 rounded text-[8px] font-bold text-white transition-all"
                              >
                                💵 {card.priceCash}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Abas de Categorias */}
            <div className="mb-6">
              <div className="flex gap-3 rounded-xl p-2">
                <button
                  onClick={() => setCategory('cards')}
                  className={`flex-1 px-6 py-3 text-sm font-bold transition-all rounded-lg ${
                    category === 'cards'
                      ? 'bg-gradient-to-r from-purple-600/80 to-pink-600/80 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  🎴 Cartas
                </button>
                <button
                  onClick={() => setCategory('playmats')}
                  className={`flex-1 px-6 py-3 text-sm font-bold transition-all rounded-lg ${
                    category === 'playmats'
                      ? 'bg-gradient-to-r from-blue-600/80 to-cyan-600/80 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  🎨 Playmats
                </button>
                <button
                  onClick={() => setCategory('sleeves')}
                  className={`flex-1 px-6 py-3 text-sm font-bold transition-all rounded-lg ${
                    category === 'sleeves'
                      ? 'bg-gradient-to-r from-green-600/80 to-emerald-600/80 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  🎭 Skins de cartas
                </button>
              </div>
            </div>

            {/* Barra de pesquisa */}
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
                  className="w-full px-4 py-3 border border-white/20 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30 transition-all"
                />
              </div>
            )}

            {/* Filtros (apenas para cartas) */}
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
                              <span className="text-sm text-white">{attr}</span>
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
                </div>
              </div>
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
                <div className={category === 'playmats' 
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
                              {card.priceCredits ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurchaseClick(card, 'credits');
                                  }}
                                  className="flex items-center gap-1 bg-gradient-to-r from-yellow-500/90 to-yellow-600/90 hover:from-yellow-500 hover:to-yellow-600 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white transition-all shadow-md hover:shadow-lg"
                                >
                                  💰 {card.priceCredits}
                                </button>
                              ) : null}
                              {card.priceCash ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurchaseClick(card, 'cash');
                                  }}
                                  className="flex items-center gap-1 bg-gradient-to-r from-emerald-500/90 to-emerald-600/90 hover:from-emerald-500 hover:to-emerald-600 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white transition-all shadow-md hover:shadow-lg"
                                >
                                  💵 {card.priceCash}
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
                                    {playmat.priceCash}
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
                                  💵 {playmat.priceCash}
                                </button>
                              ) : null}
                            </div>
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
                                  💵 {sleeve.priceCash}
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
            {totalPages > 1 && mode === 'buy' && (
              <div className="flex items-center justify-center gap-2">
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
                ) : inventory.length === 0 ? (
                  <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                    <p className="text-gray-200 text-lg mb-2">📦 Seu inventário está vazio</p>
                    <p className="text-gray-400 text-sm">Compre cartas na loja para começar a colecionar!</p>
                  </div>
                ) : (
                  <div className="bg-transparent p-4 mb-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {inventory.map((userCard: any, index: number) => {
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
                            className="flex flex-col bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-xl p-3 border border-white/10 hover:border-green-500/50 shadow-lg hover:shadow-2xl transition-all"
                          >
                            <div className="relative w-full aspect-[2/3] mb-3 rounded-lg overflow-hidden">
                              <CardImage
                                card={card}
                                className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-xl transition-all"
                                fallback="/images/fundoCarta.webp"
                              />
                              {userCard.quantity > 1 && (
                                <div className="absolute top-2 right-2 bg-green-500/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-white shadow-lg border border-white/20">
                                  x{userCard.quantity}
                                </div>
                              )}
                            </div>
                            <div className="space-y-2 flex-1">
                              <h3 className="text-sm font-bold text-white line-clamp-2 min-h-[2.5rem]" title={card.name}>
                                {card.name}
                              </h3>
                              {card.type === 'Monster' && (
                                <div className="flex gap-1 flex-wrap">
                                  <div className="bg-red-500/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs">
                                    <span className="text-white font-bold">ATK {card.atk || 0}</span>
                                  </div>
                                  <div className="bg-blue-500/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs">
                                    <span className="text-white font-bold">DEF {card.def || 0}</span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                {sellPriceCredits > 0 && (
                                  <div className="flex items-center gap-1 bg-yellow-500/80 backdrop-blur-sm px-2 py-1 rounded-lg">
                                    <span className="text-white text-xs">💰</span>
                                    <span className="text-xs font-bold text-white">{sellPriceCredits}</span>
                                  </div>
                                )}
                                {sellPriceCash > 0 && (
                                  <div className="flex items-center gap-1 bg-green-500/80 backdrop-blur-sm px-2 py-1 rounded-lg">
                                    <span className="text-white text-xs">💵</span>
                                    <span className="text-xs font-bold text-white">{sellPriceCash}</span>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleSell(userCard)}
                                disabled={isSelling || (sellPriceCredits === 0 && sellPriceCash === 0)}
                                className="w-full mt-2 px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSelling ? '⏳ Vendendo...' : '💰 Vender'}
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 bg-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-xl">
                <p className="text-gray-200 text-lg">Venda de {category === 'playmats' ? 'playmats' : 'sleeves'} em breve!</p>
              </div>
            )}
          </div>
        )}

        {/* Modal de Informações da Carta */}
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`bg-gradient-to-br ${
                selectedCard.rarity === 'Common' ? 'from-gray-600 to-gray-700' :
                selectedCard.rarity === 'Rare' ? 'from-blue-600 to-blue-700' :
                selectedCard.rarity === 'Super Rare' ? 'from-purple-600 to-purple-700' :
                selectedCard.rarity === 'Ultra Rare' ? 'from-yellow-600 to-yellow-700' :
                selectedCard.rarity === 'Secret Rare' ? 'from-yellow-400 to-orange-500' :
                'from-gray-600 to-gray-700'
              } rounded-xl p-6 max-w-md w-full border-2 border-white/20`}
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
              
              <div className="w-full mb-4" style={{ maxHeight: '400px' }}>
                <CardImage
                  card={selectedCard}
                  className="w-full h-auto rounded-lg"
                  fallback="/images/fundoCarta.webp"
                />
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
              
              <div className="flex gap-2 pt-4 border-t border-white/20">
                {selectedCard.priceCredits ? (
                  <button
                    onClick={() => {
                      setSelectedCard(null);
                      handlePurchaseClick(selectedCard, 'credits');
                    }}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 rounded-lg text-white font-bold transition-all"
                  >
                    💰 {selectedCard.priceCredits} Créditos
                  </button>
                ) : null}
                {selectedCard.priceCash ? (
                  <button
                    onClick={() => {
                      setSelectedCard(null);
                      handlePurchaseClick(selectedCard, 'cash');
                    }}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-lg text-white font-bold transition-all"
                  >
                    💵 {selectedCard.priceCash} Cash
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
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowPurchaseConfirm(false);
              setPurchaseItem(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 max-w-md w-full border-2 border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4">Confirmar Compra</h2>
              <div className="mb-4">
                <p className="text-white/80 mb-2">
                  <span className="font-semibold">Item:</span> {purchaseItem.item.name}
                </p>
                <p className="text-white/80 mb-2">
                  <span className="font-semibold">Preço:</span>{' '}
                  {purchaseItem.method === 'credits' ? '💰' : '💵'}{' '}
                  {purchaseItem.method === 'credits' 
                    ? purchaseItem.item.priceCredits 
                    : purchaseItem.item.priceCash}{' '}
                  {purchaseItem.method === 'credits' ? 'Créditos' : 'Cash'}
                </p>
                {user && (
                  <p className="text-white/80">
                    <span className="font-semibold">Seu saldo:</span>{' '}
                    {purchaseItem.method === 'credits' 
                      ? `💰 ${user.credits || 0} Créditos`
                      : `💵 ${user.cash || 0} Cash`}
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
      </div>
    </div>
  );
}
