import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
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
  totalCash?: number;
  totalWins?: number;
  totalLosses?: number;
  totalAchievements?: number;
  maxMembers: number;
  isPublic: boolean;
  memberCount?: number;
}

interface RankedGroup {
  rank: number;
  id: string;
  name: string;
  tag: string;
  logo: string;
  banner?: string;
  totalCash: number;
  totalWins: number;
  totalLosses: number;
  totalAchievements: number;
  seasonScore?: number;
  totalScore?: number;
  memberCount: number;
  leader: {
    nickname: string;
    profileImage: string;
  };
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [seasonRanking, setSeasonRanking] = useState<RankedGroup[]>([]);
  const [generalRanking, setGeneralRanking] = useState<RankedGroup[]>([]);
  const [activeTab, setActiveTab] = useState<'season' | 'general'>('season');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [filterPublic, setFilterPublic] = useState<boolean | undefined>(undefined);
  const { token, user } = useAuthStore();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    tag: '',
    description: '',
    isPublic: true,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchGroups();
    fetchRankings();
  }, [filterPublic]);

  const fetchRankings = async () => {
    try {
      setLoadingRankings(true);
      const headers = { Authorization: `Bearer ${token}` };
      
      const [seasonRes, generalRes] = await Promise.all([
        axios.get(`${API_URL}/groups/ranking/season`, { headers }),
        axios.get(`${API_URL}/groups/ranking/general`, { headers }),
      ]);
      
      setSeasonRanking(seasonRes.data || []);
      setGeneralRanking(generalRes.data || []);
    } catch (error) {
      console.error('Erro ao buscar rankings:', error);
    } finally {
      setLoadingRankings(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const params = filterPublic !== undefined ? { public: filterPublic } : {};
      const response = await axios.get(`${API_URL}/groups/all`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups(response.data);
    } catch (error) {
      console.error('Erro ao buscar grupos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validações
    if (formData.name.length < 3) {
      setFormError('Nome deve ter pelo menos 3 caracteres');
      return;
    }
    if (formData.tag.length < 2 || formData.tag.length > 6) {
      setFormError('Tag deve ter entre 2 e 6 caracteres');
      return;
    }
    if (!logoFile) {
      setFormError('A logo do clã é obrigatória');
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('tag', formData.tag.toUpperCase());
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (logoFile) {
        formDataToSend.append('logo', logoFile);
      }
      if (bannerFile) {
        formDataToSend.append('banner', bannerFile);
      }

      const response = await axios.post(
        `${API_URL}/groups/create`,
        formDataToSend,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Buscar dados atualizados do usuário após criar o grupo
      try {
        const userResponse = await axios.get(
          `${API_URL}/users/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        console.log('🔄 [createGroup] Dados do usuário recebidos:', userResponse.data);
        if (userResponse.data) {
          const updatedUser = { ...user, ...userResponse.data };
          console.log('✅ [createGroup] Atualizando store com clanTag:', updatedUser.clanTag);
          useAuthStore.setState({
            user: updatedUser,
          });
        }
      } catch (err) {
        console.error('❌ Erro ao buscar dados do usuário:', err);
      }

      // Resetar form e fechar modal
      setFormData({ name: '', tag: '', description: '', isPublic: true });
      setLogoFile(null);
      setBannerFile(null);
      setLogoPreview(null);
      setBannerPreview(null);
      setShowCreateModal(false);
      fetchGroups();
    } catch (error: any) {
      setFormError(error.response?.data?.message || 'Erro ao criar grupo');
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      await axios.post(
        `${API_URL}/groups/join/${groupId}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Buscar dados atualizados do usuário para pegar o clanTag atualizado
      const userResponse = await axios.get(
        `http://localhost:3000/users/me`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      console.log('🔄 [joinGroup] Dados do usuário recebidos:', userResponse.data);
      // Atualizar o usuário completo no store
      if (userResponse.data) {
        const updatedUser = { ...user, ...userResponse.data };
        console.log('✅ [joinGroup] Atualizando store com clanTag:', updatedUser.clanTag);
        useAuthStore.setState({
          user: updatedUser,
        });
      }
      
      alert('Você entrou no grupo!');
      fetchGroups();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao entrar no grupo');
    }
  };

  return (
    <div className="min-h-screen p-8 relative z-10">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="text-6xl">👥</span>
              Grupos
            </h1>
            <p className="text-slate-400 text-lg">
              Junte-se ou crie seu próprio clã de duelistas
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-purple-500/50"
          >
            ➕ Criar Grupo
          </button>
        </motion.div>

        {/* Filtros */}
        <div className="flex gap-4 mt-6">
          <button
            onClick={() => setFilterPublic(undefined)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              filterPublic === undefined
                ? 'bg-purple-600 text-white'
                : 'text-slate-400 hover:bg-white/10 border border-white/20'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterPublic(true)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              filterPublic === true
                ? 'bg-purple-600 text-white'
                : 'text-slate-400 hover:bg-white/10 border border-white/20'
            }`}
          >
            🌍 Públicos
          </button>
          <button
            onClick={() => setFilterPublic(false)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              filterPublic === false
                ? 'bg-purple-600 text-white'
                : 'text-slate-400 hover:bg-white/10 border border-white/20'
            }`}
          >
            🔒 Privados
          </button>
        </div>
      </div>

      {/* Abas de Ranking */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('season')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'season'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-slate-400 hover:bg-white/10 border border-white/20'
            }`}
          >
            📊 Ranking Season
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'general'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
                : 'text-slate-400 hover:bg-white/10 border border-white/20'
            }`}
          >
            🏆 Ranking Geral
          </button>
        </div>

        {/* Lista de Rankings */}
        {loadingRankings ? (
          <div className="text-center text-white text-xl py-12">Carregando rankings...</div>
        ) : (
          <div className="space-y-3">
            {(activeTab === 'season' ? seasonRanking : generalRanking).map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`rounded-xl p-4 border-2 transition-all hover:scale-[1.02] bg-slate-900/30  ${
                  group.rank === 1
                    ? 'border-yellow-500 shadow-lg shadow-yellow-500/30'
                    : group.rank === 2
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : group.rank === 3
                    ? 'border-orange-500 shadow-lg shadow-orange-500/30'
                    : 'border-slate-700/50 hover:border-purple-500/50'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <Link to={`/groups/${group.id}`} className="flex items-center gap-4 flex-1">
                    {/* Posição */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl ${
                      group.rank === 1
                        ? 'bg-yellow-500 text-white'
                        : group.rank === 2
                        ? 'bg-gray-400 text-white'
                        : group.rank === 3
                        ? 'bg-orange-500 text-white'
                        : 'border border-white/20 text-slate-300'
                    }`}>
                      {group.rank === 1 ? '🥇' : group.rank === 2 ? '🥈' : group.rank === 3 ? '🥉' : group.rank}
                    </div>

                    {/* Logo */}
                    {group.logo ? (
                      <img 
                        src={`${API_URL}${group.logo}`}
                        alt={group.name}
                        className="w-16 h-16 rounded-xl object-cover border-2 border-purple-500 shadow-lg"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={`w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold text-white shadow-lg ${group.logo ? 'hidden' : ''}`}>
                      {group.tag}
                    </div>

                    {/* Informações do Clã */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-white truncate">{group.name}</h3>
                        <span className="text-purple-400 font-semibold">[{group.tag}]</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>👥 {group.memberCount} membros</span>
                        <span>👑 {group.leader.nickname}</span>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right">
                      <div className="text-slate-400 text-xs mb-1">
                        {activeTab === 'season' ? 'Score Season' : 'Score Geral'}
                      </div>
                      <div className={`text-2xl font-bold ${
                        group.rank === 1
                          ? 'text-yellow-400'
                          : group.rank === 2
                          ? 'text-gray-300'
                          : group.rank === 3
                          ? 'text-orange-400'
                          : 'text-purple-400'
                      }`}>
                        {(activeTab === 'season' ? group.seasonScore : group.totalScore)?.toLocaleString() || 0}
                      </div>
                    </div>

                    {/* Estatísticas Adicionais */}
                    <div className="hidden md:flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-slate-400 text-xs">Cash</div>
                        <div className="text-green-400 font-bold">{group.totalCash?.toLocaleString() || 0}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-400 text-xs">V/D</div>
                        <div className="text-white font-bold">
                          <span className="text-green-400">{group.totalWins || 0}</span> / <span className="text-red-400">{group.totalLosses || 0}</span>
                        </div>
                      </div>
                      {group.totalAchievements > 0 && (
                        <div className="text-center">
                          <div className="text-slate-400 text-xs">🏆</div>
                          <div className="text-purple-400 font-bold">{group.totalAchievements}</div>
                        </div>
                      )}
                    </div>
                  </Link>
                  
                  {/* Botão Entrar no Clã - apenas se o usuário não tiver clã */}
                  {!user?.group && !user?.clanTag && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleJoinGroup(group.id);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-bold hover:from-green-700 hover:to-emerald-700 transition-colors shadow-lg shadow-green-500/30 text-sm whitespace-nowrap"
                    >
                      ✨ Entrar
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
            
            {((activeTab === 'season' ? seasonRanking : generalRanking).length === 0) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center rounded-2xl p-12 border border-white/20 bg-slate-900/30 "
              >
                <span className="text-6xl mb-4 block">🏜️</span>
                <h3 className="text-2xl font-bold text-white mb-2">Nenhum clã encontrado</h3>
                <p className="text-slate-400">Seja o primeiro a criar um clã!</p>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Criar Grupo */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900/80  rounded-2xl p-8 max-w-md w-full border border-purple-500/50 shadow-2xl"
          >
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="text-4xl">✨</span>
              Criar Novo Grupo
            </h2>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              {/* Nome do Grupo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  value={formData.tag}
                  onChange={(e) => setFormData({ ...formData, tag: e.target.value.toUpperCase() })}
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
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva seu grupo..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none resize-none"
                />
              </div>

              {/* Logo do Clã */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Logo do Clã <span className="text-red-400">*</span>
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
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setLogoFile(file);
                      setLogoPreview(URL.createObjectURL(file));
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
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
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Tipo do Grupo
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isPublic: true })}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      formData.isPublic
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-900/30  text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    🌍 Público
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isPublic: false })}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      !formData.isPublic
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-900/30  text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    🔒 Privado
                  </button>
                </div>
              </div>

              {/* Erro */}
              {formError && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormError('');
                    setFormData({ name: '', tag: '', description: '', isPublic: true });
                    setLogoFile(null);
                    setBannerFile(null);
                    setLogoPreview(null);
                    setBannerPreview(null);
                  }}
                  className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:scale-105 transition-transform"
                >
                  Criar Grupo
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
