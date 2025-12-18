import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';

interface InventoryCard {
  id: string;
  name: string;
  type: string;
  rarity: 'Common' | 'Rare' | 'Super Rare' | 'Ultra Rare' | 'Secret Rare';
  quantity: number;
  image?: string;
  createdAt?: string;
}

export default function InventoryPage() {
  const { user } = useAuthStore();

  // Mock data - será substituído por dados reais da API
  const cards: InventoryCard[] = [
    { id: '1', name: 'Dark Magician', type: 'Monster', rarity: 'Ultra Rare', quantity: 3 },
    { id: '2', name: 'Blue-Eyes White Dragon', type: 'Monster', rarity: 'Ultra Rare', quantity: 2 },
  ];

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'Secret Rare': return 'from-purple-600 to-pink-600';
      case 'Ultra Rare': return 'from-yellow-600 to-amber-600';
      case 'Super Rare': return 'from-blue-600 to-cyan-600';
      case 'Rare': return 'from-green-600 to-emerald-600';
      default: return 'from-gray-600 to-gray-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-900 to-emerald-900 rounded-lg p-6 mb-8 shadow-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">🎒 Inventário</h1>
              <p className="text-gray-300">Gerencie suas cartas e itens</p>
            </div>
            <div className="text-right bg-gray-900 px-6 py-4 rounded-lg">
              <p className="text-gray-400 text-sm">Total de Cartas</p>
              <p className="text-4xl font-bold text-green-400">{cards.reduce((acc, c) => acc + c.quantity, 0)}</p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4">
          <select className="bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
            <option>Todas as Cartas</option>
            <option>Monstros</option>
            <option>Magias</option>
            <option>Armadilhas</option>
          </select>
          <select className="bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
            <option>Todas as Raridades</option>
            <option>Common</option>
            <option>Rare</option>
            <option>Super Rare</option>
            <option>Ultra Rare</option>
            <option>Secret Rare</option>
          </select>
          <input
            type="text"
            placeholder="Buscar carta..."
            className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Cards Grid */}
        {cards.length === 0 ? (
          <div className="text-center py-16 bg-gray-800 rounded-lg">
            <p className="text-6xl mb-4">📦</p>
            <p className="text-2xl text-gray-400 mb-2">Inventário Vazio</p>
            <p className="text-gray-500">Visite a loja para comprar cartas!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {cards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={`bg-gradient-to-br ${getRarityColor(card.rarity)} rounded-lg p-4 shadow-xl hover:scale-105 transition-transform cursor-pointer relative`}
              >
                {/* Quantidade */}
                <div className="absolute top-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded-full">
                  <p className="text-white font-bold text-sm">x{card.quantity}</p>
                </div>

                {/* Card Image Placeholder */}
                <div className="bg-gray-900 rounded-lg mb-3 h-48 flex items-center justify-center">
                  <p className="text-6xl">🎴</p>
                </div>

                {/* Card Info */}
                <div>
                  <p className="font-bold text-white mb-1 truncate">{card.name}</p>
                  <p className="text-xs text-gray-200">{card.type}</p>
                  <p className="text-xs font-bold text-yellow-300 mt-1">{card.rarity}</p>
                  {card.createdAt && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      📅 {new Date(card.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Estatísticas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">0</p>
            <p className="text-gray-400 text-sm">Monstros</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-purple-400">0</p>
            <p className="text-gray-400 text-sm">Magias</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-red-400">0</p>
            <p className="text-gray-400 text-sm">Armadilhas</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-yellow-400">{user?.credits || 0}</p>
            <p className="text-gray-400 text-sm">💎 Créditos</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
