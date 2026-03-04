import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/axios';

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
  currentTurn?: number;
  status: string;
  origin?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminActiveDuelsPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
      setError(err.response?.data?.message || 'Erro ao carregar duelos.');
      setDuels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (duelId: string) => {
    setConfirmDeleteId(null);
    setDeletingId(duelId);
    try {
      const { data } = await api.delete(`/admin/active-duels/${duelId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.success) {
        setDuels((prev) => prev.filter((d) => d.id !== duelId));
      } else {
        setError(data?.message || 'Não foi possível excluir o duelo.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao excluir duelo.');
    } finally {
      setDeletingId(null);
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
            <h1 className="text-3xl font-bold mb-1">⚔️ Duelos Ativos</h1>
            <p className="text-slate-400">Liste e exclua duelos em andamento quando precisar.</p>
          </div>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium transition-colors"
          >
            ← Voltar ao painel
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white">✕</button>
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
                className="rounded-lg p-5 border border-white/20 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-sky-500/50 transition-all flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-bold text-amber-400">{p1Name(duel)}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="font-bold text-amber-400">{p2Name(duel)}</span>
                  <span className="text-slate-400 text-sm">
                    {duel.player1LifePoints} LP × {duel.player2LifePoints} LP
                  </span>
                  {duel.currentTurn != null && (
                    <span className="text-slate-500 text-sm">
                      Turno: {duel.currentTurn === 1 ? p1Name(duel) : p2Name(duel)}
                    </span>
                  )}
                  {duel.origin && (
                    <span className="text-slate-500 text-xs px-2 py-0.5 rounded bg-white/10">{duel.origin}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/duel/${duel.id}`)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    👁 Assistir
                  </button>
                  {confirmDeleteId === duel.id ? (
                    <>
                      <span className="text-red-300 text-sm">Excluir?</span>
                      <button
                        onClick={() => handleDelete(duel.id)}
                        disabled={deletingId === duel.id}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === duel.id ? 'Excluindo…' : 'Sim'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingId === duel.id}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg transition-colors"
                      >
                        Não
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(duel.id)}
                      disabled={deletingId != null}
                      className="px-4 py-2 bg-red-900/60 hover:bg-red-800/80 text-red-200 font-medium rounded-lg transition-colors border border-red-500/50 disabled:opacity-50"
                    >
                      🗑 Excluir duelo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && duels.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={loadActiveDuels}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
            >
              Atualizar lista
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
