import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';

export default function RandomDuelPage() {
  const { user } = useAuthStore();
  const { connect, emit, on, isConnected } = useSocketStore();
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (token) {
      connect(token);
    }

    on('matchFound', (data: { duelId: string; opponent: any }) => {
      setIsSearching(false);
      navigate(`/duel/${data.duelId}`);
    });

    return () => {
      if (isSearching) {
        handleCancelSearch();
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSearching) {
      interval = setInterval(() => {
        setSearchTime((prev) => prev + 1);
      }, 1000);
    } else {
      setSearchTime(0);
    }
    return () => clearInterval(interval);
  }, [isSearching]);

  const handleStartSearch = () => {
    if (!user) return;
    
    setIsSearching(true);
    emit('joinQueue', {
      userId: user.id,
      rating: user.rating,
    });
  };

  const handleCancelSearch = () => {
    if (!user) return;
    
    setIsSearching(false);
    setSearchTime(0);
    emit('leaveQueue', { userId: user.id });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-red-900 to-orange-900 rounded-lg p-12 text-center shadow-2xl"
      >
        <h1 className="text-5xl font-bold mb-4">🎲 Duelo Aleatório</h1>
        <p className="text-xl text-gray-200 mb-8">
          Encontre um oponente com rating similar ao seu
        </p>

        {!isSearching ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="bg-gray-900 rounded-lg p-6 mb-8 max-w-md mx-auto">
              <p className="text-gray-400 mb-2">Seu Rating Atual</p>
              <p className="text-5xl font-bold text-yellow-400">{user?.rating || 1000}</p>
            </div>

            <button
              onClick={handleStartSearch}
              disabled={!isConnected}
              className="btn-primary text-2xl py-6 px-12 shadow-2xl hover:scale-105 transition-transform"
            >
              {isConnected ? '⚔️ Procurar Oponente' : '🔄 Conectando...'}
            </button>

            <div className="mt-8 text-gray-300">
              <p className="text-sm">💡 Dica: O sistema busca jogadores com ±100 de rating</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="mb-8">
              <div className="flex justify-center mb-6">
                <div className="animate-spin rounded-full h-24 w-24 border-b-4 border-white"></div>
              </div>
              
              <p className="text-3xl font-bold mb-4">Procurando Oponente...</p>
              <p className="text-xl text-gray-300 mb-2">
                Tempo de busca: <span className="text-yellow-400 font-bold">{formatTime(searchTime)}</span>
              </p>
              
              <div className="bg-gray-900 rounded-lg p-4 max-w-md mx-auto mb-8">
                <p className="text-gray-400 text-sm mb-2">Expandindo busca...</p>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <motion.div
                    className="bg-yellow-400 h-2 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 30, repeat: Infinity }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Range atual: {user?.rating ? user.rating - 100 - (searchTime * 5) : 0} - {user?.rating ? user.rating + 100 + (searchTime * 5) : 0}
                </p>
              </div>
            </div>

            <button
              onClick={handleCancelSearch}
              className="btn-danger text-xl py-4 px-8"
            >
              ❌ Cancelar Busca
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* Dicas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 bg-gray-800 rounded-lg p-6"
      >
        <h3 className="text-xl font-bold mb-4">📋 Como Funciona</h3>
        <ul className="space-y-2 text-gray-300">
          <li>✓ O sistema busca jogadores com rating similar (+/- 100 pontos)</li>
          <li>✓ A cada 30 segundos, o range de busca aumenta em 50 pontos</li>
          <li>✓ Quando encontrar um oponente, você será levado automaticamente para o duelo</li>
          <li>✓ Vencer aumenta seu rating, perder diminui</li>
        </ul>
      </motion.div>
    </div>
  );
}
