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
  status: string;
  result?: string;
  winnerId?: number;
  createdAt: string;
  finishedAt?: string;
}

export default function FinishedDuelsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [selectedDuels, setSelectedDuels] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadFinishedDuels();
    }
  }, [user]);

  const loadFinishedDuels = async () => {
    try {
      setLoading(true);
      // Timeout aumentado (20 segundos) - para evitar problemas quando há WebSocket ativo
      const response = await Promise.race([
        api.get('/duels/my-finished-duels', { timeout: 20000 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 20000)
        )
      ]) as any;
      setDuels(response?.data || []);
    } catch (error) {
      console.warn('⚠️ Erro ao carregar duelos finalizados:', error);
      setDuels([]);
    } finally {
      setLoading(false);
    }
  };

  const getOpponent = (duel: Duel) => {
    if (!user) return null;
    return duel.player1.id === user.id ? duel.player2 : duel.player1;
  };

  const getMyLifePoints = (duel: Duel) => {
    if (!user) return 0;
    return duel.player1.id === user.id ? duel.player1LifePoints : duel.player2LifePoints;
  };

  const getOpponentLifePoints = (duel: Duel) => {
    if (!user) return 0;
    return duel.player1.id === user.id ? duel.player2LifePoints : duel.player1LifePoints;
  };

  const isWinner = (duel: Duel) => {
    if (!user || !duel.winnerId) return false;
    return duel.winnerId === user.id;
  };

  const handleDelete = async (duelId: string) => {
    if (!confirm('Tem certeza que deseja deletar este duelo? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      setDeleting([...deleting, duelId]);
      const response = await api.delete(`/duels/${duelId}`);
      
      if (response.data.success) {
        setDuels(duels.filter(d => d.id !== duelId));
        alert('Duelo deletado com sucesso!');
      } else {
        alert(`Erro: ${response.data.message}`);
      }
    } catch (error: any) {
      console.error('❌ Erro ao deletar duelo:', error);
      alert(error.response?.data?.message || 'Erro ao deletar duelo');
    } finally {
      setDeleting(deleting.filter(id => id !== duelId));
    }
  };

  const handleToggleSelect = (duelId: string) => {
    const newSelected = new Set(selectedDuels);
    if (newSelected.has(duelId)) {
      newSelected.delete(duelId);
    } else {
      newSelected.add(duelId);
    }
    setSelectedDuels(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedDuels.size === 0) return;
    
    if (!confirm(`Tem certeza que deseja deletar ${selectedDuels.size} duelo(s)? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const duelIds = Array.from(selectedDuels);
      setDeleting([...deleting, ...duelIds]);
      
      const response = await api.delete('/duels/batch/delete', {
        data: { duelIds }
      });
      
      if (response.data.success !== undefined) {
        setDuels(duels.filter(d => !selectedDuels.has(d.id)));
        setSelectedDuels(new Set());
        alert(`${response.data.success} duelo(s) deletado(s) com sucesso!`);
        if (response.data.failed > 0) {
          alert(`${response.data.failed} duelo(s) falharam ao deletar.`);
        }
      }
    } catch (error: any) {
      console.error('❌ Erro ao deletar duelos:', error);
      alert(error.response?.data?.message || 'Erro ao deletar duelos');
    } finally {
      setDeleting([]);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <p className="text-xl">Você precisa estar logado para ver seus duelos</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">📜 Meus Duelos Finalizados</h1>
            <p className="text-gray-400">Gerencie seus duelos concluídos</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/active-duels')}
              className="hover:bg-white/10 border border-white/20 text-white font-bold px-4 py-2 rounded-lg transition-colors"
            >
              ⚔️ Ver Duelos Ativos
            </button>
            {selectedDuels.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting.length > 0}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold px-6 py-2 rounded-lg transition-colors"
              >
                🗑️ Deletar Selecionados ({selectedDuels.size})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
            <p className="mt-4 text-gray-400">Carregando duelos...</p>
          </div>
        ) : duels.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-white/20">
            <p className="text-6xl mb-4">📋</p>
            <p className="text-xl text-gray-400">Você não tem duelos finalizados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {duels.map((duel) => {
              const opponent = getOpponent(duel);
              if (!opponent) return null;

              const isDeleting = deleting.includes(duel.id);
              const isSelected = selectedDuels.has(duel.id);

              return (
                <div
                  key={duel.id}
                  className={`rounded-lg p-6 border-2 transition-all ${
                    isSelected ? 'border-blue-500' : 'border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(duel.id)}
                        className="mt-1 w-5 h-5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-2">
                          vs {opponent.clanTag ? `|${opponent.clanTag}| ` : ''}
                          {opponent.nickname || opponent.username}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {duel.finishedAt 
                            ? `Finalizado em ${new Date(duel.finishedAt).toLocaleString('pt-BR')}`
                            : `Criado em ${new Date(duel.createdAt).toLocaleString('pt-BR')}`}
                        </p>
                      </div>
                    </div>
                    {isWinner(duel) ? (
                      <span className="px-3 py-1 bg-green-600 rounded-full text-xs font-bold">
                        🏆 Vitória
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-red-600 rounded-full text-xs font-bold">
                        ❌ Derrota
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="rounded p-3 border border-white/20">
                      <p className="text-xs text-gray-400 mb-1">Sua Vida Final</p>
                      <p className="text-2xl font-bold text-green-400">{getMyLifePoints(duel)} LP</p>
                    </div>
                    <div className="rounded p-3 border border-white/20">
                      <p className="text-xs text-gray-400 mb-1">Vida do Oponente</p>
                      <p className="text-2xl font-bold text-red-400">{getOpponentLifePoints(duel)} LP</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(duel.id)}
                    disabled={isDeleting}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-2 rounded-lg transition-colors"
                  >
                    {isDeleting ? '🗑️ Deletando...' : '🗑️ Deletar Duelo'}
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

