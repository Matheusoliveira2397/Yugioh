import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface Duel {
  id: string;
  player1: {
    id: number;
    nickname: string;
    username: string;
    clanTag?: string;
  };
  player2: {
    id: number;
    nickname: string;
    username: string;
    clanTag?: string;
  };
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function ActiveDuelsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadActiveDuels();
    }
  }, [user]);

  const loadActiveDuels = async () => {
    try {
      setLoading(true);
      // Timeout aumentado (20 segundos) - para evitar problemas quando há WebSocket ativo
      const response = await Promise.race([
        api.get('/duels/my-active-duels', { timeout: 20000 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 20000)
        )
      ]) as any;
      setDuels(response?.data || []);
    } catch (error) {
      // Silenciosamente falhar - não mostrar erro para não incomodar
      console.warn('⚠️ Não foi possível carregar duelos ativos:', error);
      // Sempre retornar array vazio em caso de erro
      setDuels([]);
    } finally {
      setLoading(false);
    }
  };

  const getOpponent = (duel: Duel) => {
    if (!user) return null;
    return duel.player1.id === user.id ? duel.player2 : duel.player1;
  };

  const isMyTurn = (duel: Duel) => {
    if (!user) return false;
    const isPlayer1 = duel.player1.id === user.id;
    return (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
  };

  const getMyLifePoints = (duel: Duel) => {
    if (!user) return 0;
    return duel.player1.id === user.id ? duel.player1LifePoints : duel.player2LifePoints;
  };

  const getOpponentLifePoints = (duel: Duel) => {
    if (!user) return 0;
    return duel.player1.id === user.id ? duel.player2LifePoints : duel.player1LifePoints;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Você precisa estar logado para ver seus duelos</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">⚔️ Meus Duelos Ativos</h1>
            <p className="text-gray-400">Continue seus duelos em andamento</p>
          </div>
          <button
            onClick={() => navigate('/finished-duels')}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg transition-colors"
          >
            📜 Ver Duelos Finalizados
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
            <p className="mt-4 text-gray-400">Carregando duelos...</p>
          </div>
        ) : duels.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-6xl mb-4">🎮</p>
            <p className="text-xl text-gray-400">Você não tem duelos ativos no momento</p>
            <button
              onClick={() => navigate('/random-duel')}
              className="mt-6 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors"
            >
              Buscar Duelo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {duels.map((duel) => {
              const opponent = getOpponent(duel);
              if (!opponent) return null;

              return (
                <div
                  key={duel.id}
                  className="bg-gray-800 rounded-lg p-6 border-2 border-gray-700 hover:border-red-500 transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold mb-2">
                        vs {opponent.clanTag ? `|${opponent.clanTag}| ` : ''}
                        {opponent.nickname || opponent.username}
                      </h3>
                      <p className="text-sm text-gray-400">
                        Iniciado em {new Date(duel.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    {isMyTurn(duel) && (
                      <span className="px-3 py-1 bg-green-600 rounded-full text-xs font-bold">
                        Seu Turno
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-700 rounded p-3">
                      <p className="text-xs text-gray-400 mb-1">Sua Vida</p>
                      <p className="text-2xl font-bold text-green-400">{getMyLifePoints(duel)} LP</p>
                    </div>
                    <div className="bg-gray-700 rounded p-3">
                      <p className="text-xs text-gray-400 mb-1">Vida do Oponente</p>
                      <p className="text-2xl font-bold text-red-400">{getOpponentLifePoints(duel)} LP</p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/duel/${duel.id}`)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    {isMyTurn(duel) ? '▶ Continuar Duelo' : '👁 Ver Duelo'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

