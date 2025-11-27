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
  priceCredits?: number;
  priceCash?: number;
  level?: number;
  atk?: number;
  def?: number;
}

interface Card {
  id: string;
  name: string;
  description: string;
  cardImage: string;
  rarity: string;
  type: string;
  atk?: number;
  def?: number;
  level?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
}

export default function ShopPage() {
  const { user } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState<'boosters' | 'singles' | 'cosmetics'>('boosters');
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  // Buscar cartas da loja ao carregar a página
  useEffect(() => {
    const fetchCards = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:3000/cards/shop/for-sale');
        setCards(response.data);
        console.log('📦 Cartas da loja carregadas:', response.data);
      } catch (error) {
        console.error('❌ Erro ao carregar cartas da loja:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();
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
  const singles: ShopItem[] = cards.map(card => ({
    id: card.id,
    name: card.name,
    description: card.description || 'Carta poderosa para seu deck',
    price: card.priceCredits || 0, // Preço padrão em créditos
    priceCredits: card.priceCredits,
    priceCash: card.priceCash,
    type: 'card' as const,
    rarity: card.rarity,
    image: card.cardImage,
    level: card.level,
    atk: card.atk,
    def: card.def
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
    if (!user) {
      alert('Você precisa estar logado para comprar!');
      return;
    }

    // Cartas usam Créditos, outros itens usam Cash
    const userBalance = item.type === 'card' ? (user?.credits || 0) : (user?.cash || 0);
    const currency = item.type === 'card' ? 'Créditos' : 'Cash';
    
    if (userBalance < item.price) {
      alert(`${currency} insuficiente! Você tem ${userBalance} mas precisa de ${item.price}`);
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
            <div className="text-right bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-4 rounded-lg border-2 border-purple-500/50 shadow-lg">
              <p className="text-gray-400 text-sm mb-2">💰 Seu Saldo</p>
              <div className="flex gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {!loading && getCurrentItems().map((item, index) => {
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

            const canAfford = item.type === 'card' 
              ? (user?.credits || 0) >= item.price 
              : (user?.cash || 0) >= item.price;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="group relative"
              >
                {/* Card Container com hover effect */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 hover:border-purple-500 transition-all duration-300 hover:scale-105 hover:shadow-purple-500/50">
                  
                  {/* Item Image com overlay */}
                  <div className="relative h-72 overflow-hidden">
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.rarity ? getRarityColor(item.rarity) : 'from-purple-900 to-blue-900'} opacity-30`}></div>
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      {item.image ? (
                        <img 
                          src={item.image} 
                          alt={item.name}
                          className="h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <p className="text-9xl opacity-50">
                          {item.type === 'booster' ? '📦' : item.type === 'card' ? '🎴' : '✨'}
                        </p>
                      )}
                    </div>
                    
                    {/* Rarity Badge */}
                    {item.rarity && (
                      <div className={`absolute top-3 right-3 bg-gradient-to-r ${getRarityColor(item.rarity)} px-3 py-1 rounded-full border-2 border-white/30 backdrop-blur-sm`}>
                        <p className="text-xs font-bold text-white shadow-lg">{item.rarity}</p>
                      </div>
                    )}

                    {/* Type Badge */}
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full border border-white/20">
                      <p className="text-xs font-bold text-white">
                        {item.type === 'booster' && '📦 Pacote'}
                        {item.type === 'card' && '🎴 Carta'}
                        {item.type === 'cosmetic' && '✨ Cosmético'}
                      </p>
                    </div>
                  </div>

                  {/* Item Info Section */}
                  <div className="p-5 bg-gradient-to-b from-gray-800 to-gray-900">
                    {/* Item Name */}
                    <h3 className="text-xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 line-clamp-1">
                      {item.name}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-400 text-xs mb-4 line-clamp-2 italic">
                      {item.description}
                    </p>

                    {/* Divider */}
                    <div className="border-t border-gray-700 mb-4"></div>

                    {/* Price Section */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Preço</p>
                        <div className="text-2xl font-bold">
                          {item.type === 'card' ? (
                            <span className="text-purple-400 flex items-center gap-1">
                              <span className="text-3xl">💎</span> {item.price}
                            </span>
                          ) : (
                            <span className="text-green-400 flex items-center gap-1">
                              <span className="text-3xl">�</span> {item.price}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Stock Badge */}
                      <div className="bg-green-500/20 border border-green-500/50 px-3 py-1 rounded-full">
                        <p className="text-xs text-green-400 font-bold">✓ Disponível</p>
                      </div>
                    </div>

                    {/* Buy Button */}
                    <button
                      onClick={() => handlePurchase(item)}
                      disabled={!user || !canAfford}
                      className={`w-full py-3 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                        user && canAfford
                          ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-green-500/50 transform hover:-translate-y-1'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {!user ? (
                        <>🔒 Faça Login</>
                      ) : canAfford ? (
                        <>🛒 Comprar Agora</>
                      ) : (
                        <>💰 Saldo Insuficiente</>
                      )}
                    </button>

                    {/* Balance Warning */}
                    {user && !canAfford && (
                      <p className="text-xs text-red-400 text-center mt-2">
                        Faltam {item.type === 'card' ? '💎' : '�'} {(item.price - (item.type === 'card' ? (user?.credits || 0) : (user?.cash || 0)))}
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

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700"
        >
          <h3 className="text-xl font-bold mb-4 text-purple-400">💡 Como Conseguir Créditos e Cash</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/30">
              <h4 className="font-bold text-purple-400 mb-2">💎 Créditos (Premium)</h4>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>✓ Vença duelos para ganhar créditos</li>
                <li>✓ Complete missões diárias</li>
                <li>✓ Participe de torneios</li>
                <li>✓ Use para comprar cartas individuais</li>
              </ul>
            </div>
            <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30">
              <h4 className="font-bold text-green-400 mb-2">💵 Cash (R$)</h4>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>✓ Recompensas especiais de eventos</li>
                <li>✓ Login diário consecutivo</li>
                <li>✓ Conquistas e rankings</li>
                <li>✓ Use para comprar pacotes e cosméticos</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
