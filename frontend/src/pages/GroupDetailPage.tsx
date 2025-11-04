import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface Group {
  id: string;
  name: string;
  tag: string;
  description: string;
  logo: string;
  totalScore: number;
  maxMembers: number;
  isPublic: boolean;
  isActive: boolean;
  leader: {
    id: string;
    nickname: string;
  };
  createdAt: string;
}

interface GroupMember {
  id: string;
  weeklyScore: number;
  seasonScore: number;
  totalScore: number;
  contributedWins: number;
  contributedLosses: number;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    nickname: string;
    profileImage: string;
    level: number;
  };
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [activeTab, setActiveTab] = useState<'weekly' | 'season' | 'total'>('weekly');
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (id) {
      fetchGroupDetails();
      fetchRanking('weekly');
    }
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroup(response.data);
    } catch (error) {
      console.error('Erro ao buscar grupo:', error);
      navigate('/groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchRanking = async (type: 'weekly' | 'season' | 'total') => {
    try {
      const response = await axios.get(`http://localhost:3000/groups/${id}/ranking/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers(response.data);
      setActiveTab(type);
    } catch (error) {
      console.error('Erro ao buscar ranking:', error);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Tem certeza que deseja sair do grupo?')) return;

    try {
      await axios.delete(`http://localhost:3000/groups/leave/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Você saiu do grupo!');
      navigate('/groups');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao sair do grupo');
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await axios.delete(`http://localhost:3000/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Grupo excluído com sucesso!');
      navigate('/groups');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao excluir grupo');
    }
  };

  const isLeader = group?.leader.id === user?.id;
  const isMember = members.some(m => m.user.id === user?.id);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl">Carregando...</div>
      </div>
    );
  }

  if (!group) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link to="/groups" className="text-slate-400 hover:text-white mb-4 inline-flex items-center gap-2">
            ← Voltar para Grupos
          </Link>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 border border-purple-500/50 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-6">
                {/* Tag do Grupo */}
                <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center text-4xl font-bold text-white shadow-lg">
                  {group.tag}
                </div>

                {/* Info do Grupo */}
                <div>
                  <h1 className="text-4xl font-bold text-white mb-2">{group.name}</h1>
                  <div className="flex items-center gap-4 mb-3">
                    <span className={`text-sm px-3 py-1 rounded ${
                      group.isPublic
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {group.isPublic ? '🌍 Público' : '🔒 Privado'}
                    </span>
                    <span className="text-slate-400">
                      👥 {members.length}/{group.maxMembers} membros
                    </span>
                    <span className="text-yellow-400 font-bold">
                      🏆 {group.totalScore.toLocaleString()} pontos
                    </span>
                  </div>
                  <p className="text-slate-300">{group.description || 'Sem descrição'}</p>
                  <p className="text-slate-400 text-sm mt-2">
                    👑 Líder: <span className="text-white font-semibold">{group.leader.nickname}</span>
                  </p>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-3">
                {isMember && !isLeader && (
                  <button
                    onClick={handleLeaveGroup}
                    className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                  >
                    Sair do Grupo
                  </button>
                )}
                {isLeader && (
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                  >
                    🗑️ Excluir Grupo
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs de Ranking */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => fetchRanking('weekly')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'weekly'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            📅 Ranking Semanal
          </button>
          <button
            onClick={() => fetchRanking('season')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'season'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🏆 Ranking da Season
          </button>
          <button
            onClick={() => fetchRanking('total')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'total'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            ⭐ Ranking Total
          </button>
        </div>

        {/* Ranking de Membros */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-6 py-4 text-left text-slate-400 font-semibold">#</th>
                  <th className="px-6 py-4 text-left text-slate-400 font-semibold">Membro</th>
                  <th className="px-6 py-4 text-left text-slate-400 font-semibold">Cargo</th>
                  <th className="px-6 py-4 text-right text-slate-400 font-semibold">Pontuação</th>
                  <th className="px-6 py-4 text-right text-slate-400 font-semibold">V/D</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Nenhum membro encontrado
                    </td>
                  </tr>
                ) : (
                  members.map((member, index) => (
                    <motion.tr
                      key={member.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-t border-slate-700/50 hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className={`text-2xl font-bold ${
                          index === 0 ? 'text-yellow-400' :
                          index === 1 ? 'text-slate-300' :
                          index === 2 ? 'text-orange-600' :
                          'text-slate-500'
                        }`}>
                          {index + 1}°
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={`http://localhost:3000${member.user.profileImage}`}
                            alt={member.user.nickname}
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/avatars/default.png';
                            }}
                          />
                          <div>
                            <p className="text-white font-semibold">{member.user.nickname}</p>
                            <p className="text-slate-400 text-sm">Nível {member.user.level || 0}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded text-sm font-semibold ${
                          member.role === 'LEADER' ? 'bg-yellow-500/20 text-yellow-400' :
                          member.role === 'CO_LEADER' ? 'bg-orange-500/20 text-orange-400' :
                          member.role === 'ELDER' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-slate-700/50 text-slate-300'
                        }`}>
                          {member.role === 'LEADER' ? '👑 Líder' :
                           member.role === 'CO_LEADER' ? '⭐ Co-Líder' :
                           member.role === 'ELDER' ? '💎 Veterano' :
                           '👤 Membro'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xl font-bold text-yellow-400">
                          {(activeTab === 'weekly' ? member.weeklyScore :
                            activeTab === 'season' ? member.seasonScore :
                            member.totalScore).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-white font-semibold">
                          {member.contributedWins} / {member.contributedLosses}
                        </span>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 max-w-md w-full border border-red-500/50 shadow-2xl"
          >
            <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-4xl">⚠️</span>
              Excluir Grupo?
            </h2>
            
            <p className="text-slate-300 mb-6">
              Tem certeza que deseja excluir o grupo <span className="font-bold text-white">{group.name}</span>?
              Esta ação é irreversível e todos os membros serão removidos.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteGroup}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                Excluir
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
