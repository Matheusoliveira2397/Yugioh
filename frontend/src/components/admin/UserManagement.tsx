import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface User {
  id: string;
  nickname: string;
  username: string;
  email: string;
  role: string;
  winsGeral: number;
  lossesGeral: number;
  winsSeason: number;
  lossesSeason: number;
  isOnline: boolean;
  lastIpAddress?: string;
  isBanned: boolean;
  banReason?: string;
  createdAt: string;
  lastLogin?: string;
}

interface IPHistory {
  ip: string;
  timestamp: string;
  location?: string;
}

export default function UserManagement() {
  const { token } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [ipHistory, setIpHistory] = useState<IPHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'all' | 'online'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (view === 'all') {
      fetchAllUsers();
    } else {
      fetchOnlineUsers();
    }
  }, [view, page]);

  const fetchAllUsers = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(
        `${API_URL}/admin/users?page=${page}&limit=20`,
        { headers }
      );
      setUsers(response.data.users);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOnlineUsers = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_URL}/admin/users/online`, { headers });
      setOnlineUsers(response.data.users);
    } catch (error) {
      console.error('Erro ao buscar usuários online:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string | number) => {
    try {
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
      if (isNaN(userIdNum)) {
        console.error('ID de usuário inválido:', userId);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const detailsRes = await axios.get(`${API_URL}/admin/users/${userIdNum}`, { headers });
      setSelectedUser(detailsRes.data);
      try {
        const ipRes = await axios.get(`${API_URL}/admin/users/${userIdNum}/ip-history`, { headers });
        const list = Array.isArray(ipRes.data) ? ipRes.data : (ipRes.data?.ipHistory ?? []);
        setIpHistory(list);
      } catch {
        setIpHistory([]);
      }
    } catch (error) {
      console.error('Erro ao buscar detalhes:', error);
    }
  };

  const handleBanUser = async (userId: string | number) => {
    const reason = prompt('Motivo do banimento:');
    if (!reason) return;

    try {
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
      if (isNaN(userIdNum)) {
        console.error('ID de usuário inválido:', userId);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API_URL}/admin/users/${userIdNum}/ban`, {
        headers,
        data: { reason },
      });
      alert('Usuário banido com sucesso!');
      fetchAllUsers();
    } catch (error) {
      console.error('Erro ao banir usuário:', error);
      alert('Erro ao banir usuário');
    }
  };

  const handleUnbanUser = async (userId: string | number) => {
    try {
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
      if (isNaN(userIdNum)) {
        console.error('ID de usuário inválido:', userId);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`${API_URL}/admin/users/${userIdNum}/unban`, {}, { headers });
      alert('Usuário desbanido com sucesso!');
      fetchAllUsers();
    } catch (error) {
      console.error('Erro ao desbanir usuário:', error);
      alert('Erro ao desbanir usuário');
    }
  };

  const handlePromote = async (userId: string | number, role: 'ADMIN' | 'MASTER') => {
    if (!confirm(`Promover usuário para ${role}?`)) return;

    try {
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
      if (isNaN(userIdNum)) {
        console.error('ID de usuário inválido:', userId);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(
        `${API_URL}/admin/users/${userIdNum}/promote/${role.toLowerCase()}`,
        {},
        { headers }
      );
      alert(`Usuário promovido para ${role}!`);
      fetchAllUsers();
    } catch (error) {
      console.error('Erro ao promover usuário:', error);
      alert('Erro ao promover usuário');
    }
  };

  const handleDemote = async (userId: string | number) => {
    if (!confirm('Rebaixar usuário para PLAYER?')) return;

    try {
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
      if (isNaN(userIdNum)) {
        console.error('ID de usuário inválido:', userId);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`${API_URL}/admin/users/${userIdNum}/demote`, {}, { headers });
      alert('Usuário rebaixado para PLAYER!');
      fetchAllUsers();
    } catch (error) {
      console.error('Erro ao rebaixar usuário:', error);
      alert('Erro ao rebaixar usuário');
    }
  };

  const handleDeleteUser = async (userId: string | number) => {
    const user = displayUsers.find(u => u.id === userId);
    const userName = user ? (user.nickname || user.username) : 'este usuário';
    
    const confirmMessage = `⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!\n\n` +
      `Você está prestes a excluir permanentemente a conta de ${userName}.\n\n` +
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
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
      if (isNaN(userIdNum)) {
        console.error('ID de usuário inválido:', userId);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.delete(`${API_URL}/admin/users/${userIdNum}`, { headers });
      alert(`Usuário ${userName} excluído permanentemente! Dados excluídos: ${JSON.stringify(response.data.deletedCounts)}`);
      if (view === 'all') {
        fetchAllUsers();
      } else {
        fetchOnlineUsers();
      }
    } catch (error: any) {
      console.error('Erro ao excluir usuário:', error);
      alert(error.response?.data?.message || 'Erro ao excluir usuário');
    }
  };

  const displayUsers = view === 'all' ? users : onlineUsers;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">👥 Gerenciar Usuários</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView('all')}
            className={`px-4 py-2 rounded-lg font-bold transition ${
              view === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setView('online')}
            className={`px-4 py-2 rounded-lg font-bold transition ${
              view === 'online'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            🟢 Online
          </button>
        </div>
      </div>

      {/* Modal de Detalhes do Usuário */}
      {selectedUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold mb-4">
              Detalhes: {selectedUser.nickname}
            </h3>
            
            <div className="space-y-2 mb-4">
              <p><strong>Email:</strong> {selectedUser.email}</p>
              <p><strong>Username:</strong> {selectedUser.username}</p>
              <p><strong>Role:</strong> <span className="text-yellow-400">{selectedUser.role}</span></p>
              <p><strong>Nível:</strong> {selectedUser.level || 1}</p>
              <p><strong>Score:</strong> {selectedUser.totalScore?.toFixed(1) || 0}</p>
              <p><strong>Vitórias/Derrotas (Geral):</strong> {selectedUser.winsGeral || 0}/{selectedUser.lossesGeral || 0}</p>
              <p><strong>Vitórias/Derrotas (Season):</strong> {selectedUser.winsSeason || 0}/{selectedUser.lossesSeason || 0}</p>
              <p><strong>Último IP:</strong> <span className="text-blue-400 font-mono">{selectedUser.lastIpAddress || 'N/A'}</span></p>
              <p><strong>Status:</strong> {selectedUser.isOnline ? '🟢 Online' : '⚫ Offline'}</p>
              {selectedUser.isBanned && (
                <p className="text-red-400">
                  <strong>BANIDO:</strong> {selectedUser.banReason}
                </p>
              )}
            </div>

            <div className="mb-4">
              <h4 className="font-bold mb-2">📍 Histórico de IPs</h4>
              <div className="bg-gray-900 rounded-lg p-3 max-h-52 overflow-y-auto">
                {ipHistory.length > 0 ? (
                  ipHistory.map((entry, index) => (
                    <div key={index} className="text-sm mb-1.5 flex flex-wrap items-center gap-x-2">
                      <span className="text-blue-400 font-mono break-all">{entry.ip}</span>
                      <span className="text-gray-500 text-xs">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">
                    {selectedUser.lastIpAddress ? (
                      <>
                        Último IP registrado:{' '}
                        <span className="text-blue-400 font-mono">{selectedUser.lastIpAddress}</span>
                        <span className="block text-xs text-gray-500 mt-1">
                          (Histórico em Redis vazio; novos logins passarão a preencher.)
                        </span>
                      </>
                    ) : (
                      'Nenhum IP registrado.'
                    )}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedUser(null)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      )}

      {/* Lista de Usuários */}
      {loading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : (
        <>
          <div className="grid gap-4">
            {displayUsers.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-gray-800 rounded-lg p-4 ${
                  user.isBanned ? 'border-2 border-red-500' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold">{user.nickname}</h3>
                      {user.isOnline && <span className="text-green-400">�</span>}
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        user.role === 'MASTER' ? 'bg-red-600' :
                        user.role === 'ADMIN' ? 'bg-purple-600' :
                        'bg-gray-600'
                      }`}>
                        {user.role}
                      </span>
                      {user.isBanned && (
                        <span className="bg-red-600 px-2 py-1 rounded text-xs font-bold">
                          BANIDO
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      {user.email} • Nível: {user.level || 1} • Score: {user.totalScore?.toFixed(1) || 0} • {user.winsGeral || 0}V/{user.lossesGeral || 0}D
                    </p>
                    {user.lastIpAddress && (
                      <p className="text-sm font-mono">
                        IP:{' '}
                        <button
                          type="button"
                          onClick={() => fetchUserDetails(user.id)}
                          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                          title="Clique para ver histórico de IPs desta conta"
                        >
                          {user.lastIpAddress}
                        </button>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => fetchUserDetails(user.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                    >
                      👁️ Ver
                    </button>
                    {!user.isBanned ? (
                      <button
                        onClick={() => handleBanUser(user.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                      >
                        🔨 Banir
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnbanUser(user.id)}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                      >
                        ✅ Desbanir
                      </button>
                    )}
                    {user.role === 'PLAYER' && (
                      <>
                        <button
                          onClick={() => handlePromote(user.id, 'ADMIN')}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm"
                        >
                          ⬆️ Admin
                        </button>
                        <button
                          onClick={() => handlePromote(user.id, 'MASTER')}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                        >
                          👑 Master
                        </button>
                      </>
                    )}
                    {user.role !== 'PLAYER' && (
                      <button
                        onClick={() => handleDemote(user.id)}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm"
                      >
                        ⬇️ Rebaixar
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="bg-red-800 hover:bg-red-900 text-white px-3 py-1 rounded text-sm"
                      title="Excluir conta permanentemente (irreversível)"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Paginação */}
          {view === 'all' && totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white px-4 py-2 rounded"
              >
                ← Anterior
              </button>
              <span className="px-4 py-2">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white px-4 py-2 rounded"
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
