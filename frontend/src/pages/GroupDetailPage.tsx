import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Group {
  id: string;
  name: string;
  tag: string;
  description: string;
  logo: string;
  banner?: string;
  totalScore: number;
  seasonScore?: number;
  level?: number;
  totalCash?: number;
  credits?: number;
  totalWins?: number;
  totalLosses?: number;
  winsSeason?: number;
  lossesSeason?: number;
  totalAchievements?: number;
  memberCount?: number;
  maxMembers: number;
  isPublic: boolean;
  isActive: boolean;
  leader: {
    id: string;
    nickname: string;
    clanTag?: string;
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
    clanTag?: string;
    winsSeason?: number;
    lossesSeason?: number;
  };
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'weekly' | 'season' | 'total'>('weekly');
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    tag: '',
    description: '',
    isPublic: true,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [editError, setEditError] = useState('');


  useEffect(() => {
    if (id) {
      fetchGroupDetails();
      fetchRanking('weekly');
      fetchAchievements();
    }
  }, [id]);

  const fetchAchievements = async () => {
    if (!id) return;
    try {
      const response = await axios.get(`${API_URL}/groups/${id}/achievements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAchievements(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar conquistas do grupo:', error);
      setAchievements([]);
    }
  };

  // Calcular se é membro
  const userId = user?.id ? (typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)) : null;
  const leaderId = group?.leader?.id ? (typeof group.leader.id === 'string' ? parseInt(group.leader.id, 10) : Number(group.leader.id)) : null;
  const isLeader = userId !== null && leaderId !== null && userId === leaderId;
  const isMember = userId !== null && members.some(m => {
    const memberId = m.user?.id ? (typeof m.user.id === 'string' ? parseInt(m.user.id, 10) : Number(m.user.id)) : null;
    return memberId !== null && userId === memberId;
  });


  const fetchGroupDetails = async () => {
    try {
      const response = await axios.get(`${API_URL}/groups/${id}`, {
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
      const response = await axios.get(`${API_URL}/groups/${id}/ranking/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers(response.data);
      setActiveTab(type);
    } catch (error) {
      console.error('Erro ao buscar ranking:', error);
    }
  };


  const handleJoinGroup = async () => {
    if (!id) return;
    
    try {
      await axios.post(
        `${API_URL}/groups/join/${id}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Buscar dados atualizados do usuário após entrar no grupo
      try {
        const userResponse = await axios.get(
          `${API_URL}/users/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        console.log('🔄 [joinGroup] Dados do usuário recebidos:', userResponse.data);
        if (userResponse.data) {
          const updatedUser = { ...user, ...userResponse.data };
          console.log('✅ [joinGroup] Atualizando store com clanTag:', updatedUser.clanTag);
          useAuthStore.setState({
            user: updatedUser,
          });
        }
      } catch (err) {
        console.error('❌ Erro ao buscar dados do usuário:', err);
      }
      
      alert('Você entrou no clã!');
      // Recarregar dados do grupo para atualizar a lista de membros
      await fetchGroupDetails();
      await fetchRanking(activeTab);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao entrar no clã');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Tem certeza que deseja sair do grupo?')) return;

    try {
      await axios.delete(`${API_URL}/groups/leave/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Buscar dados atualizados do usuário após sair do grupo
      try {
        const userResponse = await axios.get(
          `${API_URL}/users/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        console.log('🔄 [leaveGroup] Dados do usuário recebidos:', userResponse.data);
        if (userResponse.data) {
          const updatedUser = { ...user, ...userResponse.data };
          console.log('✅ [leaveGroup] Atualizando store com clanTag:', updatedUser.clanTag);
          useAuthStore.setState({
            user: updatedUser,
          });
        }
      } catch (err) {
        console.error('❌ Erro ao buscar dados do usuário:', err);
      }
      
      alert('Você saiu do grupo!');
      navigate('/groups');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao sair do grupo');
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await axios.delete(`${API_URL}/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Grupo excluído com sucesso!');
      navigate('/groups');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao excluir grupo');
    }
  };

  const handlePromoteMember = async (memberUserId: number, role: 'CO_LEADER' | 'ELDER') => {
    if (!confirm(`Tem certeza que deseja promover este membro a ${role === 'CO_LEADER' ? 'Co-Líder' : 'Veterano'}?`)) {
      return;
    }

    try {
      await axios.post(
        `${API_URL}/groups/${id}/promote/${memberUserId}`,
        { role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Membro promovido com sucesso!');
      await fetchGroupDetails();
      await fetchRanking(activeTab);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao promover membro');
    }
  };

  const handleDemoteMember = async (memberUserId: number) => {
    if (!confirm('Tem certeza que deseja rebaixar este membro a Membro?')) {
      return;
    }

    try {
      await axios.post(
        `${API_URL}/groups/${id}/demote/${memberUserId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Membro rebaixado com sucesso!');
      await fetchGroupDetails();
      await fetchRanking(activeTab);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao rebaixar membro');
    }
  };

  const handleOpenEditModal = () => {
    if (group) {
      setEditFormData({
        name: group.name,
        tag: group.tag,
        description: group.description || '',
        isPublic: group.isPublic,
      });
      setLogoPreview(group.logo ? `${API_URL}${group.logo}` : null);
      setBannerPreview(group.banner ? `${API_URL}${group.banner}` : null);
      setLogoFile(null);
      setBannerFile(null);
      setEditError('');
      setShowEditModal(true);
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');

    // Validações
    if (editFormData.name.length < 3) {
      setEditError('Nome deve ter pelo menos 3 caracteres');
      return;
    }
    if (editFormData.tag.length < 2 || editFormData.tag.length > 6) {
      setEditError('Tag deve ter entre 2 e 6 caracteres');
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', editFormData.name);
      formDataToSend.append('tag', editFormData.tag.toUpperCase());
      if (editFormData.description) {
        formDataToSend.append('description', editFormData.description);
      }
      formDataToSend.append('isPublic', editFormData.isPublic.toString());
      if (logoFile) {
        formDataToSend.append('logo', logoFile);
      }
      if (bannerFile) {
        formDataToSend.append('banner', bannerFile);
      }

      await axios.put(
        `${API_URL}/groups/${id}`,
        formDataToSend,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Recarregar dados do grupo
      await fetchGroupDetails();
      setShowEditModal(false);
      alert('Grupo atualizado com sucesso!');
    } catch (error: any) {
      setEditError(error.response?.data?.message || 'Erro ao atualizar grupo');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative z-10">
        <div className="text-white text-2xl">Carregando...</div>
      </div>
    );
  }

  if (!group) {
    return null;
  }

  return (
    <div className="min-h-screen p-8 relative z-10">
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

          <div className="relative rounded-2xl overflow-hidden border border-purple-500/50 shadow-2xl">
            {/* Banner como background */}
            {group.banner && (
              <div className="absolute inset-0 z-0">
                <img
                  src={`${API_URL}${group.banner}`}
                  alt={`Banner de ${group.name}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/80"></div>
              </div>
            )}
            
            {/* Conteúdo sobre o banner */}
            <div className={`relative z-10 p-8 ${group.banner ? '' : 'bg-slate-900/30'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Logo e Nome do Grupo no topo */}
                  <div className="flex items-center gap-4 mb-4">
                    {/* Logo do Grupo */}
                    {group.logo ? (
                      <img 
                        src={`${API_URL}${group.logo}`}
                        alt={group.name}
                        className="w-24 h-24 rounded-2xl object-cover border-2 border-purple-500 shadow-lg"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={`w-24 h-24 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center text-4xl font-bold text-white shadow-lg ${group.logo ? 'hidden' : ''}`}>
                      {group.tag}
                    </div>

                    {/* Nome do Grupo */}
                    <div>
                      <h1 className="text-4xl font-bold text-white">
                        |{group.tag}| {group.name}
                      </h1>
                    </div>
                  </div>

                  {/* Info do Grupo */}
                  <div>
                  {/* Calcular winsSeason e lossesSeason a partir dos membros */}
                  {(() => {
                    const seasonWins = members.reduce((sum, member) => sum + (member.user?.winsSeason || 0), 0);
                    const seasonLosses = members.reduce((sum, member) => sum + (member.user?.lossesSeason || 0), 0);
                    return (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">Membros</div>
                            <div className="text-white font-bold text-lg">
                              {group.memberCount || members.length}/{group.maxMembers}
                            </div>
                          </div>
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">Nível</div>
                            <div className="text-purple-400 font-bold text-lg">
                              {group.level || 1}
                            </div>
                          </div>
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">Score Geral</div>
                            <div className="text-yellow-400 font-bold text-lg">
                              {group.totalScore?.toLocaleString() || 0}
                            </div>
                          </div>
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">Score Season</div>
                            <div className="text-blue-400 font-bold text-lg">
                              {(group.seasonScore || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">Crédito</div>
                            <div className="text-yellow-400 font-bold text-lg">
                              {(group.credits || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">Cash</div>
                            <div className="text-green-400 font-bold text-lg">
                              {(group.totalCash || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">V/D Season</div>
                            <div className="text-white font-bold text-lg">
                              <span className="text-green-400">{seasonWins}</span> / <span className="text-red-400">{seasonLosses}</span>
                            </div>
                          </div>
                          <div className="bg-slate-900/30  rounded-lg p-3 border border-white/10">
                            <div className="text-xs text-slate-400 mb-1">V/D Geral</div>
                            <div className="text-white font-bold text-lg">
                              <span className="text-green-400">{group.totalWins || 0}</span> / <span className="text-red-400">{group.totalLosses || 0}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex items-center gap-4 mb-3">
                    <span className={`text-sm px-3 py-1 rounded ${
                      group.isPublic
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {group.isPublic ? '🌍 Público' : '🔒 Privado'}
                    </span>
                    <span className="text-purple-400 font-bold">
                      🏆 {group.totalAchievements || 0} Conquistas
                    </span>
                  </div>
                  <p className="text-slate-300">{group.description || 'Sem descrição'}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-slate-400 text-sm">
                      👑 Fundador: <Link to={`/profile/${group.leader.id}`} className="text-white font-semibold hover:text-purple-400 transition-colors cursor-pointer">
                        {group.leader.clanTag ? `|${group.leader.clanTag}| ${group.leader.nickname}` : group.leader.nickname}
                      </Link>
                    </p>
                    <div className="bg-slate-900/30 rounded-lg p-3 border border-white/10">
                      <div className="text-xs text-slate-400 mb-1">Fundado em</div>
                      <div className="text-white font-bold text-sm">
                        {group.createdAt ? new Date(group.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        }) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-3">
                {!isMember && !user?.group && !user?.clanTag && (
                  <button
                    onClick={handleJoinGroup}
                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold hover:from-green-700 hover:to-emerald-700 transition-colors shadow-lg shadow-green-500/30"
                  >
                    ✨ Entrar no Clã
                  </button>
                )}
                {isMember && !isLeader && (
                  <button
                    onClick={handleLeaveGroup}
                    className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                  >
                    Sair do Grupo
                  </button>
                )}
                {isLeader && (
                  <>
                    <button
                      onClick={handleOpenEditModal}
                      className="p-3 text-white hover:text-blue-400 transition-colors flex items-center justify-center text-2xl"
                      title="Editar Grupo"
                    >
                      ⚙️
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="p-3 text-white hover:text-red-400 transition-colors flex items-center justify-center text-2xl"
                      title="Excluir Grupo"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Conquistas do Grupo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 bg-slate-900/30  rounded-2xl p-8 border border-purple-500/50 shadow-2xl"
        >
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            🏆 Conquistas do Clã
          </h2>
          {achievements.length === 0 ? (
            <p className="text-gray-400">Nenhuma conquista desbloqueada ainda.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className="p-3 rounded-lg border border-white/20 hover:border-white/40 transition-colors bg-slate-900/30 flex flex-col items-center text-center"
                >
                  {/* Imagem da conquista - maior destaque */}
                  {achievement.icon && (
                    <img
                      src={`${API_URL}${achievement.icon}`}
                      alt={achievement.title}
                      className="w-24 h-24 object-contain mb-2"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default_achievement.png';
                      }}
                    />
                  )}
                  
                  {/* Título da conquista */}
                  <div className="text-white font-semibold text-xs mb-1 line-clamp-2">{achievement.title}</div>
                  
                  {/* Descrição da conquista */}
                  {achievement.description && (
                    <div className="text-xs text-slate-400 mb-2 line-clamp-2">{achievement.description}</div>
                  )}
                  
                  {/* Informações do usuário que desbloqueou */}
                  <div className="mt-auto pt-2 border-t border-white/10 w-full">
                    <div className="flex items-center gap-1.5 justify-center mb-1">
                      <img
                        src={achievement.user?.profileImage ? `${API_URL}${achievement.user.profileImage}` : '/images/default.png'}
                        alt={achievement.user?.nickname || 'Usuário'}
                        className="w-5 h-5 rounded-full border border-purple-500/50 object-cover flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = '/images/default.png';
                        }}
                      />
                      <p className="text-xs text-slate-300 truncate">
                        <Link to={`/profile/${achievement.user?.id}`} className="hover:text-purple-400 transition-colors cursor-pointer">
                          {achievement.user?.clanTag ? `|${achievement.user.clanTag}| ` : ''}{achievement.user?.nickname || 'Usuário'}
                        </Link>
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 text-center">
                      {new Date(achievement.unlockedAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Tabs de Ranking */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => fetchRanking('weekly')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'weekly'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-900/30  text-slate-400 hover:bg-slate-900/50 border border-white/20'
            }`}
          >
            📅 Ranking Semanal
          </button>
          <button
            onClick={() => fetchRanking('season')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'season'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-900/30  text-slate-400 hover:bg-slate-900/50 border border-white/20'
            }`}
          >
            🏆 Ranking da Season
          </button>
          <button
            onClick={() => {
              setActiveTab('total');
              fetchRanking('total');
            }}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'total'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-900/30  text-slate-400 hover:bg-slate-900/50 border border-white/20'
            }`}
          >
            ⭐ Ranking Total
          </button>
        </div>

        {/* Ranking de Membros */}
        {(
        <div className="bg-slate-900/30  rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/30 ">
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
                      className="border-t border-slate-700/50 hover:bg-slate-900/30 transition-colors"
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
                            src={`${API_URL}${member.user.profileImage}`}
                            alt={member.user.nickname}
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/images/default.png';
                            }}
                          />
                          <div>
                            <Link to={`/profile/${member.user.id}`} className="text-white font-semibold hover:text-purple-400 transition-colors cursor-pointer block">
                              {member.user.clanTag ? `|${member.user.clanTag}| ${member.user.nickname}` : member.user.nickname}
                            </Link>
                            <p className="text-slate-400 text-sm">Nível {member.user.level || 0}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
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
                          {isLeader && member.role !== 'LEADER' && (
                            <div className="flex gap-1">
                              {member.role !== 'CO_LEADER' && (
                                <button
                                  onClick={() => handlePromoteMember(member.user.id, 'CO_LEADER')}
                                  className="px-2 py-1 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 rounded text-xs transition-colors"
                                  title="Promover a Co-Líder"
                                >
                                  ⭐
                                </button>
                              )}
                              {member.role !== 'ELDER' && member.role !== 'CO_LEADER' && (
                                <button
                                  onClick={() => handlePromoteMember(member.user.id, 'ELDER')}
                                  className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded text-xs transition-colors"
                                  title="Promover a Veterano"
                                >
                                  💎
                                </button>
                              )}
                              {(member.role === 'CO_LEADER' || member.role === 'ELDER') && (
                                <button
                                  onClick={() => handleDemoteMember(member.user.id)}
                                  className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs transition-colors"
                                  title="Rebaixar a Membro"
                                >
                                  ⬇️
                                </button>
                              )}
                            </div>
                          )}
                        </div>
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
        )}
      </div>

      {/* Modal de Edição */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900/80  rounded-2xl p-8 max-w-2xl w-full border border-purple-500/50 shadow-2xl my-8"
          >
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="text-4xl">⚙️</span>
              Editar Grupo
            </h2>

            <form onSubmit={handleUpdateGroup} className="space-y-4">
              {/* Nome do Grupo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="Ex: Dragões Supremos"
                  className="w-full px-4 py-3 bg-slate-900/30  border border-slate-700/50 rounded-xl text-white focus:border-purple-500 focus:outline-none"
                  required
                />
              </div>

              {/* Tag do Grupo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Tag (2-6 caracteres)
                </label>
                <input
                  type="text"
                  value={editFormData.tag}
                  onChange={(e) => setEditFormData({ ...editFormData, tag: e.target.value.toUpperCase() })}
                  placeholder="Ex: DRAG"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white uppercase focus:border-purple-500 focus:outline-none"
                  required
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Descrição (opcional)
                </label>
                <textarea
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  placeholder="Descreva seu grupo..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none resize-none"
                />
              </div>

              {/* Logo do Clã */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Logo do Clã (opcional)
                </label>
                {logoPreview && (
                  <div className="mb-3">
                    <img 
                      src={logoPreview} 
                      alt="Preview do logo" 
                      className="w-24 h-24 object-cover rounded-lg border-2 border-purple-500"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setLogoFile(file);
                      setLogoPreview(URL.createObjectURL(file));
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                <p className="text-slate-400 text-sm mt-1">Deixe em branco para manter o logo atual</p>
              </div>

              {/* Banner do Clã */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Banner do Clã (opcional)
                </label>
                {bannerPreview && (
                  <div className="mb-3">
                    <img 
                      src={bannerPreview} 
                      alt="Preview do banner" 
                      className="w-full h-32 object-cover rounded-lg border-2 border-purple-500"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBannerFile(file);
                      setBannerPreview(URL.createObjectURL(file));
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                <p className="text-slate-400 text-sm mt-1">Deixe em branco para manter o banner atual</p>
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Tipo do Grupo
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, isPublic: true })}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      editFormData.isPublic
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-900/30  text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    🌍 Público
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, isPublic: false })}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      !editFormData.isPublic
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-900/30  text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    🔒 Privado
                  </button>
                </div>
              </div>

              {/* Erro */}
              {editError && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-xl">
                  {editError}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditError('');
                    setLogoFile(null);
                    setBannerFile(null);
                  }}
                  className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:scale-105 transition-transform"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900/80  rounded-2xl p-8 max-w-md w-full border border-red-500/50 shadow-2xl"
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
