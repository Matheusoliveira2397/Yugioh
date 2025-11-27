import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/axios';
import CardImage from '../components/CardImage';

interface Card {
  id: string;
  name: string;
  description: string;
  cardImage?: string;
  type: string;
  rarity: string;
  level?: number;
  atk?: number;
  def?: number;
  priceCoins?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
  createdAt?: string;
}

export default function ShopCardsPage() {
  const { user } = useAuthStore();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<'credits' | 'cash'>('credits');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const response = await api.get('/cards/shop/for-sale');
      setCards(response.data);
      console.log('🛒 Cartas na loja:', response.data);
    } catch (error) {
      console.error('❌ Erro ao carregar cartas:', error);
    } finally{
      setLoading(false);
    }
  };

  const handlePurchase = async (card: Card) => {
    if (!user) {
      setMessage({ type: 'error', text: 'Você precisa estar logado para comprar!' });
      return;
    }

    // Verificar se a carta tem preço para a moeda selecionada
    const price = selectedCurrency === 'credits' 
      ? card.priceCredits 
      : card.priceCash;

    if (!price || price === 0) {
      setMessage({ 
        type: 'error', 
        text: `Esta carta não pode ser comprada com ${getCurrencyName(selectedCurrency)}` 
      });
      return;
    }

    // Verificar saldo
    const userBalance = selectedCurrency === 'credits'
      ? (user.credits || 0)
      : (user.cash || 0);

    if (userBalance < price) {
      const missing = price - userBalance;
      setMessage({ 
        type: 'error', 
        text: `Saldo insuficiente! Faltam ${missing} ${getCurrencyName(selectedCurrency)}` 
      });
      return;
    }

    // Comprar carta
    try {
      setLoading(true);
      const response = await api.post('/shop/purchase', {
        cardId: card.id,
        paymentMethod: selectedCurrency,
      });

      console.log('✅ Compra realizada:', response.data);

      // Atualizar saldo do usuário no store
      const updatedUser = {
        ...user,
        credits: response.data.remainingBalance?.credits ?? user.credits,
        cash: response.data.remainingBalance?.cash ?? user.cash,
      };
      
      useAuthStore.getState().setUser(updatedUser);

      setMessage({ 
        type: 'success', 
        text: `✅ Carta "${card.name}" comprada com sucesso! A carta foi adicionada à sua maleta!` 
      });

      // Limpar mensagem após 3 segundos
      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (error: any) {
      console.error('❌ Erro na compra:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || 'Erro ao comprar carta'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurrencyName = (currency: string) => {
    const names = {
      credits: 'créditos',
      cash: 'cash'
    };
    return names[currency as keyof typeof names];
  };

  const getRarityColor = (rarity: string) => {
    const colors = {
      'Common': 'from-gray-600 to-gray-700',
      'Rare': 'from-blue-600 to-blue-700',
      'Super Rare': 'from-purple-600 to-purple-700',
      'Ultra Rare': 'from-yellow-600 to-amber-600',
      'Secret Rare': 'from-pink-600 to-rose-600',
      'Legendary': 'from-orange-600 to-red-600',
    };
    return colors[rarity as keyof typeof colors] || 'from-gray-600 to-gray-700';
  };

  const getPrice = (card: Card) => {
    return selectedCurrency === 'credits' 
      ? card.priceCredits 
      : card.priceCash;
  };

  const getUserBalance = () => {
    if (!user) return 0;
    return selectedCurrency === 'credits'
      ? (user.credits || 0)
      : (user.cash || 0);
  };

  const filteredCards = cards.filter(card => {
    const price = getPrice(card);
    return price && price > 0;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-lg p-6 mb-8 shadow-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">🛒 Loja de Cartas</h1>
              <p className="text-gray-300">Compre cartas individuais para seu deck</p>
            </div>
            <div className="text-right bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-4 rounded-lg border-2 border-purple-500/50 shadow-lg">
              <p className="text-gray-400 text-sm mb-2">💰 Seu Saldo</p>
              <div className="flex gap-4 mt-2">
                <div className="text-center bg-purple-900/30 px-4 py-2 rounded-lg border border-purple-500/30">
                  <p className="text-2xl font-bold text-purple-400">💎 {user?.credits || 0}</p>
                  <p className="text-xs text-gray-400">Créditos</p>
                </div>
                <div className="text-center bg-green-900/30 px-4 py-2 rounded-lg border border-green-500/30">
                  <p className="text-2xl font-bold text-green-400">💵 R$ {user?.cash || 0}</p>
                  <p className="text-xs text-gray-400">Cash</p>
                </div>
              </div>
            </div>
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

        {/* Seletor de Moeda */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setSelectedCurrency('credits')}
            className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all duration-300 ${
              selectedCurrency === 'credits'
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-xl shadow-purple-500/50 scale-105'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-2 border-gray-700 hover:border-purple-500/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">💎</span>
              <span>Créditos</span>
            </div>
          </button>
          <button
            onClick={() => setSelectedCurrency('cash')}
            className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all duration-300 ${
              selectedCurrency === 'cash'
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-xl shadow-green-500/50 scale-105'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-2 border-gray-700 hover:border-green-500/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">💵</span>
              <span>Cash (R$)</span>
            </div>
          </button>
        </div>

        {/* Grid de Cartas */}
        {loading ? (
          <div className="text-center py-16">
            <p className="text-2xl">⏳ Carregando cartas...</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-16 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border-2 border-gray-700">
            <p className="text-6xl mb-4">📦</p>
            <p className="text-2xl text-gray-400 mb-2">Nenhuma carta disponível</p>
            <p className="text-gray-500">
              {selectedCurrency === 'credits' && 'Nenhuma carta pode ser comprada com créditos'}
              {selectedCurrency === 'cash' && 'Nenhuma carta pode ser comprada com cash'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredCards.map((card, index) => {
              const price = getPrice(card);
              const userBalance = getUserBalance();
              const canAfford = userBalance >= (price || 0);

              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative"
                >
                  {/* Card Container com hover effect */}
                  <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 hover:border-purple-500 transition-all duration-300 hover:scale-105 hover:shadow-purple-500/50">
                    
                    {/* Card Image com overlay */}
                    <div className="relative h-72 overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-br ${getRarityColor(card.rarity)} opacity-30`}></div>
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        <CardImage
                          card={card}
                          className="h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-300"
                          fallback="linear-gradient(to bottom, #1e3a8a, #7c3aed, #dc2626)"
                        />
                      </div>
                      
                      {/* Rarity Badge */}
                      <div className={`absolute top-3 right-3 bg-gradient-to-r ${getRarityColor(card.rarity)} px-3 py-1 rounded-full border-2 border-white/30 backdrop-blur-sm`}>
                        <p className="text-xs font-bold text-white shadow-lg">{card.rarity}</p>
                      </div>

                      {/* Type Badge */}
                      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full border border-white/20">
                        <p className="text-xs font-bold text-white">
                          {card.type === 'Monster' && '👹 Monster'}
                          {card.type === 'Spell' && '✨ Spell'}
                          {card.type === 'Trap' && '🪤 Trap'}
                        </p>
                      </div>
                    </div>

                    {/* Card Info Section */}
                    <div className="p-5 bg-gradient-to-b from-gray-800 to-gray-900">
                      {/* Card Name */}
                      <h3 className="text-xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 line-clamp-1">
                        {card.name}
                      </h3>
                      
                      {/* Card Type & Level */}
                      <div className="flex items-center gap-2 mb-3">
                        {card.type === 'Monster' && card.level && (
                          <div className="flex items-center gap-1 bg-gray-700/50 px-2 py-1 rounded-md border border-yellow-500/30">
                            <span className="text-yellow-400">⭐</span>
                            <span className="text-sm font-bold text-yellow-300">Level {card.level}</span>
                          </div>
                        )}
                        <div className="flex-1"></div>
                      </div>

                      {/* Description */}
                      <p className="text-gray-400 text-xs mb-4 line-clamp-2 italic">
                        {card.description}
                      </p>

                      {/* Monster Stats */}
                      {card.type === 'Monster' && (
                        <div className="flex gap-2 mb-4">
                          <div className="flex-1 bg-gradient-to-r from-red-900/50 to-red-800/50 border border-red-500/30 rounded-lg px-3 py-2">
                            <p className="text-xs text-red-300 font-semibold">ATK</p>
                            <p className="text-lg font-bold text-red-400">{card.atk || 0}</p>
                          </div>
                          <div className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 border border-blue-500/30 rounded-lg px-3 py-2">
                            <p className="text-xs text-blue-300 font-semibold">DEF</p>
                            <p className="text-lg font-bold text-blue-400">{card.def || 0}</p>
                          </div>
                        </div>
                      )}

                      {/* Data de Criação */}
                      {card.createdAt && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            📅 Criada em: <span className="text-gray-400">{new Date(card.createdAt).toLocaleDateString('pt-BR')}</span>
                          </p>
                        </div>
                      )}

                      {/* Divider */}
                      <div className="border-t border-gray-700 mb-4"></div>

                      {/* Price Section */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Preço</p>
                          <div className="text-2xl font-bold">
                            {selectedCurrency === 'credits' && (
                              <span className="text-purple-400 flex items-center gap-1">
                                <span className="text-3xl">💎</span> {price}
                              </span>
                            )}
                            {selectedCurrency === 'cash' && (
                              <span className="text-green-400 flex items-center gap-1">
                                <span className="text-3xl">💵</span> {price?.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Stock Badge */}
                        <div className="bg-green-500/20 border border-green-500/50 px-3 py-1 rounded-full">
                          <p className="text-xs text-green-400 font-bold">✓ Em Estoque</p>
                        </div>
                      </div>

                      {/* Buy Button */}
                      <button
                        onClick={() => handlePurchase(card)}
                        disabled={!user || !canAfford || loading}
                        className={`w-full py-3 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                          user && canAfford && !loading
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-green-500/50 transform hover:-translate-y-1'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                        }`}
                      >
                        {!user ? (
                          <>🔒 Faça Login</>
                        ) : loading ? (
                          <>⏳ Processando...</>
                        ) : canAfford ? (
                          <>🛒 Comprar Agora</>
                        ) : (
                          <>💰 Saldo Insuficiente</>
                        )}
                      </button>

                      {/* Balance Warning */}
                      {user && !canAfford && (
                        <p className="text-xs text-red-400 text-center mt-2">
                          Faltam {selectedCurrency === 'credits' ? '💎' : '💵'} {((price || 0) - userBalance).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Glow effect on hover */}
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-300 -z-10"></div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-gray-800 rounded-lg p-6"
        >
          <h3 className="text-xl font-bold mb-4">💡 Como Ganhar Moedas</h3>
          <ul className="space-y-2 text-gray-300">
            <li>✓ Vença duelos para ganhar moedas</li>
            <li>✓ Complete missões diárias</li>
            <li>✓ Participe de torneios</li>
            <li>✓ Faça login diário para recompensas</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
