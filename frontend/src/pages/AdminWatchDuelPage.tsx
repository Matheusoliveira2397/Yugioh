import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface Duel {
  id: string;
  player1?: { id: number; nickname?: string; username?: string; clanTag?: string };
  player2?: { id: number; nickname?: string; username?: string; clanTag?: string };
  player1Nickname?: string;
  player2Nickname?: string;
  player1Id?: number;
  player2Id?: number;
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminWatchDuelPage() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    loadActiveDuels();
  }, []);

  const loadActiveDuels = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/active-duels', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      setDuels(Array.isArray(response?.data) ? response.data : []);
    } catch (err: any) {
      console.warn('Erro ao carregar duelos ativos (admin):', err);
      setError(err.response?.data?.message || 'Erro ao carregar duelos.');
      setDuels([]);
    } finally {
      setLoading(false);
    }
  };

  const p1Name = (d: Duel) =>
    d.player1?.nickname || d.player1?.username || d.player1Nickname || `Jogador ${d.player1Id ?? 1}`;
  const p2Name = (d: Duel) =>
    d.player2?.nickname || d.player2?.username || d.player2Nickname || `Jogador ${d.player2Id ?? 2}`;

  return (
    <div className="min-h-screen text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-1">👁 Assistir Duelos</h1>
            <p className="text-slate-400">Visualize duelos em andamento como espectador (somente admin)</p>
          </div>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium transition-colors"
          >
            ← Voltar ao painel
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500" />
            <p className="mt-4 text-slate-400">Carregando duelos ativos...</p>
          </div>
        ) : duels.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-white/20 bg-white/5">
            <p className="text-5xl mb-4">🎮</p>
            <p className="text-xl text-slate-400">Nenhum duelo ativo no momento</p>
            <p className="text-sm text-slate-500 mt-2">Os duelos em andamento aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {duels.map((duel) => (
              <div
                key={duel.id}
                className="rounded-lg p-5 border border-white/20 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-amber-500/50 transition-all flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-bold text-amber-400">{p1Name(duel)}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="font-bold text-amber-400">{p2Name(duel)}</span>
                  <span className="text-slate-400 text-sm">
                    {duel.player1LifePoints} LP × {duel.player2LifePoints} LP
                  </span>
                  <span className="text-slate-500 text-sm">
                    Turno: {duel.currentTurn === 1 ? p1Name(duel) : p2Name(duel)}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/duel/${duel.id}`)}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors whitespace-nowrap"
                >
                  👁 Assistir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
