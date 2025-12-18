import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Achievement {
  id: string;
  type: string;
  title: string;
  description: string;
  icon?: string;
  unlockedAt: Date;
}

interface DuelHistory {
  id: string;
  player1: any;
  player2: any;
  result: string;
  winnerId: number | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export const ProfilePage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user: currentUser, token } = useAuthStore();
  const [profileUser, setProfileUser] = useState<any>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [duelHistory, setDuelHistory] = useState<DuelHistory[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [biography, setBiography] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    nickname: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [updating, setUpdating] = useState(false);

  const getCurrentUserId = () => {
    if (!currentUser?.id) return null;
    return typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : Number(currentUser.id);
  };
  
  const currentUserIdNum = getCurrentUserId();
  const urlIdNum = id ? Number(id) : null;
  const isOwnProfile = !id || (currentUserIdNum !== null && currentUserIdNum === urlIdNum);

  useEffect(() => {
    const loadProfile = async () => {
      if (!id && currentUser) {
        const userId = typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : Number(currentUser.id);
        if (!isNaN(userId)) {
          navigate(`/profile/${userId}`, { replace: true });
        }
        return;
      }

      if (isOwnProfile && currentUser) {
        setProfileUser(currentUser);
        setBiography(currentUser.biography || '');
        setEditForm({
          nickname: currentUser.nickname || '',
          email: currentUser.email || '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
        setLoadingProfile(false);
      } else if (!id) {
        navigate('/');
        return;
      }

      try {
        setLoadingProfile(true);
        const userId = id ? Number(id) : currentUserIdNum;
        
        // Carregar perfil completo
        const profileResponse = await axios.get(`${API_URL}/users/${userId}/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setProfileUser(profileResponse.data);
        setBiography(profileResponse.data.biography || '');
        if (isOwnProfile) {
          setEditForm({
            nickname: profileResponse.data.nickname || '',
            email: profileResponse.data.email || '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          });
        }
        
        // Atualizar o clanTag no store se for o próprio perfil
        if (isOwnProfile && currentUser && profileResponse.data.clanTag !== currentUser.clanTag) {
          useAuthStore.setState({
            user: { ...currentUser, clanTag: profileResponse.data.clanTag },
          });
        }

        // Carregar conquistas
        try {
          const achievementsResponse = await axios.get(`${API_URL}/users/${userId}/achievements`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          setAchievements(achievementsResponse.data);
        } catch (err) {
          console.error('Erro ao carregar conquistas:', err);
        }

        // Carregar histórico de duelos
        try {
          const duelsResponse = await axios.get(`${API_URL}/duels/user/${userId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          setDuelHistory(duelsResponse.data || []);
        } catch (err) {
          console.error('Erro ao carregar histórico:', err);
        }
      } catch (error: any) {
        console.error('Erro ao carregar perfil:', error);
        setMessage('❌ Erro ao carregar perfil do usuário');
        navigate('/');
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [id, currentUser, token, navigate, isOwnProfile, currentUserIdNum]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage('❌ Formato inválido! Use PNG, JPG ou WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage('❌ Imagem muito grande! Tamanho máximo: 5MB.');
      return;
    }

    setSelectedFile(file);
    setMessage('');

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!token || !currentUser || !selectedFile || !isOwnProfile) return;

    setUploading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('profileImage', selectedFile);

      const currentUserId = typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : Number(currentUser.id);
      const profileId = id ? Number(id) : currentUserId;
      
      const response = await axios.post(
        `${API_URL}/users/${profileId}/profile-image`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const newImageUrl = response.data.profileImage;
      useAuthStore.setState({
        user: { ...currentUser, profileImage: newImageUrl },
      });

      setProfileUser({ ...profileUser, profileImage: newImageUrl });
      setSelectedFile(null);
      setPreviewUrl(null);
      setMessage('✅ Imagem de perfil atualizada com sucesso!');

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      setMessage('❌ Erro ao fazer upload: ' + (error.response?.data?.message || 'Tente novamente'));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveBiography = async () => {
    if (!token || !isOwnProfile) return;

    try {
      const userId = typeof currentUser?.id === 'string' ? parseInt(currentUser.id, 10) : Number(currentUser.id);
      await axios.patch(
        `${API_URL}/users/${userId}/biography`,
        { biography },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEditingBio(false);
      setMessage('✅ Biografia atualizada com sucesso!');
      setProfileUser({ ...profileUser, biography });
    } catch (error: any) {
      setMessage('❌ Erro ao salvar biografia: ' + (error.response?.data?.message || 'Tente novamente'));
    }
  };

  const handleOpenEditModal = () => {
    if (profileUser) {
      setEditForm({
        nickname: profileUser.nickname || '',
        email: profileUser.email || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setShowEditModal(true);
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditForm({
      nickname: '',
      email: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  };

  const handleUpdateProfile = async () => {
    if (!token || !isOwnProfile || !currentUser) return;

    setUpdating(true);
    setMessage('');

    try {
      const userId = typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : Number(currentUser.id);
      const updates: any = {};

      // Atualizar foto se selecionada
      if (selectedFile) {
        const formData = new FormData();
        formData.append('profileImage', selectedFile);
        
        const response = await axios.post(
          `${API_URL}/users/${userId}/profile-image`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        updates.profileImage = response.data.profileImage;
        setSelectedFile(null);
        setPreviewUrl(null);
      }

      // Atualizar nickname se mudou
      if (editForm.nickname && editForm.nickname !== profileUser.nickname) {
        await axios.patch(
          `${API_URL}/users/${userId}/nickname`,
          { nickname: editForm.nickname },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        updates.nickname = editForm.nickname;
      }

      // Atualizar email se mudou
      if (editForm.email && editForm.email !== profileUser.email) {
        await axios.patch(
          `${API_URL}/users/${userId}/email`,
          { email: editForm.email },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        updates.email = editForm.email;
      }

      // Atualizar senha se fornecida
      if (editForm.newPassword) {
        if (editForm.newPassword !== editForm.confirmPassword) {
          setMessage('❌ As senhas não coincidem');
          setUpdating(false);
          return;
        }
        if (editForm.newPassword.length < 6) {
          setMessage('❌ A senha deve ter pelo menos 6 caracteres');
          setUpdating(false);
          return;
        }
        if (!editForm.currentPassword) {
          setMessage('❌ Por favor, informe a senha atual');
          setUpdating(false);
          return;
        }
        await axios.patch(
          `${API_URL}/users/${userId}/password`,
          {
            currentPassword: editForm.currentPassword,
            newPassword: editForm.newPassword,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      // Atualizar estado local e store
      const updatedUser = { ...profileUser, ...updates };
      setProfileUser(updatedUser);
      useAuthStore.setState({ user: { ...currentUser, ...updates } });

      setMessage('✅ Perfil atualizado com sucesso!');
      handleCloseEditModal();

      // Recarregar página após 1 segundo
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      setMessage('❌ Erro ao atualizar perfil: ' + (error.response?.data?.message || 'Tente novamente'));
    } finally {
      setUpdating(false);
    }
  };


  if (loadingProfile || !profileUser) {
    return (
      <div className="min-h-screen flex items-center justify-center relative z-10">
        <p className="text-white text-xl">Carregando...</p>
      </div>
    );
  }

  const currentImageUrl = previewUrl || `${API_URL}${profileUser.profileImage}`;
  // Usar winsSeason/lossesSeason do User se não houver seasonRanking
  const seasonWins = profileUser.seasonRanking?.wins || profileUser.winsSeason || 0;
  const seasonLosses = profileUser.seasonRanking?.losses || profileUser.lossesSeason || 0;
  const seasonScore = profileUser.seasonRanking?.seasonScore || 0;
  const division = profileUser.seasonRanking?.division || 'Bronze';

  return (
    <div className="min-h-screen py-12 px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* Botão Editar Perfil */}
        {isOwnProfile && (
          <div className="flex justify-end mb-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenEditModal}
              className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition border border-slate-600/50 text-white font-semibold flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar Perfil
            </motion.button>
          </div>
        )}

        {/* Card Principal: Foto + Estatísticas */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 mb-8"
          style={{ backgroundColor: 'transparent' }}
        >
          {/* Foto à esquerda e Informações ao lado */}
          <div className="flex items-start gap-8 mb-8">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative flex-shrink-0"
            >
              <div className="w-80 h-80 rounded-xl overflow-hidden border-2 border-slate-600/50 shadow-2xl">
                <img
                  src={currentImageUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/images/default.png';
                  }}
                />
              </div>
              {isOwnProfile && (
                <label className="absolute bottom-3 right-3 bg-slate-700 hover:bg-slate-600 rounded-full p-3 cursor-pointer transition-all shadow-lg border border-slate-500/50">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </motion.div>

            {/* Nome e Estatísticas */}
            <div className="flex-1 min-w-0">
              {/* Nome, ID e Nível */}
              <div className="mb-4">
                <h1 className="text-4xl font-bold text-white mb-2">
                  {profileUser.clanTag ? `|${profileUser.clanTag}| ${profileUser.nickname}` : profileUser.nickname}
                </h1>
                <div className="flex items-center gap-4">
                  <p className="text-slate-400">ID: #{profileUser.id}</p>
                  <span className="text-sm text-slate-300 flex items-center gap-1">
                    <span>⭐</span> Nível <span className="text-base font-bold text-white ml-1">{profileUser.level || 1}</span>
                  </span>
                </div>
                <p className="text-slate-500">@{profileUser.username}</p>
              </div>

              {/* Estatísticas - Agrupadas */}
              <div className="space-y-3">
                {/* Score Season e Score Geral lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-slate-300 flex items-center gap-1">
                        <span>📊</span> Score Season
                      </span>
                      <span className="text-base font-bold text-cyan-400">{seasonScore || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">⚡ V/D:</span>
                      <span className="text-sm font-bold text-white">
                        <span className="text-green-400">{seasonWins}</span> / <span className="text-red-400">{seasonLosses}</span>
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-slate-300 flex items-center gap-1">
                        <span>🏆</span> Score Geral
                      </span>
                      <span className="text-base font-bold text-yellow-400">{profileUser.totalScore?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">📈 V/D:</span>
                      <span className="text-sm font-bold text-white">
                        <span className="text-green-400">{profileUser.winsGeral || 0}</span> / <span className="text-red-400">{profileUser.lossesGeral || 0}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Outras estatísticas */}
                <div className="space-y-1.5">
                  {/* Ranking Season e Ranking Geral lado a lado */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-300 flex items-center gap-1">
                        <span>📈</span> Ranking Season
                      </span>
                      <span className="text-base font-bold text-purple-400">{profileUser.seasonRanking?.rank || '-'}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-300 flex items-center gap-1">
                        <span>🎖️</span> Ranking Geral
                      </span>
                      <span className="text-base font-bold text-orange-400">{profileUser.generalRank || '-'}°</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                      <span>🏅</span> Divisão
                    </span>
                    <span className="text-base font-bold text-cyan-400">{division}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Mensagem de Feedback */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg text-center font-semibold ${
              message.includes('✅')
                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                : 'bg-red-500/20 text-red-400 border border-red-500/50'
            }`}
          >
            {message}
          </motion.div>
        )}

        <div className="space-y-6">
          {/* Biografia */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6"
            style={{ backgroundColor: 'transparent' }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">📝 Biografia</h2>
            {isOwnProfile && !editingBio ? (
              <div>
                <p className="text-gray-300 mb-4 whitespace-pre-wrap">
                  {profileUser.biography || 'Nenhuma biografia ainda. Clique em editar para adicionar uma!'}
                </p>
                  <button
                    onClick={() => setEditingBio(true)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition border border-slate-600/50"
                  >
                    Editar Biografia
                  </button>
              </div>
            ) : isOwnProfile && editingBio ? (
              <div className="space-y-4">
                <textarea
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  placeholder="Escreva sua biografia aqui..."
                  maxLength={500}
                  rows={6}
                    className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 resize-none focus:border-slate-500 focus:outline-none"
                />
                <div className="text-sm text-gray-400 text-right">
                  {biography.length}/500 caracteres
                </div>
                <div className="flex gap-2">
                    <button
                      onClick={handleSaveBiography}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition border border-slate-600/50"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditingBio(false);
                        setBiography(profileUser.biography || '');
                      }}
                      className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-700/50"
                    >
                      Cancelar
                    </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-300 whitespace-pre-wrap">
                {profileUser.biography || 'Este duelista ainda não escreveu uma biografia.'}
              </p>
            )}
          </motion.div>

          {/* Conquistas */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6"
            style={{ backgroundColor: 'transparent' }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">🏆 Conquistas</h2>
            {achievements.length === 0 ? (
              <p className="text-gray-400">Nenhuma conquista desbloqueada ainda.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="bg-slate-700/50 p-4 rounded-xl border border-slate-600/50 hover:border-slate-500/50 transition-colors"
                  >
                    <div className="text-white font-bold mb-1">{achievement.title}</div>
                    <div className="text-sm text-slate-400">{achievement.description}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      {new Date(achievement.unlockedAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Histórico de Duelos */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6"
            style={{ backgroundColor: 'transparent' }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">⚔️ Histórico de Duelos</h2>
            {duelHistory.length === 0 ? (
              <p className="text-gray-400">Nenhum duelo registrado ainda.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {duelHistory.map((duel) => {
                  const isPlayer1 = duel.player1?.id === profileUser.id;
                  const opponent = isPlayer1 ? duel.player2 : duel.player1;
                  const won = duel.winnerId === profileUser.id;
                  const isDraw = duel.result === 'DRAW';

                  return (
                    <div
                      key={duel.id}
                      className={`p-4 rounded-xl border ${
                        won
                          ? 'bg-slate-700/50 border-green-500/30'
                          : isDraw
                          ? 'bg-slate-700/50 border-yellow-500/30'
                          : 'bg-slate-700/50 border-red-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white">
                            vs {opponent?.clanTag ? `|${opponent.clanTag}| ${opponent?.nickname || 'Desconhecido'}` : (opponent?.nickname || 'Desconhecido')}
                          </div>
                          <div className="text-sm text-gray-400">
                            {new Date(duel.createdAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-lg font-bold text-sm ${
                          won
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : isDraw
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {won ? 'Vitória' : isDraw ? 'Empate' : 'Derrota'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Upload de Imagem (Modal) */}
        {isOwnProfile && selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              if (!uploading) {
                setSelectedFile(null);
                setPreviewUrl(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50"
            >
              <h3 className="text-2xl font-bold text-white mb-4">Preview da Imagem</h3>
              <img
                src={previewUrl || ''}
                alt="Preview"
                className="w-full h-64 object-cover rounded-lg mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50 border border-slate-600/50"
                >
                  {uploading ? 'Enviando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  disabled={uploading}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition disabled:opacity-50 border border-slate-700/50"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Modal de Edição de Perfil */}
        {showEditModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={handleCloseEditModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full border border-slate-700/50 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Editar Perfil</h2>
                <button
                  onClick={handleCloseEditModal}
                  className="text-slate-400 hover:text-white transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Foto de Perfil */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Foto de Perfil</label>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-600/50">
                      <img
                        src={currentImageUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/images/default.png';
                        }}
                      />
                    </div>
                    <div>
                      <label className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition border border-slate-600/50 inline-block">
                        <span className="text-white text-sm">Trocar Foto</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          onChange={handleFileChange}
                        />
                      </label>
                      {selectedFile && (
                        <p className="text-xs text-slate-400 mt-2">A foto será salva ao clicar em "Salvar Alterações"</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Nickname */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Nickname</label>
                  <input
                    type="text"
                    value={editForm.nickname}
                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                    placeholder="Seu nickname"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                    placeholder="seu@email.com"
                  />
                </div>

                {/* Senha */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Alterar Senha</label>
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={editForm.currentPassword}
                      onChange={(e) => setEditForm({ ...editForm, currentPassword: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                      placeholder="Senha atual"
                    />
                    <input
                      type="password"
                      value={editForm.newPassword}
                      onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                      placeholder="Nova senha (deixe em branco para não alterar)"
                    />
                    {editForm.newPassword && (
                      <input
                        type="password"
                        value={editForm.confirmPassword}
                        onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                        placeholder="Confirmar nova senha"
                      />
                    )}
                  </div>
                </div>

                {/* Mensagem de erro/sucesso */}
                {message && (
                  <div className={`p-3 rounded-lg text-sm ${
                    message.includes('✅') 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {message}
                  </div>
                )}

                {/* Botões */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleUpdateProfile}
                    disabled={updating}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50 border border-slate-600/50 text-white font-semibold"
                  >
                    {updating ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                  <button
                    onClick={handleCloseEditModal}
                    disabled={updating}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition disabled:opacity-50 border border-slate-700/50 text-white font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

