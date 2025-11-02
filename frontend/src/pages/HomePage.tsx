import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RankingPlayer {
  id: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
}

interface News {
  id: number;
  title: string;
  content: string;
  date: string;
}

export default function HomePage() {
  const { user } = useAuthStore();
  const { connect } = useSocketStore();
  const [activeTab, setActiveTab] = useState<'news' | 'ranking' | 'clans'>('news');
  const [ranking, setRanking] = useState<RankingPlayer[]>([]);
  const [news] = useState<News[]>([
    {
      id: 1,
      title: '🎉 Bem-vindo ao Yu-Gi-Oh! Duel Arena',
      content: 'Prepare-se para os duelos mais épicos! Construa seu deck, desafie duelistas do mundo todo e prove que você é o rei dos jogos!',
      date: '01/11/2025'
    },
    {
      id: 2,
      title: '🏆 Novo Torneio Começando em Breve',
      content: 'Inscreva-se agora para o Torneio Mensal! Prêmios incríveis aguardam os melhores duelistas. Não perca essa chance!',
      date: '01/11/2025'
    },
    {
      id: 3,
      title: '✨ Novas Cartas Adicionadas',
      content: 'Confira as novas cartas disponíveis na loja! Dragões lendários, magos poderosos e armadilhas devastadoras te esperam.',
      date: '01/11/2025'
    }
  ]);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (token) {
      connect(token);
      fetchRanking();
    }
  }, []);

  const fetchRanking = async () => {
    try {
      const token = useAuthStore.getState().token;
      const response = await axios.get(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Ordenar por rating
      const sorted = response.data.sort((a: RankingPlayer, b: RankingPlayer) => b.rating - a.rating);
      setRanking(sorted.slice(0, 10)); // Top 10
    } catch (error) {
      console.error('Erro ao buscar ranking:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header com Perfil do Usuário */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-900 to-purple-900 rounded-lg p-6 mb-8 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              Bem-vindo, {user?.username}! 👋
            </h1>
            <div className="flex gap-6 text-lg">
              <div>
                <span className="text-gray-400">Vitórias:</span>{' '}
                <span className="text-green-400 font-bold">{user?.wins || 0}</span>
              </div>
              <div>
                <span className="text-gray-400">Derrotas:</span>{' '}
                <span className="text-red-400 font-bold">{user?.losses || 0}</span>
              </div>
              <div>
                <span className="text-gray-400">Rating:</span>{' '}
                <span className="text-yellow-400 font-bold">{user?.rating || 1000}</span>
              </div>
              <div>
                <span className="text-gray-400">Gemas:</span>{' '}
                <span className="text-blue-400 font-bold">💎 {user?.gems || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Abas de Conteúdo */}
      <div className="mb-8">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('news')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'news'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            📰 Notícias
          </button>
          <button
            onClick={() => setActiveTab('ranking')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'ranking'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🏆 Ranking de Duelistas
          </button>
          <button
            onClick={() => setActiveTab('clans')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'clans'
                ? 'bg-amber-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            ⚔️ Ranking de Clãs
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gray-800 rounded-lg p-6 min-h-[400px]"
        >
          {activeTab === 'news' && (
            <div>
              <h2 className="text-3xl font-bold mb-6">📰 Últimas Notícias</h2>
              <div className="space-y-4">
                {news.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-900 rounded-lg p-4 border-l-4 border-blue-500"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-xl font-bold">{item.title}</h3>
                      <span className="text-gray-500 text-sm">{item.date}</span>
                    </div>
                    <p className="text-gray-300">{item.content}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ranking' && (
            <div>
              <h2 className="text-3xl font-bold mb-6">🏆 Top 10 Duelistas</h2>
              <div className="space-y-2">
                {ranking.length > 0 ? (
                  ranking.map((player, index) => (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex items-center justify-between p-4 rounded-lg ${
                        index === 0
                          ? 'bg-gradient-to-r from-yellow-600 to-amber-600'
                          : index === 1
                          ? 'bg-gradient-to-r from-gray-400 to-gray-600'
                          : index === 2
                          ? 'bg-gradient-to-r from-orange-600 to-orange-800'
                          : 'bg-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-bold w-8">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div>
                          <p className="font-bold text-lg">{player.username}</p>
                          <p className="text-sm text-gray-300">
                            {player.wins}V - {player.losses}D
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-yellow-400">{player.rating}</p>
                        <p className="text-xs text-gray-400">Rating</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-gray-400 text-center py-8">Carregando ranking...</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'clans' && (
            <div>
              <h2 className="text-3xl font-bold mb-6">⚔️ Ranking de Clãs</h2>
              <div className="text-center py-16">
                <p className="text-6xl mb-4">🚧</p>
                <p className="text-xl text-gray-400">Sistema de Clãs em Desenvolvimento</p>
                <p className="text-gray-500 mt-2">Em breve você poderá criar e participar de clãs!</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-12 bg-gray-800 rounded-lg p-8"
      >
        <h2 className="text-3xl font-bold mb-6">📢 Chat Global</h2>
        <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto mb-4">
          <p className="text-gray-400 text-center py-8">
            Chat em desenvolvimento...
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button className="btn-primary">Enviar</button>
        </div>
      </motion.div>
    </div>
  );
}
