import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

interface Player {
  id: number;
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
  winsGeral: number;
  lossesGeral: number;
  winsSeason: number;
  lossesSeason: number;
  totalScore?: number;
  credits: number;
  cash: number;
  level: number;
  experience: number;
  profileImage?: string;
  avatar?: string;
  createdAt: string;
}

interface UserDetails extends Player {
  ipHistory?: Array<{ ip: string; timestamp: string }>;
}

export default function AdminPlayersPanel() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'banned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<UserDetails | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editForm, setEditForm] = useState({ credits: 0, cash: 0, level: 1 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    credits: 0,
    cash: 0,
    filter: 'all' as 'all' | 'online' | 'loggedToday' | 'loggedThisWeek' | 'loggedThisMonth',
  });
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    loadPlayers();
  }, [page, filter]);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/users', {
        params: { page, limit: 20 }
      });
      
      if (response.data.users) {
        setPlayers(response.data.users);
        setTotalPages(response.data.pagination?.totalPages || 1);
        setTotalPlayers(response.data.pagination?.total || 0);
      } else {
        // Fallback para formato antigo
        setPlayers(response.data);
      }
    } catch (error: any) {
      console.error('Erro ao carregar jogadores:', error);
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erro ao carregar jogadores' });
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerDetails = async (playerId: number) => {
    try {
      const response = await api.get(`/admin/users/${playerId}`);
      setSelectedPlayer(response.data);
      setShowDetailsModal(true);
    } catch (error: any) {
      console.error('Erro ao carregar detalhes:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar detalhes do jogador' });
    }
  };

  const handleBan = async (playerId: number) => {
    const reason = window.prompt('Motivo do banimento:');
    if (!reason) return;

    try {
      await api.delete(`/admin/users/${playerId}/ban`, { data: { reason } });
      setMessage({ type: 'success', text: 'Jogador banido com sucesso!' });
      loadPlayers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erro ao banir jogador' });
    }
  };

  const handleUnban = async (playerId: number) => {
    try {
      await api.put(`/admin/users/${playerId}/unban`);
      setMessage({ type: 'success', text: 'Jogador desbanido com sucesso!' });
      loadPlayers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erro ao desbanir jogador' });
    }
  };

  const handleDeleteUser = async (playerId: number) => {
    const player = players.find(p => p.id === playerId);
    const playerName = player ? (player.nickname || player.username) : 'este usuário';
    
    const confirmMessage = `⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!\n\n` +
      `Você está prestes a excluir permanentemente a conta de ${playerName}.\n\n` +
      `Isso irá excluir:\n` +
      `- TODAS AS CARTAS do inventário do duelista\n` +
      `- TODOS OS DECKS do duelista\n` +
      `- Todas as transações\n` +
      `- Rankings de temporada\n` +
      `- Mensagens privadas\n` +
      `- Amizades\n` +
      `- Participações em grupos\n` +
      `- Participações em torneios\n` +
      `- Duelos relacionados\n` +
      `- E todos os outros dados vinculados\n\n` +
      `Digite "EXCLUIR" para confirmar:`;

    const confirmation = window.prompt(confirmMessage);
    
    if (confirmation !== 'EXCLUIR') {
      return;
    }

    try {
      setLoading(true);
      const response = await api.delete(`/admin/users/${playerId}`);
      setMessage({ 
        type: 'success', 
        text: `Usuário ${playerName} excluído permanentemente! Dados excluídos: ${JSON.stringify(response.data.deletedCounts)}` 
      });
      loadPlayers();
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Erro ao excluir usuário' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (playerId: number, newRole: string) => {
    try {
      let endpoint = '';
      if (newRole === 'MASTER') {
        endpoint = `/admin/users/${playerId}/promote/master`;
      } else if (newRole === 'ADMIN') {
        endpoint = `/admin/users/${playerId}/promote/admin`;
      } else {
        endpoint = `/admin/users/${playerId}/demote`;
      }
      
      await api.put(endpoint);
      setMessage({ type: 'success', text: 'Role atualizada com sucesso!' });
      loadPlayers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erro ao atualizar role' });
    }
  };

  const handleEditResources = async () => {
    if (!editingPlayer) return;

    try {
      // Nota: Você precisará criar um endpoint no backend para atualizar credits, cash e level
      // Por enquanto, vou apenas mostrar como seria a chamada
      await api.put(`/admin/users/${editingPlayer.id}/resources`, editForm);
      setMessage({ type: 'success', text: 'Recursos atualizados com sucesso!' });
      setShowEditModal(false);
      setEditingPlayer(null);
      loadPlayers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erro ao atualizar recursos' });
    }
  };

  const openEditModal = (player: Player) => {
    setEditingPlayer(player);
    setEditForm({
      credits: player.credits || 0,
      cash: player.cash || 0,
        level: player.level || 1,
    });
    setShowEditModal(true);
  };

  const handleBulkAddResources = async () => {
    if (bulkForm.credits === 0 && bulkForm.cash === 0) {
      setMessage({ type: 'error', text: 'É necessário especificar créditos ou cash para adicionar' });
      return;
    }

    const filterNames = {
      all: 'todos os usuários',
      online: 'usuários online',
      loggedToday: 'usuários que logaram hoje',
      loggedThisWeek: 'usuários que logaram esta semana',
      loggedThisMonth: 'usuários que logaram este mês',
    };

    const confirmMessage = `⚠️ ATENÇÃO!\n\n` +
      `Você está prestes a adicionar:\n` +
      `${bulkForm.credits > 0 ? `💰 ${bulkForm.credits} créditos\n` : ''}` +
      `${bulkForm.cash > 0 ? `💵 ${bulkForm.cash} cash\n` : ''}` +
      `para ${filterNames[bulkForm.filter]}.\n\n` +
      `Esta ação não pode ser desfeita!\n\n` +
      `Deseja continuar?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setBulkLoading(true);
      const response = await api.post('/admin/bulk-add-resources', bulkForm);
      setMessage({
        type: 'success',
        text: `${response.data.message}. ${response.data.totalCreditsAdded ? `💰 ${response.data.totalCreditsAdded} créditos adicionados. ` : ''}${response.data.totalCashAdded ? `💵 ${response.data.totalCashAdded} cash adicionado.` : ''}`
      });
      setShowBulkModal(false);
      setBulkForm({ credits: 0, cash: 0, filter: 'all' });
      loadPlayers();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao adicionar recursos em massa'
      });
    } finally {
      setBulkLoading(false);
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

  const onlineCount = players.filter(p => p.isOnline).length;
  const offlineCount = players.filter(p => !p.isOnline).length;
  const bannedCount = players.filter(p => p.isBanned).length;

  // Auto-dismiss messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-indigo-900 via-purple-900 to-pink-900 rounded-xl p-6 mb-8 shadow-2xl border border-white/10"
      >
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 text-white">👥 Gerenciamento de Jogadores</h1>
            <p className="text-gray-300">Administre todos os jogadores do servidor</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">{onlineCount}</p>
              <p className="text-gray-400 text-sm">Online</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-400">{totalPlayers}</p>
              <p className="text-gray-400 text-sm">Total</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-400">{bannedCount}</p>
              <p className="text-gray-400 text-sm">Banidos</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mb-6 p-4 rounded-lg border ${
              message.type === 'success' 
                ? 'bg-green-900/50 border-green-500' 
                : 'bg-red-900/50 border-red-500'
            }`}
            onClick={() => setMessage(null)}
          >
            <p className="text-white font-semibold">{message.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Add Resources Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-yellow-900/50 via-orange-900/50 to-red-900/50 backdrop-blur-sm rounded-lg p-6 mb-6 border-2 border-yellow-500/50 shadow-xl"
      >
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">💰 Adicionar Recursos em Massa</h2>
            <p className="text-gray-300 text-sm">Adicione créditos ou cash para múltiplos usuários de uma vez</p>
          </div>
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 px-6 py-3 rounded-lg text-white font-bold transition-all transform hover:scale-105 shadow-lg"
          >
            🎁 Adicionar em Massa
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 mb-6 border border-gray-700 flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="🔍 Buscar por nome, email ou nickname..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 min-w-[250px] bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
        />
        
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as any);
            setPage(1);
          }}
          className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
        >
          <option value="all">Todos ({totalPlayers})</option>
          <option value="online">Online ({onlineCount})</option>
          <option value="offline">Offline ({offlineCount})</option>
          <option value="banned">Banidos ({bannedCount})</option>
        </select>
      </div>

      {/* Players Table */}
      {loading ? (
        <div className="text-center py-16 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-xl text-gray-400">Carregando jogadores...</p>
        </div>
      ) : filteredPlayers.length > 0 ? (
        <>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg overflow-hidden shadow-xl border border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-900 to-gray-800">
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
                      Stats
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Recursos
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filteredPlayers.map((player) => (
                    <motion.tr
                      key={player.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`hover:bg-gray-700/30 transition-colors ${
                        player.isBanned ? 'bg-red-900/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            player.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                          }`}></div>
                          <span className="text-sm font-medium text-gray-300">
                            {player.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <img
                            src={player.profileImage || player.avatar || '/images/default.png'}
                            alt={player.nickname || player.username}
                            className="w-10 h-10 rounded-full object-cover border-2 border-gray-600"
                          />
                          <div>
                            <p className="font-bold text-white cursor-pointer hover:text-purple-400 transition-colors"
                               onClick={() => loadPlayerDetails(player.id)}>
                              {player.clanTag ? `|${player.clanTag}| ${player.nickname || player.username}` : (player.nickname || player.username)}
                            </p>
                            <p className="text-sm text-gray-400">@{player.username}</p>
                            <p className="text-xs text-gray-500">ID: {player.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {player.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={player.role}
                          onChange={(e) => handleRoleChange(player.id, e.target.value)}
                          className={`bg-gray-700/50 border border-gray-600 rounded px-3 py-1 text-sm font-bold cursor-pointer transition-all hover:border-purple-500 ${
                            player.role === 'MASTER' ? 'text-red-400' :
                            player.role === 'ADMIN' ? 'text-yellow-400' :
                            'text-blue-400'
                          }`}
                        >
                          <option value="PLAYER">PLAYER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="MASTER">MASTER</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-green-400 font-semibold">{player.winsGeral || 0}V</span>
                            <span className="text-gray-500">/</span>
                            <span className="text-red-400 font-semibold">{player.lossesGeral || 0}D</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            Season: {player.winsSeason || 0}V / {player.lossesSeason || 0}D
                          </div>
                          <div className="text-xs text-purple-400">
                            ⭐ Score: {player.totalScore?.toFixed(1) || 0}
                          </div>
                          <div className="text-xs text-blue-400">
                            Lv.{player.level || 1} ({player.experience || 0} XP)
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="text-green-400">💰 {player.credits || 0}</div>
                          <div className="text-yellow-400">💵 {player.cash || 0}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => loadPlayerDetails(player.id)}
                            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded font-bold transition-colors text-xs"
                            title="Ver detalhes"
                          >
                            👁️
                          </button>
                          <button
                            onClick={() => openEditModal(player)}
                            className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded font-bold transition-colors text-xs"
                            title="Editar recursos"
                          >
                            ✏️
                          </button>
                          {player.isBanned ? (
                            <button
                              onClick={() => handleUnban(player.id)}
                              className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded font-bold transition-colors text-xs"
                              title={player.banReason ? `Motivo: ${player.banReason}` : 'Desbanir'}
                            >
                              ✅
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBan(player.id)}
                              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-bold transition-colors text-xs"
                            >
                              🚫
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(player.id)}
                            className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded font-bold transition-colors text-xs"
                            title="Excluir conta permanentemente (irreversível)"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-bold transition-colors"
              >
                ← Anterior
              </button>
              <span className="px-4 py-2 bg-gray-800 rounded-lg text-white font-bold">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-bold transition-colors"
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 bg-gray-800/50 rounded-lg border border-gray-700">
          <p className="text-6xl mb-4">👥</p>
          <p className="text-2xl text-gray-400 mb-2">Nenhum jogador encontrado</p>
          <p className="text-gray-500">Ajuste os filtros de busca</p>
        </div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700"
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-white">Detalhes do Jogador</h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <img
                    src={selectedPlayer.profileImage || selectedPlayer.avatar || '/images/default.png'}
                    alt={selectedPlayer.nickname || selectedPlayer.username}
                    className="w-20 h-20 rounded-full object-cover border-2 border-purple-500"
                  />
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {selectedPlayer.clanTag ? `|${selectedPlayer.clanTag}| ` : ''}
                      {selectedPlayer.nickname || selectedPlayer.username}
                    </h3>
                    <p className="text-gray-400">@{selectedPlayer.username}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Email</p>
                    <p className="text-white font-semibold">{selectedPlayer.email}</p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Role</p>
                    <p className="text-white font-semibold">{selectedPlayer.role}</p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Último IP</p>
                    <p className="text-white font-semibold font-mono">{selectedPlayer.lastIpAddress || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Último Login</p>
                    <p className="text-white font-semibold">
                      {selectedPlayer.lastLogin 
                        ? new Date(selectedPlayer.lastLogin).toLocaleString('pt-BR')
                        : 'Nunca'}
                    </p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Data de Criação</p>
                    <p className="text-white font-semibold">
                      {new Date(selectedPlayer.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Status</p>
                    <p className={`font-semibold ${selectedPlayer.isBanned ? 'text-red-400' : 'text-green-400'}`}>
                      {selectedPlayer.isBanned ? 'Banido' : 'Ativo'}
                    </p>
                    {selectedPlayer.isBanned && selectedPlayer.banReason && (
                      <p className="text-red-300 text-sm mt-1">Motivo: {selectedPlayer.banReason}</p>
                    )}
                  </div>
                </div>

                {selectedPlayer.ipHistory && selectedPlayer.ipHistory.length > 0 && (
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm mb-2">Histórico de IPs</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedPlayer.ipHistory.map((entry, idx) => (
                        <div key={idx} className="text-sm text-gray-300 font-mono">
                          {entry.ip} - {new Date(entry.timestamp).toLocaleString('pt-BR')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Resources Modal */}
      <AnimatePresence>
        {showEditModal && editingPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-700"
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-white">Editar Recursos</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Créditos</label>
                  <input
                    type="number"
                    value={editForm.credits}
                    onChange={(e) => setEditForm({ ...editForm, credits: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Cash</label>
                  <input
                    type="number"
                    value={editForm.cash}
                    onChange={(e) => setEditForm({ ...editForm, cash: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Nível</label>
                  <input
                    type="number"
                    value={editForm.level}
                    onChange={(e) => setEditForm({ ...editForm, level: parseInt(e.target.value) || 1 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleEditResources}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-white font-bold transition-colors"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Add Resources Modal */}
      <AnimatePresence>
        {showBulkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !bulkLoading && setShowBulkModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-700"
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-white">💰 Adicionar Recursos em Massa</h2>
                <button
                  onClick={() => !bulkLoading && setShowBulkModal(false)}
                  disabled={bulkLoading}
                  className="text-gray-400 hover:text-white text-2xl disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">💰 Créditos para adicionar</label>
                  <input
                    type="number"
                    min="0"
                    value={bulkForm.credits}
                    onChange={(e) => setBulkForm({ ...bulkForm, credits: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
                    placeholder="0"
                    disabled={bulkLoading}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">💵 Cash para adicionar</label>
                  <input
                    type="number"
                    min="0"
                    value={bulkForm.cash}
                    onChange={(e) => setBulkForm({ ...bulkForm, cash: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
                    placeholder="0"
                    disabled={bulkLoading}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">🎯 Filtro de Usuários</label>
                  <select
                    value={bulkForm.filter}
                    onChange={(e) => setBulkForm({ ...bulkForm, filter: e.target.value as any })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
                    disabled={bulkLoading}
                  >
                    <option value="all">Todos os usuários (não banidos)</option>
                    <option value="online">Apenas usuários online</option>
                    <option value="loggedToday">Usuários que logaram hoje</option>
                    <option value="loggedThisWeek">Usuários que logaram esta semana</option>
                    <option value="loggedThisMonth">Usuários que logaram este mês</option>
                  </select>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3 mt-4">
                  <p className="text-yellow-300 text-sm">
                    ⚠️ <strong>Atenção:</strong> Esta ação adicionará os recursos especificados para todos os usuários que correspondem ao filtro selecionado. A ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleBulkAddResources}
                    disabled={bulkLoading || (bulkForm.credits === 0 && bulkForm.cash === 0)}
                    className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-white font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {bulkLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        Processando...
                      </>
                    ) : (
                      '✅ Confirmar e Adicionar'
                    )}
                  </button>
                  <button
                    onClick={() => setShowBulkModal(false)}
                    disabled={bulkLoading}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg text-white font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
