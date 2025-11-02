import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'booster' | 'card' | 'cosmetic';
  rarity?: string;
  image?: string;
}

export default function ShopPage() {
  const { user } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState<'boosters' | 'singles' | 'cosmetics'>('boosters');

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

  const singles: ShopItem[] = [
    {
      id: '4',
      name: 'Dark Magician',
      description: 'O mago das trevas, servo leal de Yugi',
      price: 500,
      type: 'card',
      rarity: 'Ultra Rare'
    },
    {
      id: '5',
      name: 'Blue-Eyes White Dragon',
      description: 'O lendário dragão branco de olhos azuis',
      price: 500,
      type: 'card',
      rarity: 'Ultra Rare'
    },
  ];

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
    if (!user || (user.gems || 0) < item.price) {
      alert('Gemas insuficientes!');
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
              <p className="text-gray-400 text-sm">Suas Gemas</p>
              <p className="text-4xl font-bold text-yellow-400">💎 {user?.gems || 0}</p>
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

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {getCurrentItems().map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-800 rounded-lg overflow-hidden shadow-xl hover:shadow-2xl transition-all"
            >
              {/* Item Image */}
              <div className="bg-gradient-to-br from-purple-900 to-blue-900 h-48 flex items-center justify-center">
                <p className="text-8xl">
                  {item.type === 'booster' ? '📦' : item.type === 'card' ? '🎴' : '✨'}
                </p>
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
                    💎 {item.price}
                  </div>
                  <button
                    onClick={() => handlePurchase(item)}
                    disabled={(user?.gems || 0) < item.price}
                    className={`px-6 py-2 rounded-lg font-bold transition-all ${
                      (user?.gems || 0) >= item.price
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {(user?.gems || 0) >= item.price ? 'Comprar' : 'Sem Gemas'}
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
          <h3 className="text-xl font-bold mb-4">💡 Como Conseguir Gemas</h3>
          <ul className="space-y-2 text-gray-300">
            <li>✓ Vença duelos para ganhar gemas</li>
            <li>✓ Complete missões diárias</li>
            <li>✓ Participe de torneios</li>
            <li>✓ Faça login diário para recompensas</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
