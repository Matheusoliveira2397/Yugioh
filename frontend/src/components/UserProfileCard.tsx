import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export const UserProfileCard: React.FC = () => {
  const user = useAuthStore((state) => state.user);

  // Debug: Verificar dados do usuário
  React.useEffect(() => {
    console.log('👤 UserProfileCard - Dados do usuário:', user);
    console.log('💎 Credits:', user?.credits);
    console.log('💵 Cash:', user?.cash);
  }, [user]);

  if (!user) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-80">
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 100 }}
        className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden"
      >
        {/* Header com Avatar */}
        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 p-4 border-b border-slate-700/50">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <Link to={`/profile/${user?.id || ''}`} className="group relative">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-purple-500 shadow-lg shadow-purple-500/30">
                  <img
                    src={`http://localhost:3000${user.profileImage}?t=${Date.now()}`}
                    alt={user.nickname}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/images/default.png';
                    }}
                  />
                </div>
                {/* Badge Online */}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-slate-900 shadow-lg">
                  <div className="w-full h-full bg-green-400 rounded-full animate-ping opacity-75"></div>
                </div>
                {/* Overlay de editar */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              </motion.div>
            </Link>

            {/* Info do Usuário */}
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1">
                {user.clanTag ? `|${user.clanTag}| ${user.nickname}` : user.nickname}
              </h3>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-400">🏆 Divisão</span>
                <span className="text-sm font-semibold text-cyan-400">Diamante</span>
              </div>
              {/* Barra de Progresso */}
              <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '75%' }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-full bg-gradient-to-r from-green-500 to-cyan-500"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">CARREGADO</p>
            </div>

            {/* Sino de notificação */}
            <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-4 space-y-3">
          {/* Recursos */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💎</span>
              <div>
                <p className="text-purple-400 font-bold text-lg">{(user.credits || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-400">Créditos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">�</span>
              <div>
                <p className="text-green-400 font-bold text-lg">R$ {(user.cash || 0).toFixed(2)}</p>
                <p className="text-xs text-slate-400">Cash</p>
              </div>
            </div>
          </div>

          {/* Estatísticas Detalhadas */}
          <div className="space-y-2 bg-slate-800/50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>📊</span> Nível
              </span>
              <span className="text-sm font-bold text-white">{Math.floor(user.rating / 200)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>⚔️</span> Score na Season
              </span>
              <span className="text-sm font-bold text-white">0.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>🏆</span> Score Geral
              </span>
              <span className="text-sm font-bold text-yellow-400">{user.rating.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>🏅</span> Ranking Geral
              </span>
              <span className="text-sm font-bold text-orange-400">14°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>📈</span> V/D (Geral)
              </span>
              <span className="text-sm font-bold text-white">
                <span className="text-green-400">{user.winsGeral || 0}</span> / <span className="text-red-400">{user.lossesGeral || 0}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>⚡</span> V/D (Season)
              </span>
              <span className="text-sm font-bold text-white">
                <span className="text-green-400">{user.winsSeason || 0}</span> / <span className="text-red-400">{user.lossesSeason || 0}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span>👥</span> Clã
              </span>
              <span className="text-sm font-bold text-cyan-400">HLS ⚔️ 100%</span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-2">
            <Link to={`/profile/${user?.id || ''}`} className="flex-1">
              <button className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-lg transition-colors">
                Perfil
              </button>
            </Link>
            <button 
              onClick={() => useAuthStore.getState().logout()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
