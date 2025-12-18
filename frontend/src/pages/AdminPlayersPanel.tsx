import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface Player {
  id: string;
  username: string;
  nickname?: string;
  clanTag?: string;
  email: string;
  role: string;
  isOnline: boolean;
  isBanned: boolean;
  banReason?: string;
  lastIpAddress?: string;
  lastLogin?: string;
  wins: number;
  losses: number;
  rating: number;
  createdAt: string;
}

export default function AdminPlayersPanel() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'banned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const response = await api.get('/admin/players');
      setPlayers(response.data);
    } catch (error) {
      console.error('Erro ao carregar jogadores:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar jogadores' });
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async (playerId: string) => {
    const reason = prompt('Motivo do banimento:');
    if (!reason) return;

    try {
      await api.post(`/admin/players/${playerId}/ban`, { reason });
      setMessage({ type: 'success', text: 'Jogador banido com sucesso!' });
      loadPlayers();
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao banir jogador' });
    }
  };

  const handleUnban = async (playerId: string) => {
    try {
      await api.post(`/admin/players/${playerId}/unban`);
      setMessage({ type: 'success', text: 'Jogador desbanido com sucesso!' });
      loadPlayers();
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao desbanir jogador' });
    }
  };

  const handleRoleChange = async (playerId: string, newRole: string) => {
    try {
      await api.put(`/admin/players/${playerId}/role`, { role: newRole });
      setMessage({ type: 'success', text: 'Role atualizada com sucesso!' });
      loadPlayers();
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao atualizar role' });
    }
  };

  const filteredPlayers = players
    .filter(player => {
      if (filter === 'online') return player.isOnline;
      if (filter === 'offline') return !player.isOnline;
      if (filter === 'banned') return player.isBanned;
      return true;
    })
    .filter(player => 
      player.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (player.nickname && player.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">👥 Gerenciamento de Jogadores</h1>
            <p className="text-gray-300">Administre todos os jogadores do servidor</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-400">{players.filter(p => p.isOnline).length}</p>
            <p className="text-gray-400">Online agora</p>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-900/50 border border-green-500' 
              : 'bg-red-900/50 border border-red-500'
          }`}
        >
          <p className="text-white font-semibold">{message.text}</p>
        </motion.div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="🔍 Buscar jogador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
        />
        
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
        >
          <option value="all">Todos ({players.length})</option>
          <option value="online">Online ({players.filter(p => p.isOnline).length})</option>
          <option value="offline">Offline ({players.filter(p => !p.isOnline).length})</option>
          <option value="banned">Banidos ({players.filter(p => p.isBanned).length})</option>
        </select>
      </div>

      {/* Players Table */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-2xl">⏳ Carregando jogadores...</p>
        </div>
      ) : filteredPlayers.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl border border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Jogador
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    IP
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Último Login
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredPlayers.map((player) => (
                  <motion.tr
                    key={player.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`hover:bg-gray-750 transition-colors ${
                      player.isBanned ? 'bg-red-900/20' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          player.isOnline ? 'bg-green-500' : 'bg-gray-500'
                        }`}></div>
                        <span className="text-sm font-medium">
                          {player.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-bold text-white">
                          {player.clanTag ? `|${player.clanTag}| ${player.nickname || player.username}` : (player.nickname || player.username)}
                        </p>
                        <p className="text-sm text-gray-400">@{player.username}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {player.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={player.role}
                        onChange={(e) => handleRoleChange(player.id, e.target.value)}
                        className={`bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm font-bold ${
                          player.role === 'MASTER' ? 'text-red-400' :
                          player.role === 'ADMIN' ? 'text-yellow-400' :
                          'text-blue-400'
                        }`}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="MASTER">MASTER</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">
                      {player.lastIpAddress || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">{player.wins || 0}V</span>
                        <span className="text-gray-500">/</span>
                        <span className="text-red-400">{player.losses || 0}D</span>
                        <span className="text-gray-500">|</span>
                        <span className="text-purple-400">{player.rating}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {player.lastLogin 
                        ? new Date(player.lastLogin).toLocaleDateString('pt-BR')
                        : 'Nunca'
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        {player.isBanned ? (
                          <button
                            onClick={() => handleUnban(player.id)}
                            className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded font-bold transition-colors"
                            title={player.banReason ? `Motivo: ${player.banReason}` : 'Desbanir'}
                          >
                            ✅ Desbanir
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBan(player.id)}
                            className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-bold transition-colors"
                          >
                            🚫 Banir
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-6xl mb-4">👥</p>
          <p className="text-2xl text-gray-400 mb-2">Nenhum jogador encontrado</p>
          <p className="text-gray-500">Ajuste os filtros de busca</p>
        </div>
      )}
    </div>
  );
}
