import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'booster' | 'card' | 'cosmetic';
  rarity?: string;
  image?: string;
}

interface ShopCard {
  id: string;
  card: {
    id: string;
    name: string;
    description: string;
    cardImage: string;
    rarity: string;
    type: string;
    atk?: number;
    def?: number;
  };
  currency: string;
  price: number;
  discount: number;
  isAvailable: boolean;
  isFeatured: boolean;
}

export default function ShopPage() {
  const { user } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState<'boosters' | 'singles' | 'cosmetics'>('boosters');
  const [shopCards, setShopCards] = useState<ShopCard[]>([]);
  const [loading, setLoading] = useState(false);

  // Buscar cartas da loja ao carregar a página
  useEffect(() => {
    const fetchShopCards = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:3000/shop');
        setShopCards(response.data);
        console.log('📦 Cartas da loja carregadas:', response.data);
      } catch (error) {
        console.error('❌ Erro ao carregar cartas da loja:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShopCards();
  }, []);

  const boosters: ShopItem[] = [
    {
      id: '1',
      name: 'Pacote Iniciante',
      description: 'Contém 5 cartas aleatórias, perfeito para começar!',
      price: 100,
      type: 'booster'
    },
    {
      id: '2',
      name: 'Pacote Premium',
      description: 'Contém 10 cartas com chance aumentada de raras',
      price: 250,
      type: 'booster'
    },
    {
      id: '3',
      name: 'Mega Pacote',
      description: 'Contém 20 cartas com garantia de 1 Ultra Rare',
      price: 500,
      type: 'booster'
    },
  ];

  // Converter cartas da API para o formato ShopItem
  const singles: ShopItem[] = shopCards.map(shopCard => ({
    id: shopCard.id,
    name: shopCard.card.name,
    description: shopCard.card.description || 'Carta poderosa para seu deck',
    price: shopCard.price,
    type: 'card' as const,
    rarity: shopCard.card.rarity,
    image: shopCard.card.cardImage
  }));

  const cosmetics: ShopItem[] = [
    {
      id: '6',
      name: 'Protetor de Cartas: Chamas',
      description: 'Adicione efeito de fogo às suas cartas',
      price: 300,
      type: 'cosmetic'
    },
  ];

  const getCurrentItems = () => {
    switch (selectedTab) {
      case 'boosters': return boosters;
      case 'singles': return singles;
      case 'cosmetics': return cosmetics;
      default: return [];
    }
  };

  const handlePurchase = (item: ShopItem) => {
    const userCoins = user?.coins || 0;
    
    if (!user || userCoins < item.price) {
      alert('Moedas insuficientes!');
      return;
    }
    alert(`Você comprou: ${item.name}!\n(Sistema de compra será implementado)`);
  };

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
              <p className="text-gray-300">Compre pacotes, cartas individuais e cosméticos</p>
            </div>
            <div className="text-right bg-gray-900 px-6 py-4 rounded-lg border-2 border-yellow-500">
              <p className="text-gray-400 text-sm">Suas Moedas</p>
              <p className="text-4xl font-bold text-yellow-400">🪙 {user?.coins || 0}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedTab('boosters')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              selectedTab === 'boosters'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            📦 Pacotes
          </button>
          <button
            onClick={() => setSelectedTab('singles')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              selectedTab === 'singles'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🎴 Cartas Individuais
          </button>
          <button
            onClick={() => setSelectedTab('cosmetics')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              selectedTab === 'cosmetics'
                ? 'bg-pink-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            ✨ Cosméticos
          </button>
        </div>

        {/* Loading State */}
        {loading && selectedTab === 'singles' && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            <p className="mt-4 text-gray-400">Carregando cartas da loja...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && selectedTab === 'singles' && singles.length === 0 && (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-6xl mb-4">📭</p>
            <p className="text-xl text-gray-400">Nenhuma carta disponível na loja no momento</p>
            <p className="text-sm text-gray-500 mt-2">Novas cartas serão adicionadas em breve!</p>
          </div>
        )}

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!loading && getCurrentItems().map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-800 rounded-lg overflow-hidden shadow-xl hover:shadow-2xl transition-all"
            >
              {/* Item Image */}
              <div className="bg-gradient-to-br from-purple-900 to-blue-900 h-48 flex items-center justify-center">
                {item.image ? (
                  <img 
                    src={item.image} 
                    alt={item.name}
                    className="h-full w-full object-contain p-4"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-8xl">🎴</p>';
                    }}
                  />
                ) : (
                  <p className="text-8xl">
                    {item.type === 'booster' ? '📦' : item.type === 'card' ? '🎴' : '✨'}
                  </p>
                )}
              </div>

              {/* Item Info */}
              <div className="p-4">
                <h3 className="text-xl font-bold mb-2">{item.name}</h3>
                {item.rarity && (
                  <p className="text-sm text-yellow-400 font-bold mb-2">⭐ {item.rarity}</p>
                )}
                <p className="text-gray-400 text-sm mb-4">{item.description}</p>

                <div className="flex justify-between items-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {item.type === 'card' ? `🪙 ${item.price}` : `💎 ${item.price}`}
                  </div>
                  <button
                    onClick={() => handlePurchase(item)}
                    disabled={item.type === 'card' ? (user?.coins || 0) < item.price : (user?.gems || 0) < item.price}
                    className={`px-6 py-2 rounded-lg font-bold transition-all ${
                      (item.type === 'card' ? (user?.coins || 0) : (user?.gems || 0)) >= item.price
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {(item.type === 'card' ? (user?.coins || 0) : (user?.gems || 0)) >= item.price ? 'Comprar' : 'Insuficiente'}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-gray-800 rounded-lg p-6"
        >
          <h3 className="text-xl font-bold mb-4">💡 Como Conseguir Moedas e Gemas</h3>
          <ul className="space-y-2 text-gray-300">
            <li>🪙 Vença duelos para ganhar moedas</li>
            <li>💎 Complete missões diárias para gemas</li>
            <li>🏆 Participe de torneios</li>
            <li>📅 Faça login diário para recompensas</li>
            <li>🎴 Use moedas para comprar cartas individuais</li>
            <li>📦 Use gemas para comprar pacotes e cosméticos</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
