import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';
import CardImage from '../components/CardImage';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [typeFilters, setTypeFilters] = useState<CardTypeFilter[]>(['Monster', 'Spell', 'Trap']);
  const [attributeFilters, setAttributeFilters] = useState<string[]>([]);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

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

  // Mock data para playmats e sleeves (até implementar backend)
  useEffect(() => {
    if (category === 'playmats') {
      setPlaymats([
        { id: '1', name: 'Playmat Clássico', image: '/images/playmat1.jpg', priceCredits: 500, priceCash: 50, stock: 100 },
        { id: '2', name: 'Playmat Épico', image: '/images/playmat2.jpg', priceCredits: 1000, priceCash: 100, stock: 50 },
        { id: '3', name: 'Playmat Lendário', image: '/images/playmat3.jpg', priceCredits: 2500, priceCash: 250, stock: 25 },
      ]);
    } else if (category === 'sleeves') {
      setSleeves([
        { id: '1', name: 'Sleeve Básico', image: '/images/sleeve1.jpg', priceCredits: 200, priceCash: 20, stock: 200 },
        { id: '2', name: 'Sleeve Premium', image: '/images/sleeve2.jpg', priceCredits: 500, priceCash: 50, stock: 100 },
        { id: '3', name: 'Sleeve Exclusivo', image: '/images/sleeve3.jpg', priceCredits: 1500, priceCash: 150, stock: 50 },
      ]);
    }
  }, [category]);

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

  const toggleAttributeFilter = (attr: string) => {
    setAttributeFilters(prev =>
      prev.includes(attr)
        ? prev.filter(a => a !== attr)
        : [...prev, attr]
    );
  };

  const handlePurchase = async (item: Card | Playmat | Sleeve) => {
    if (!user) {
      alert('Você precisa estar logado para comprar!');
      return;
    }

    const price = item.priceCredits || 0;
    if ((user.credits || 0) < price) {
      alert(`Créditos insuficientes! Você tem ${user.credits || 0} mas precisa de ${price}`);
      return;
    }

    if (!confirm(`Confirmar compra?\n\n${'name' in item ? item.name : 'Item'}\n💰 ${price} Créditos`)) {
      return;
    }

    try {
      setLoading(true);
      if (category === 'cards') {
        const response = await api.post('/shop/purchase', {
          cardId: item.id,
          paymentMethod: 'credits',
        });

        const updatedUser = {
          ...user,
          credits: response.data.remainingBalance.credits,
          cash: response.data.remainingBalance.cash,
        };
        
        useAuthStore.getState().setUser(updatedUser);
        alert(`✅ Compra realizada com sucesso!\n\n🎴 ${item.name} foi adicionada ao seu inventário!`);
      } else {
        // TODO: Implementar compra de playmats e sleeves
        alert('Funcionalidade em desenvolvimento!');
      }
    } catch (error: any) {
      alert(`❌ Erro: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const attributes = ['LIGHT', 'DARK', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE'];

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
    <div className="min-h-screen text-white py-6 bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
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
          <p className="text-sm text-gray-300">Compre cartas, playmats e sleeves para personalizar seu deck</p>
        </motion.div>

        {/* Tabs para Comprar/Vender */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('buy')}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-xl backdrop-blur-sm border-2 ${
              mode === 'buy'
                ? 'bg-gradient-to-r from-blue-600/80 to-blue-700/80 text-white border-blue-500/50 shadow-lg shadow-blue-500/30'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border-white/20'
            }`}
          >
            🛒 Comprar
          </button>
          <button
            onClick={() => setMode('sell')}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-xl backdrop-blur-sm border-2 ${
              mode === 'sell'
                ? 'bg-gradient-to-r from-green-600/80 to-green-700/80 text-white border-green-500/50 shadow-lg shadow-green-500/30'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border-white/20'
            }`}
          >
            💰 Vender
          </button>
        </div>

        {mode === 'buy' ? (
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
                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-2xl">
                  <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {newItems.map((card, index) => (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.05, zIndex: 10 }}
                        className="flex-shrink-0 w-32"
                      >
                        <div className="relative aspect-[2/3] mb-2 group cursor-pointer" onClick={() => handlePurchase(card)}>
                          <CardImage
                            card={card}
                            className="w-full h-full object-cover rounded-xl shadow-lg group-hover:shadow-2xl transition-all"
                            fallback="/images/fundoCarta.webp"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-2 left-2 right-2">
                              <div className="text-xs font-bold text-white mb-1 truncate">{card.name}</div>
                              <div className="flex items-center gap-1 bg-yellow-500/90 backdrop-blur-sm px-2 py-1 rounded">
                                <span className="text-white text-xs">💰</span>
                                <span className="text-xs font-bold text-white">{card.priceCredits || 0}</span>
                              </div>
                            </div>
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
              <div className="flex gap-3 bg-white/5 backdrop-blur-md rounded-xl p-2 border border-white/10">
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
                  🎭 Sleeves
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
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30 transition-all shadow-lg"
                />
              </div>
            )}

            {/* Filtros (apenas para cartas) */}
            {category === 'cards' && (
              <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 mb-6 border border-white/10 shadow-xl">
                <div className="flex flex-wrap gap-4">
                  {/* Ordenar por */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all shadow-md"
                    >
                      <span>Ordenar: {sortBy === 'name' ? 'Nome' : sortBy === 'priceAsc' ? 'Preço ↑' : 'Preço ↓'}</span>
                      <svg className={`w-4 h-4 transition-transform ${openDropdown === 'sort' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'sort' && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-20">
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
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setOpenDropdown(openDropdown === 'price' ? null : 'price')}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all shadow-md"
                    >
                      <span>Preço {(priceMin || priceMax) ? `(${priceMin || '0'} - ${priceMax || '∞'})` : ''}</span>
                      <svg className={`w-4 h-4 transition-transform ${openDropdown === 'price' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'price' && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-20 p-4">
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
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all shadow-md"
                    >
                      <span>Tipo ({typeFilters.length})</span>
                      <svg className={`w-4 h-4 transition-transform ${openDropdown === 'type' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'type' && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-20 p-4">
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
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setOpenDropdown(openDropdown === 'attribute' ? null : 'attribute')}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg text-white font-medium flex items-center gap-2 transition-all shadow-md"
                    >
                      <span>Atributo ({attributeFilters.length})</span>
                      <svg className={`w-4 h-4 transition-transform ${openDropdown === 'attribute' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'attribute' && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-20 p-4">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                          className="flex flex-col"
                        >
                          <div className="relative w-full aspect-[2/3] mb-3">
                            <CardImage
                              card={card}
                              className="w-full h-full object-cover rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer"
                              fallback="/images/fundoCarta.webp"
                              onClick={() => handlePurchase(card)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <h3 className="text-xs font-bold text-white truncate" title={card.name}>
                              {card.name}
                            </h3>
                            {card.type === 'Monster' && (
                              <div className="flex gap-1 flex-wrap">
                                <div className="bg-red-500/80 backdrop-blur-sm px-2 py-1 rounded text-[10px]">
                                  <span className="text-white font-bold">ATK {card.atk || 0}</span>
                                </div>
                                <div className="bg-blue-500/80 backdrop-blur-sm px-2 py-1 rounded text-[10px]">
                                  <span className="text-white font-bold">DEF {card.def || 0}</span>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1 bg-yellow-500/80 backdrop-blur-sm px-2 py-1 rounded flex-1">
                                <span className="text-white text-xs">💰</span>
                                <span className="text-xs font-bold text-white">{card.priceCredits || 0}</span>
                              </div>
                              <div className="flex items-center gap-1 bg-green-500/80 backdrop-blur-sm px-2 py-1 rounded">
                                <span className="text-white text-xs">📦</span>
                                <span className="text-xs font-bold text-white">{card.stock || 0}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handlePurchase(card)}
                              className="w-full mt-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded text-xs font-bold transition-all shadow-md hover:shadow-lg text-white"
                            >
                              🛒 Comprar
                            </button>
                          </div>
                        </motion.div>
                      );
                    } else if (category === 'playmats') {
                      const playmat = item as Playmat;
                      return (
                        <motion.div
                          key={playmat.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          className="flex flex-col bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10"
                        >
                          <div className="relative w-full aspect-video mb-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center">
                            <span className="text-4xl">🎨</span>
                          </div>
                          <h3 className="text-sm font-bold text-white mb-2 truncate">{playmat.name}</h3>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1 bg-yellow-500/80 backdrop-blur-sm px-2 py-1 rounded">
                              <span className="text-white text-xs">💰</span>
                              <span className="text-xs font-bold text-white">{playmat.priceCredits}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handlePurchase(playmat)}
                            className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded text-xs font-bold transition-all shadow-md hover:shadow-lg text-white"
                          >
                            🛒 Comprar
                          </button>
                        </motion.div>
                      );
                    } else {
                      const sleeve = item as Sleeve;
                      return (
                        <motion.div
                          key={sleeve.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          className="flex flex-col bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10"
                        >
                          <div className="relative w-full aspect-[2/3] mb-3 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg flex items-center justify-center">
                            <span className="text-4xl">🎭</span>
                          </div>
                          <h3 className="text-sm font-bold text-white mb-2 truncate">{sleeve.name}</h3>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1 bg-yellow-500/80 backdrop-blur-sm px-2 py-1 rounded">
                              <span className="text-white text-xs">💰</span>
                              <span className="text-xs font-bold text-white">{sleeve.priceCredits}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handlePurchase(sleeve)}
                            className="w-full px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded text-xs font-bold transition-all shadow-md hover:shadow-lg text-white"
                          >
                            🛒 Comprar
                          </button>
                        </motion.div>
                      );
                    }
                  })}
                </div>
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
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
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-12 border border-white/20 shadow-xl text-center">
            <div className="text-6xl mb-4">💰</div>
            <h2 className="text-2xl font-bold text-white mb-2">Vender Itens</h2>
            <p className="text-gray-300 mb-6">Funcionalidade de venda em desenvolvimento</p>
            <p className="text-sm text-gray-400">Em breve você poderá vender seus itens na loja!</p>
          </div>
        )}
      </div>
    </div>
  );
}
