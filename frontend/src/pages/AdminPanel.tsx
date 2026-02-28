import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import ResetAllAccountsModal from '../components/admin/ResetAllAccountsModal';

export default function AdminPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showResetModal, setShowResetModal] = useState(false);

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const adminCards = [
    { 
      id: 'site-tabs', 
      label: 'Gerenciar Abas', 
      icon: '🔧',
      description: 'Ativar/desativar abas do site',
      route: '/admin/site-tabs',
      color: 'from-gray-600 to-gray-800'
    },
    { 
      id: 'cards', 
      label: 'Cartas', 
      icon: '🎴',
      description: 'Gerenciar cartas',
      route: '/admin/cartas',
      color: 'from-purple-600 to-purple-800'
    },
    { 
      id: 'players', 
      label: 'Jogadores', 
      icon: '👤',
      description: 'Gerenciar usuários',
      route: '/admin/players',
      color: 'from-blue-600 to-blue-800'
    },
    { 
      id: 'news', 
      label: 'Notícias', 
      icon: '📢',
      description: 'Gerenciar notícias',
      route: '/admin/news',
      color: 'from-green-600 to-green-800'
    },
    { 
      id: 'playmats', 
      label: 'Playmats', 
      icon: '🎨',
      description: 'Gerenciar playmats',
      route: '/admin/playmats',
      color: 'from-blue-600 to-cyan-800'
    },
    { 
      id: 'sleeves', 
      label: 'Skins', 
      icon: '🎭',
      description: 'Gerenciar skins',
      route: '/admin/sleeves',
      color: 'from-emerald-600 to-teal-800'
    },
    { 
      id: 'initial-decks', 
      label: 'Decks Iniciais', 
      icon: '🎴',
      description: 'Gerenciar decks iniciais',
      route: '/admin/initial-decks',
      color: 'from-purple-600 to-pink-800'
    },
    { 
      id: 'tournaments', 
      label: 'Torneios', 
      icon: '🏆',
      description: 'Gerenciar torneios',
      route: '/admin/tournaments',
      color: 'from-yellow-600 to-orange-800'
    },
    { 
      id: 'arena', 
      label: 'Arena', 
      icon: '🏟️',
      description: 'Gerenciar arena',
      route: '/admin/arena',
      color: 'from-indigo-600 to-purple-800'
    },
    { 
      id: 'seasons', 
      label: 'Seasons', 
      icon: '🏆',
      description: 'Gerenciar seasons',
      route: '/admin/seasons',
      color: 'from-amber-600 to-yellow-800'
    },
    { 
      id: 'messages', 
      label: 'Mensagens', 
      icon: '📢',
      description: 'Enviar mensagens em massa',
      route: '/admin/messages',
      color: 'from-pink-600 to-rose-800'
    },
    { 
      id: 'achievements', 
      label: 'Conquistas', 
      icon: '🏆',
      description: 'Enviar conquistas para usuários',
      route: '/admin/achievements',
      color: 'from-yellow-600 to-amber-800'
    },
    { 
      id: 'divisions', 
      label: 'Divisões', 
      icon: '📊',
      description: 'Gerenciar divisões do ranking',
      route: '/admin/divisions',
      color: 'from-indigo-600 to-purple-800'
    },
    { 
      id: 'random-duel-level-ranges', 
      label: 'Random Duel', 
      icon: '🎲',
      description: 'Gerenciar faixas de nível do random duel',
      route: '/admin/random-duel-level-ranges',
      color: 'from-red-600 to-orange-800'
    },
    { 
      id: 'social-media', 
      label: 'Redes Sociais', 
      icon: '📱',
      description: 'Gerenciar links de redes sociais',
      route: '/admin/social-media',
      color: 'from-pink-600 to-rose-800'
    },
    { 
      id: 'new-account-settings', 
      label: 'Configurações de Contas Novas', 
      icon: '⚙️',
      description: 'Configurar cash, créditos e decks iniciais',
      route: '/admin/new-account-settings',
      color: 'from-cyan-600 to-blue-800'
    },
    { 
      id: 'cash-division', 
      label: 'Divisão de Cash', 
      icon: '💰',
      description: 'Configurar divisão automática de cash dos grupos',
      route: '/admin/cash-division',
      color: 'from-green-600 to-emerald-800'
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {adminCards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(card.route)}
              className={`
                bg-gradient-to-br ${card.color} 
                rounded-lg p-4 cursor-pointer 
                shadow-lg hover:shadow-xl 
                border border-white/10
                transition-all duration-200
              `}
            >
              <div className="text-center">
                <div className="text-4xl mb-2">{card.icon}</div>
                <h3 className="text-sm font-bold text-white mb-1">
                  {card.label}
                </h3>
                <p className="text-gray-200 text-xs">
                  {card.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Área de Ações Perigosas */}
        {user?.role === 'MASTER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 p-6 bg-gradient-to-r from-red-900/30 to-orange-900/30 border-2 border-red-600/50 rounded-xl"
          >
            <h3 className="text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
              ⚠️ Ações Perigosas
            </h3>
            <p className="text-red-200 text-sm mb-4">
              Estas ações são irreversíveis e afetam todo o sistema.
            </p>
            <button
              onClick={() => setShowResetModal(true)}
              className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg transition-all border-2 border-red-500"
            >
              🔄 Resetar Todas as Contas
            </button>
          </motion.div>
        )}

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

      {/* Modal de Reset */}
      <ResetAllAccountsModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onSuccess={() => {
          setShowResetModal(false);
          // Opcional: mostrar notificação de sucesso
        }}
      />
    </div>
  );
}
