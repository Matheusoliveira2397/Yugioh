import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';

export default function AdminPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const adminCards = [
    { 
      id: 'cards', 
      label: 'Gerenciar Cartas', 
      icon: '🎴',
      description: 'Criar, editar e remover cartas do jogo',
      route: '/admin/cartas',
      color: 'from-purple-600 to-purple-800'
    },
    { 
      id: 'players', 
      label: 'Gerenciar Jogadores', 
      icon: '👤',
      description: 'Banir, desbanir e gerenciar usuários',
      route: '/admin/players',
      color: 'from-blue-600 to-blue-800'
    },
    { 
      id: 'news', 
      label: 'Gerenciar Notícias', 
      icon: '📢',
      description: 'Criar e editar notícias do sistema',
      route: '/admin/news',
      color: 'from-green-600 to-green-800'
    },
  ];

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="text-6xl">⚙️</span>
            <div>
              <h1 className="text-5xl font-bold text-white">Painel Administrativo</h1>
              <p className="text-slate-400 text-lg">
                Gerenciamento completo do sistema
              </p>
            </div>
          </div>

          {/* Badge de Admin */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg">
            <span className="text-2xl">👑</span>
            <span className="text-yellow-400 font-bold">
              {user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}
            </span>
          </div>
        </motion.div>

        {/* Cards de Administração */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminCards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(card.route)}
              className={`
                bg-gradient-to-br ${card.color} 
                rounded-xl p-8 cursor-pointer 
                shadow-xl hover:shadow-2xl 
                border border-white/10
                transition-all duration-300
              `}
            >
              <div className="text-center">
                <div className="text-7xl mb-4">{card.icon}</div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {card.label}
                </h3>
                <p className="text-gray-200 text-sm">
                  {card.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Botão Voltar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-all"
          >
            ← Voltar ao Início
          </button>
        </motion.div>
      </div>
    </div>
  );
}
