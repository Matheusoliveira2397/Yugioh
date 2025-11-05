import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
}

export default function ShopCardsPage() {
  const { user } = useAuthStore();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<'coins' | 'credits' | 'cash'>('coins');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const response = await axios.get(`${API_URL}/cards/shop/for-sale`);
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
    const price = selectedCurrency === 'coins' 
      ? card.priceCoins 
      : selectedCurrency === 'credits' 
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
    const userBalance = selectedCurrency === 'coins' 
      ? (user.coins || 0)
      : selectedCurrency === 'credits'
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
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/shop/purchase`,
        {
          cardId: card.id,
          paymentMethod: selectedCurrency,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage({ 
        type: 'success', 
        text: `✅ Carta "${card.name}" comprada com sucesso!` 
      });

      // Atualizar saldo do usuário (recarregar página ou atualizar store)
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || 'Erro ao comprar carta'}` 
      });
    }
  };

  const getCurrencyName = (currency: string) => {
    const names = {
      coins: 'moedas',
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
    return selectedCurrency === 'coins' 
      ? card.priceCoins 
      : selectedCurrency === 'credits' 
      ? card.priceCredits 
      : card.priceCash;
  };

  const getUserBalance = () => {
    if (!user) return 0;
    return selectedCurrency === 'coins' 
      ? (user.coins || 0)
      : selectedCurrency === 'credits'
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
            <div className="text-right bg-gray-900 px-6 py-4 rounded-lg border-2 border-yellow-500">
              <p className="text-gray-400 text-sm">Seu Saldo</p>
              <div className="flex gap-4 mt-2">
                <div className="text-center">
                  <p className="text-xl font-bold text-yellow-400">🪙 {user?.coins || 0}</p>
                  <p className="text-xs text-gray-400">Moedas</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-purple-400">💎 {user?.credits || 0}</p>
                  <p className="text-xs text-gray-400">Créditos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-400">💵 {user?.cash || 0}</p>
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
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedCurrency('coins')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              selectedCurrency === 'coins'
                ? 'bg-yellow-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🪙 Moedas
          </button>
          <button
            onClick={() => setSelectedCurrency('credits')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              selectedCurrency === 'credits'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            💎 Créditos
          </button>
          <button
            onClick={() => setSelectedCurrency('cash')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              selectedCurrency === 'cash'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            💵 Cash
          </button>
        </div>

        {/* Grid de Cartas */}
        {loading ? (
          <div className="text-center py-16">
            <p className="text-2xl">⏳ Carregando cartas...</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-16 bg-gray-800 rounded-lg">
            <p className="text-6xl mb-4">📦</p>
            <p className="text-2xl text-gray-400 mb-2">Nenhuma carta disponível</p>
            <p className="text-gray-500">
              {selectedCurrency === 'coins' && 'Nenhuma carta pode ser comprada com moedas'}
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
                  className="bg-gray-800 rounded-lg overflow-hidden shadow-xl hover:shadow-2xl transition-all"
                >
                  {/* Card Image */}
                  <div className={`bg-gradient-to-br ${getRarityColor(card.rarity)} h-64 flex items-center justify-center relative`}>
                    {card.cardImage ? (
                      <img 
                        src={card.cardImage} 
                        alt={card.name}
                        className="h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <p className="text-8xl">
                        {card.type === 'Monster' ? '👹' : card.type === 'Spell' ? '📜' : '🪤'}
                      </p>
                    )}
                    <div className="absolute top-2 right-2 bg-black/70 px-3 py-1 rounded-full">
                      <p className="text-xs font-bold text-yellow-400">{card.rarity}</p>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-4">
                    <h3 className="text-xl font-bold mb-2">{card.name}</h3>
                    <p className="text-gray-400 text-sm mb-3 line-clamp-2">{card.description}</p>

                    {/* Stats */}
                    {card.type === 'Monster' && (
                      <div className="flex gap-2 mb-3">
                        <span className="bg-gray-700 px-2 py-1 rounded text-xs">⭐ {card.level}</span>
                        <span className="bg-red-900 px-2 py-1 rounded text-xs">⚔️ {card.atk}</span>
                        <span className="bg-blue-900 px-2 py-1 rounded text-xs">🛡️ {card.def}</span>
                      </div>
                    )}

                    {/* Preço e Botão */}
                    <div className="flex justify-between items-center">
                      <div className="text-2xl font-bold">
                        {selectedCurrency === 'coins' && `🪙 ${price}`}
                        {selectedCurrency === 'credits' && `💎 ${price}`}
                        {selectedCurrency === 'cash' && `💵 R$ ${price}`}
                      </div>
                      <button
                        onClick={() => handlePurchase(card)}
                        disabled={!user || !canAfford}
                        className={`px-6 py-2 rounded-lg font-bold transition-all ${
                          user && canAfford
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {!user ? 'Login' : canAfford ? 'Comprar' : 'Sem Saldo'}
                      </button>
                    </div>
                  </div>
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
