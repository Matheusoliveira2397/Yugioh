import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';

export default function RandomDuelPage() {
  const { user } = useAuthStore();
  const { isConnected, isSearching, duelFound, searchDuel, cancelSearch } = useSocket();

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-800/50 rounded-xl border border-purple-500/30 p-8 text-center">
        {duelFound ? (
          <div>
            <h2 className="text-4xl font-bold text-green-400 mb-6">Duelo Encontrado!</h2>
            <p className="text-slate-300 text-lg mb-6">
              Oponente: <span className="font-bold text-red-400">
                {duelFound.opponent.clanTag && `[${duelFound.opponent.clanTag}] `}
                {duelFound.opponent.username}
              </span>
            </p>
            <button 
              onClick={() => window.open(`/arena/${duelFound.duelId}`, '_blank')}
              className="gradient blue-purple px-12 py-4 rounded-lg text-2xl font-bold"
            >
              ⚔️ Entrar na Arena de Duelo
            </button>
            <p className="text-slate-500 text-sm mt-4">
              (Abre em nova aba)
            </p>
          </div>
        ) : isSearching ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <div className="w-32 h-32 mx-auto mb-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-full h-full border-8 border-purple-500 border-t-transparent rounded-full"
              />
            </div>
            <h2 className="text-3xl font-bold text-purple-400 mb-4">Procurando Oponente...</h2>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-slate-300 mb-8"
            >
              Aguarde enquanto buscamos um duelista digno...
            </motion.p>
            <button 
              onClick={() => user && cancelSearch(user.id)}
              className="gradient red-pink px-8 py-3 rounded-lg font-bold"
            >
              Cancelar Busca
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Status Conexão */}
            <div className="mb-6">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                {isConnected ? 'Conectado' : 'Desconectado'}
              </div>
            </div>

            <h1 className="text-5xl font-bold mb-4">
              <span className="gradient-text blue-purple">🎲 Random Duel</span>
            </h1>
            <p className="text-slate-300 text-lg mb-8">
              Encontre um oponente aleatório e prove seu valor!
            </p>

            {/* Player Info */}
            <div className="bg-slate-700/50 rounded-lg p-6 mb-8 inline-block">
              <img 
                src={user.avatar || '/default-avatar.png'} 
                alt={user.username}
                className="w-24 h-24 rounded-full border-4 border-purple-500 mx-auto mb-4"
              />
              <div className="text-2xl font-bold text-purple-400 mb-2">
                {user.clanTag && <span className="text-slate-400">[{user.clanTag}]</span>} {user.username}
              </div>
              <div className="text-slate-400">Nível {user.level || 1}</div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => user && searchDuel(user.id)}
              disabled={!isConnected}
              className="gradient red-orange px-12 py-4 rounded-lg text-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎮 Procurar Duelo
            </motion.button>

            {/* Estatísticas */}
            <div className="mt-8 pt-8 border-t border-slate-700">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-400">0</div>
                  <div className="text-slate-400 text-sm">Vitórias</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">0</div>
                  <div className="text-slate-400 text-sm">Derrotas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">0%</div>
                  <div className="text-slate-400 text-sm">Taxa</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
