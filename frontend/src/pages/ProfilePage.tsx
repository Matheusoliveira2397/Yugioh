import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getDivisionDisplayName, getDivisionImagePath } from '../utils/divisionDisplay';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import axios from 'axios';
import { getImageUrl, getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { formatScore } from '../utils/formatScore';
import FramedAvatar from '../components/FramedAvatar';
import { getAvatarFrame } from '../constants/avatarFrames';

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
  playerId: number;
  opponentId: number;
  opponent: {
    id: number;
    nickname?: string;
    username?: string;
    clanTag?: string;
    profileImage?: string;
  };
  result: 'WIN' | 'LOSS' | 'DRAW' | 'CANCELLED';
  origin: 'RANDOM' | 'ARENA' | 'TOURNAMENT' | 'CHAT' | 'OTHER';
  playerLifePoints: number;
  opponentLifePoints: number;
  scoreEarned: number;
  turns: number;
  duration: number;
  finishedAt: Date;
  // Campos legados para compatibilidade
  player1?: any;
  player2?: any;
  winnerId?: number | null;
  createdAt?: Date;
  player1LifePoints?: number;
  player2LifePoints?: number;
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
    username: '',
    nickname: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [updating, setUpdating] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{
    group: { id: string; name: string; tag: string } | null;
    memberRank: number | null;
    memberTotalRank: number | null;
  } | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<{
    status: string;
    friendship: any;
  } | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showFriendMenu, setShowFriendMenu] = useState(false);
  const [directMatchStats, setDirectMatchStats] = useState<any>(null);
  const [loadingDirectMatch, setLoadingDirectMatch] = useState(false);
  const [showLevelsModal, setShowLevelsModal] = useState(false);
  const [nextLevels, setNextLevels] = useState<any[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(false);

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
          username: (currentUser as any).username || '',
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
            username: profileResponse.data.username || '',
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

        // Carregar estatísticas de confronto direto (apenas se não for o próprio perfil)
        if (!isOwnProfile && currentUserIdNum) {
          try {
            setLoadingDirectMatch(true);
            const directMatchResponse = await axios.get(`${API_URL}/duels/direct-match/${userId}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (directMatchResponse.data.success) {
              setDirectMatchStats(directMatchResponse.data);
            }
          } catch (err) {
            console.error('Erro ao carregar confronto direto:', err);
            setDirectMatchStats(null);
          } finally {
            setLoadingDirectMatch(false);
          }
        } else {
          setDirectMatchStats(null);
        }

        // Carregar histórico de duelos (usar endpoint de histórico que inclui origin)
        try {
          console.log('🔍 [ProfilePage] Carregando histórico de duelos para userId:', userId);
          const historyResponse = await axios.get(`${API_URL}/duels/history/user/${userId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          console.log('🔍 [ProfilePage] Resposta do histórico:', historyResponse.data);
          
          // O endpoint retorna { history: [...], total: number }
          const historyData = historyResponse.data?.history || historyResponse.data || [];
          console.log('🔍 [ProfilePage] Dados do histórico processados:', historyData);
          console.log('🔍 [ProfilePage] Total de duelos no histórico:', historyData.length);
          
          setDuelHistory(Array.isArray(historyData) ? historyData : []);
        } catch (err: any) {
          console.error('❌ [ProfilePage] Erro ao carregar histórico:', err);
          console.error('❌ [ProfilePage] Detalhes do erro:', err.response?.data || err.message);
          setDuelHistory([]);
        }

        // Carregar informações do clã
        try {
          const groupResponse = await axios.get(`${API_URL}/groups/user/${userId}/info`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          setGroupInfo(groupResponse.data);
        } catch (err) {
          console.error('Erro ao carregar informações do clã:', err);
          setGroupInfo(null);
        }

        // Carregar status de amizade (se não for o próprio perfil)
        if (!isOwnProfile && currentUserIdNum && token) {
          try {
            const friendshipResponse = await axios.get(`${API_URL}/friends/status/${userId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setFriendshipStatus(friendshipResponse.data);
          } catch (err) {
            console.error('Erro ao carregar status de amizade:', err);
            setFriendshipStatus({ status: 'none', friendship: null });
          }
        }

        // Carregar lista de amigos do perfil (todos podem ver)
        if (token && userId) {
          loadFriends(userId);
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

  const loadFriends = async (userId?: number) => {
    if (!token) return;
    try {
      setLoadingFriends(true);
      const targetUserId = userId || urlIdNum || currentUserIdNum;
      if (!targetUserId) return;
      
      // Buscar amigos do usuário do perfil
      const response = await axios.get(`${API_URL}/friends/user/${targetUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriends(response.data || []);
    } catch (err) {
      console.error('Erro ao carregar amigos:', err);
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const loadNextLevels = async (currentLevel: number) => {
    if (!token) return;
    try {
      setLoadingLevels(true);
      const response = await axios.get(`${API_URL}/levels/next/${currentLevel}?count=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNextLevels(response.data || []);
    } catch (err) {
      console.error('Erro ao carregar próximos níveis:', err);
      setNextLevels([]);
    } finally {
      setLoadingLevels(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!token || !profileUser || !currentUserIdNum) return;
    
    try {
      await axios.post(
        `${API_URL}/friends/request`,
        { userId: profileUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage('✅ Solicitação de amizade enviada!');
      // Recarregar status de amizade
      const friendshipResponse = await axios.get(`${API_URL}/friends/status/${profileUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriendshipStatus(friendshipResponse.data);
    } catch (error: any) {
      const msg = error.response?.data?.message || '';
      const alreadyExists = error.response?.status === 409 || /já existe|já enviou|já são amigos/i.test(msg);
      if (alreadyExists && profileUser) {
        // Sincronizar estado: buscar status e mostrar "Solicitação enviada"
        try {
          const friendshipResponse = await axios.get(`${API_URL}/friends/status/${profileUser.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setFriendshipStatus(friendshipResponse.data);
          setMessage('✅ Solicitação enviada.');
        } catch (_) {
          setMessage('❌ ' + (msg || 'Erro ao enviar solicitação'));
        }
      } else {
        setMessage('❌ ' + (msg || 'Erro ao enviar solicitação'));
      }
    }
  };

  const handleRemoveFriend = async () => {
    if (!token || !profileUser || !currentUserIdNum) return;
    try {
      await axios.delete(`${API_URL}/friends/remove/${profileUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage('✅ Amizade removida.');
      setShowFriendMenu(false);
      const friendshipResponse = await axios.get(`${API_URL}/friends/status/${profileUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriendshipStatus(friendshipResponse.data);
      const friendsRes = await axios.get(`${API_URL}/friends/user/${profileUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriends(friendsRes.data || []);
    } catch (error: any) {
      setMessage('❌ ' + (error.response?.data?.message || 'Erro ao remover amizade'));
    }
  };

  const handleCancelFriendRequest = async () => {
    if (!token || !profileUser) return;
    try {
      await axios.delete(`${API_URL}/friends/cancel/${profileUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage('✅ Solicitação cancelada.');
      setShowFriendMenu(false);
      const friendshipResponse = await axios.get(`${API_URL}/friends/status/${profileUser.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriendshipStatus(friendshipResponse.data);
    } catch (error: any) {
      setMessage('❌ ' + (error.response?.data?.message || 'Erro ao cancelar solicitação'));
    }
  };

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
        username: (profileUser as any).username || '',
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
      username: '',
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

      // Atualizar username (nome de usuário para login) se mudou
      if (editForm.username && editForm.username.trim() !== ((profileUser as any).username || '').trim()) {
        await axios.patch(
          `${API_URL}/users/${userId}/username`,
          { username: editForm.username.trim() },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        updates.username = editForm.username.trim();
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

      // Troca de email: envia link de confirmação para o email atual (não altera até confirmar)
      let emailChangeMessage = '';
      if (editForm.email && editForm.email.trim() !== (profileUser.email || '').trim()) {
        const emailRes = await axios.post(
          `${API_URL}/users/request-email-change`,
          { newEmail: editForm.email.trim() },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        emailChangeMessage = emailRes.data?.message || 'Enviamos um link de confirmação para seu email atual.';
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

      setMessage(emailChangeMessage ? '✅ ' + emailChangeMessage : '✅ Perfil atualizado com sucesso!');
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

  const currentImageUrl = previewUrl || getProfileImageUrl(profileUser.profileImage);
  // Usar winsSeason/lossesSeason do User se não houver seasonRanking
  const seasonWins = profileUser.seasonRanking?.wins || profileUser.winsSeason || 0;
  const seasonLosses = profileUser.seasonRanking?.losses || profileUser.lossesSeason || 0;
  const seasonScore = profileUser.seasonRanking?.seasonScore || 0;
  const division = profileUser.division || 'Bronze';

  return (
    <div className="min-h-screen py-12 px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* Botões de Ação */}
        <div className="flex justify-end items-center gap-3 mb-6">
          {/* Ícone de Amigos */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowFriendsModal(true)}
            className="p-3 hover:bg-white/10 rounded-lg transition border border-white/20 text-white"
            title="Ver amigos"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </motion.button>

          {isOwnProfile ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenEditModal}
              className="px-6 py-2 hover:bg-white/10 rounded-lg transition border border-white/20 text-white font-semibold flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar Perfil
            </motion.button>
          ) : (
            friendshipStatus && (
              <div className="relative flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowFriendMenu((v) => !v)}
                  className={`flex items-center gap-2 rounded-lg transition border text-white ${
                    friendshipStatus.status === 'accepted'
                      ? 'px-4 py-2 border-green-500/50 bg-green-600/20'
                      : friendshipStatus.status === 'pending'
                      ? 'px-4 py-2 border-yellow-500/50 bg-yellow-600/20'
                      : 'p-3 border-white/20 hover:bg-white/10'
                  }`}
                  title="Amizade"
                >
                  <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                  {friendshipStatus.status === 'accepted' && <span className="font-medium">Amigos</span>}
                  {friendshipStatus.status === 'pending' && <span className="font-medium">Solicitação enviada</span>}
                </motion.button>
                {showFriendMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowFriendMenu(false)} aria-hidden="true" />
                    <div className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[180px] rounded-lg border border-white/20 bg-gray-800 shadow-xl">
                      {friendshipStatus.status === 'accepted' ? (
                        <button
                          onClick={handleRemoveFriend}
                          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2"
                        >
                          <span>✕</span> Remover amizade
                        </button>
                      ) : friendshipStatus.status === 'pending' ? (
                        friendshipStatus.friendship?.isSender ? (
                          <button
                            onClick={handleCancelFriendRequest}
                            className="w-full px-4 py-2 text-left text-sm text-amber-400 hover:bg-amber-500/20 flex items-center gap-2"
                          >
                            <span>✕</span> Cancelar solicitação
                          </button>
                        ) : (
                          <div className="px-4 py-2 text-sm text-gray-500 flex items-center gap-2">
                            <span>⏳</span> Solicitação enviada
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => { handleSendFriendRequest(); setShowFriendMenu(false); }}
                          className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-purple-500/20 flex items-center gap-2"
                        >
                          <span>+</span> Enviar solicitação de amizade
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </div>

        {/* Card Principal: Foto + Estatísticas */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 mb-8"
          style={{ backgroundColor: 'transparent' }}
        >
          {/* Layout: Foto à esquerda, Informações no centro, Emblema à direita */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
            {/* Emblema do Ranking (Divisão) - À direita */}
            <div className="flex-shrink-0 order-1 sm:order-3">
              {(() => {
                const imagePath = getDivisionImagePath(division);
                const divisionLabel = getDivisionDisplayName(division);
                return imagePath ? (
                  <motion.img
                    whileHover={{ scale: 1.1 }}
                    src={imagePath}
                    alt={divisionLabel}
                    className="w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 object-contain drop-shadow-2xl"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null;
              })()}
            </div>

            {/* Foto do Perfil - À esquerda */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative flex-shrink-0 order-2 sm:order-1 overflow-visible p-8 sm:p-10 md:p-12"
            >
              <div className="w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 overflow-visible">
                {getAvatarFrame(profileUser.equippedAvatarFrame) ? (
                  <FramedAvatar
                    src={
                      isOwnProfile && previewUrl
                        ? previewUrl
                        : profileUser.profileImage
                    }
                    alt="Avatar"
                    frameId={profileUser.equippedAvatarFrame}
                    className="w-full h-full"
                    rounded="xl"
                  />
                ) : (
                  <div className="w-full h-full rounded-xl overflow-hidden border-2 border-purple-500/50">
                    <img
                      src={currentImageUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                  </div>
                )}
              </div>
              {isOwnProfile && (
                <label className="absolute bottom-3 right-3 hover:bg-white/10 rounded-full p-3 cursor-pointer transition-all shadow-lg border border-white/20">
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

            {/* Informações do Duelista - No centro */}
            <div className="flex-1 min-w-0 text-center sm:text-left order-3 sm:order-2">
              {/* Data de criação - Em cima do Nick */}
              {profileUser.createdAt && (
                <p className="text-sm text-slate-400 mb-1">
                  Duelista desde {new Date(profileUser.createdAt).toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  })}
                </p>
              )}
              
              {/* Sigla do clã + nick (mesmo tamanho de fonte) */}
              <h1 className="mb-4 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 sm:justify-start text-2xl font-bold sm:text-3xl md:text-4xl">
                {profileUser.clanTag ? (
                  groupInfo?.group?.id ? (
                    <Link
                      to={`/groups/${groupInfo.group.id}`}
                      className="shrink-0 text-inherit font-bold text-cyan-400 transition-colors hover:text-cyan-300"
                      title="Ver clã"
                    >
                      |{profileUser.clanTag}|
                    </Link>
                  ) : (
                    <span className="shrink-0 text-inherit font-bold text-cyan-400">
                      |{profileUser.clanTag}|
                    </span>
                  )
                ) : null}
                <span className="min-w-0 break-words text-inherit text-white">
                  {profileUser.nickname}
                </span>
              </h1>
              
              {/* Outras informações básicas */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 text-sm text-slate-400">
                <p>ID: #{profileUser.id}</p>
                <span
                  className="text-slate-300 flex items-center gap-1 cursor-pointer hover:text-yellow-400 transition-colors rounded px-1 py-0.5 hover:bg-white/5"
                  onClick={() => {
                    setShowLevelsModal(true);
                    loadNextLevels(profileUser.level || 1);
                  }}
                  title="Clique para ver os próximos 10 níveis e quanto score falta"
                >
                  <span>⭐</span> Nível <span className="text-base font-bold text-white ml-1">{profileUser.level || 1}</span>
                </span>
                <span className="text-slate-300 flex items-center gap-1" title="Estrelas (premiação de torneios e outras recompensas)">
                  <span>🌟</span> <span className="text-base font-bold text-amber-300/90">{(profileUser as any).stars ?? 0}</span> estrelas
                </span>
                <span
                  className="text-slate-300 flex items-center gap-1"
                  title="Percentual de cartas ativas do jogo que este duelista possui"
                >
                  <span>🎴</span>{' '}
                  <span className="text-base font-bold text-violet-300">
                    {Number((profileUser as any).collectionPercent ?? 0).toFixed(1)}%
                  </span>{' '}
                  cartas
                  <span className="text-slate-500 text-xs ml-0.5">
                    ({(profileUser as any).ownedActiveCards ?? 0}/{(profileUser as any).totalActiveCards ?? 0})
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Outras informações - Em baixo da foto */}
          <div className="mt-8">

              {/* Estatísticas - Agrupadas */}
              <div className="space-y-4">
                {/* Score Season e Score Geral lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/20 rounded-lg p-3 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm text-slate-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">📊</span> Score Season
                      </span>
                      <span className="text-lg md:text-xl font-bold text-cyan-400 drop-shadow-lg">{formatScore(seasonScore)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                      <span className="text-xs text-slate-500 font-medium">⚡ V/D</span>
                      <span className="text-sm md:text-base font-bold">
                        <span className="text-green-400">{seasonWins}</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-red-400">{seasonLosses}</span>
                      </span>
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm text-slate-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🏆</span> Score Geral
                      </span>
                      <span className="text-lg md:text-xl font-bold text-yellow-400 drop-shadow-lg">{formatScore(profileUser.totalScore)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                      <span className="text-xs text-slate-500 font-medium">📈 V/D</span>
                      <span className="text-sm md:text-base font-bold">
                        <span className="text-green-400">{profileUser.winsGeral || 0}</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-red-400">{profileUser.lossesGeral || 0}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Coleção de cartas */}
                <Link to="/collection" className="block game-panel p-3 hover:border-champion-gold/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs md:text-sm text-arena-mist font-medium uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">🎴</span> % de Cartas
                    </span>
                    <span className="font-display text-lg md:text-xl font-bold text-champion-gold">
                      {Number((profileUser as any).collectionPercent ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="game-progress-track mb-2">
                    <div
                      className="game-progress-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, Number((profileUser as any).collectionPercent ?? 0)))}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-arena-mist">
                    {(profileUser as any).ownedActiveCards ?? 0} de{' '}
                    {(profileUser as any).totalActiveCards ?? 0} cartas ativas · ver coleção →
                  </p>
                </Link>

                {/* Outras estatísticas */}
                <div className="space-y-2">
                  {/* Ranking Season e Ranking Geral lado a lado */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-lg p-3 border border-slate-700/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs md:text-sm text-slate-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">📈</span> Ranking Season
                        </span>
                        <span className="text-lg md:text-xl font-bold text-purple-400 drop-shadow-lg">
                          {profileUser.seasonRank !== null && profileUser.seasonRank !== undefined 
                            ? `${profileUser.seasonRank}°` 
                            : (profileUser.seasonRanking?.rank !== null && profileUser.seasonRanking?.rank !== undefined 
                              ? `${profileUser.seasonRanking.rank}°` 
                              : '-')}
                        </span>
                      </div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-3 border border-slate-700/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs md:text-sm text-slate-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">🎖️</span> Ranking Geral
                        </span>
                        <span className="text-lg md:text-xl font-bold text-orange-400 drop-shadow-lg">
                          {profileUser.generalRank !== null && profileUser.generalRank !== undefined 
                            ? `${profileUser.generalRank}°` 
                            : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3 border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm text-slate-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🏅</span> Divisão
                      </span>
                      <div className="flex items-center gap-2">
                      {(() => {
                        const imagePath = getDivisionImagePath(division);
                        const divisionLabel = getDivisionDisplayName(division);
                        return imagePath ? (
                          <img
                            src={imagePath}
                            alt={divisionLabel}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null;
                      })()}
                      <span className="text-lg md:text-xl font-bold text-cyan-400 drop-shadow-lg">{getDivisionDisplayName(division)}</span>
                    </div>
                    </div>
                  </div>
                  {groupInfo?.group && (
                    <>
                      <div className="bg-black/20 rounded-lg p-3 border border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs md:text-sm text-slate-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                            <span className="text-base">👥</span> Clã
                          </span>
                          <Link 
                            to={`/groups/${groupInfo.group.id}`}
                            className="text-lg md:text-xl font-bold text-cyan-400 drop-shadow-lg hover:text-cyan-300 transition-colors cursor-pointer"
                          >
                            {groupInfo.group.tag ? `|${groupInfo.group.tag}|` : groupInfo.group.name}
                          </Link>
                        </div>
                      </div>
                    </>
                  )}
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
                ? 'text-green-400 border border-green-500/50'
                : 'text-red-400 border border-red-500/50'
            }`}
          >
            {message}
          </motion.div>
        )}

        {/* Conteúdo em Sequência */}
        <div className="space-y-6">
          {/* Biografia */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-xl border border-white/10"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">Biografia</h2>
            {isOwnProfile && !editingBio ? (
              <div>
                <p className="text-gray-300 mb-4 whitespace-pre-wrap">
                  {profileUser.biography || 'Nenhuma biografia ainda. Clique em editar para adicionar uma!'}
                </p>
                  <button
                    onClick={() => setEditingBio(true)}
                    className="px-4 py-2 hover:bg-white/10 rounded-lg transition border border-white/20"
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
                  className="w-full bg-gray-800 text-white placeholder-gray-400 px-4 py-2 rounded-lg border border-white/20 resize-none focus:border-white/40 focus:outline-none"
                />
                <div className="text-sm text-gray-400 text-right">
                  {biography.length}/500 caracteres
                </div>
                <div className="flex gap-2">
                    <button
                      onClick={handleSaveBiography}
                      className="flex-1 px-4 py-2 hover:bg-white/10 rounded-lg transition border border-white/20"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditingBio(false);
                        setBiography(profileUser.biography || '');
                      }}
                      className="flex-1 px-4 py-2 hover:bg-white/10 rounded-lg transition border border-white/20"
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
            className="p-6 rounded-xl border border-white/10"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">Conquistas</h2>
            {achievements.length === 0 ? (
              <p className="text-gray-400">Nenhuma conquista desbloqueada ainda.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex flex-col items-center p-2"
                  >
                    {achievement.icon ? (
                      <img
                        src={getImageUrl(achievement.icon)}
                        alt={achievement.title}
                        className="w-24 h-24 object-contain mb-3"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-24 h-24 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center text-4xl mb-3">
                        🏆
                      </div>
                    )}
                    <div className="text-white font-bold mb-1 text-center">{achievement.title}</div>
                    {achievement.description && (
                      <div className="text-sm text-slate-400 text-center mb-2">{achievement.description}</div>
                    )}
                    <div className="text-xs text-slate-500">
                      {new Date(achievement.unlockedAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Confronto Direto - Apenas se não for o próprio perfil */}
          {!isOwnProfile && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-xl border border-white/10"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
            >
              <h2 className="text-2xl font-bold text-white mb-6">⚔️ Confronto Direto</h2>
              {loadingDirectMatch ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  <p className="text-gray-400 mt-2">Carregando estatísticas...</p>
                </div>
              ) : directMatchStats ? (
                <div className="space-y-6">
                  {/* Imagens dos duelistas com X entre elas */}
                  <div className="flex items-center justify-center gap-4 md:gap-8 mb-6">
                    {/* Jogador 1 (você) */}
                    <div className="flex flex-col items-center">
                      <img
                        src={getProfileImageUrl(currentUser?.profileImage)}
                        alt={currentUser?.nickname || 'Jogador'}
                        className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-purple-500/50 object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                        }}
                      />
                      <span className="text-white font-bold mt-2 text-sm md:text-base">{currentUser?.nickname || 'Você'}</span>
                    </div>

                    {/* X entre os duelistas */}
                    <div className="text-4xl md:text-5xl font-bold text-red-500">⚔️</div>

                    {/* Jogador 2 (oponente) */}
                    <div className="flex flex-col items-center">
                      <img
                        src={getProfileImageUrl(directMatchStats.player2?.profileImage)}
                        alt={directMatchStats.player2?.nickname || 'Oponente'}
                        className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-purple-500/50 object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                        }}
                      />
                      <span className="text-white font-bold mt-2 text-sm md:text-base">{directMatchStats.player2?.nickname || 'Oponente'}</span>
                    </div>
                  </div>

                  {/* Estatísticas gerais */}
                  <div className="bg-black/30 rounded-lg p-4 border border-white/10 mb-6">
                    <h3 className="text-lg font-bold text-white mb-3 text-center">Estatísticas Gerais</h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-400">{directMatchStats.total.player1Wins}</div>
                        <div className="text-sm text-gray-400">Suas Vitórias</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-400">{directMatchStats.total.player2Wins}</div>
                        <div className="text-sm text-gray-400">Vitórias do Oponente</div>
                      </div>
                    </div>
                    <div className="text-center mt-4 text-sm text-gray-400">
                      Total de duelos: <span className="font-bold text-white">{directMatchStats.total.totalMatches}</span>
                    </div>
                  </div>

                  {/* Estatísticas por tipo de duelo */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white mb-3">Por Tipo de Duelo</h3>
                    {[
                      { key: 'RANDOM', label: 'Random Duel', icon: '🎲' },
                      { key: 'CHAT', label: 'Chat Duel', icon: '💬' },
                      { key: 'ARENA', label: 'Arena Duel', icon: '🏟️' },
                      { key: 'TOURNAMENT', label: 'Tournament Duel', icon: '🏆' },
                      { key: 'OTHER', label: 'Outros', icon: '⚔️' },
                    ].map(({ key, label, icon }) => {
                      const stats = directMatchStats.byOrigin[key as keyof typeof directMatchStats.byOrigin];
                      if (!stats || stats.total === 0) return null;

                      return (
                        <div key={key} className="bg-black/30 rounded-lg p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-2xl">{icon}</span>
                            <h4 className="text-white font-bold">{label}</h4>
                            <span className="ml-auto text-sm text-gray-400">Total: {stats.total}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div>
                              <div className="text-xl font-bold text-green-400">{stats.player1Wins}</div>
                              <div className="text-xs text-gray-400">Você venceu</div>
                            </div>
                            <div>
                              <div className="text-xl font-bold text-red-400">{stats.player2Wins}</div>
                              <div className="text-xs text-gray-400">Oponente venceu</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {Object.values(directMatchStats.byOrigin).every((s: any) => s.total === 0) && (
                      <p className="text-gray-400 text-center py-4">Nenhum duelo registrado ainda.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-4">Nenhum confronto direto registrado ainda.</p>
              )}
            </motion.div>
          )}

          {/* Histórico de Duelos */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-xl border border-white/10"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">Histórico de Duelos</h2>
            {!duelHistory || duelHistory.length === 0 ? (
              <p className="text-gray-400">Nenhum duelo registrado ainda.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-3 custom-scrollbar scroll-smooth">
                {duelHistory.map((duel, index) => {
                  try {
                    if (!profileUser || !profileUser.id) {
                      return null;
                    }
                    const currentUserId = typeof profileUser.id === 'string' ? parseInt(profileUser.id, 10) : Number(profileUser.id);
                    
                    let opponent: any;
                    let won: boolean;
                    let isCancelled: boolean;
                    
                    if (duel.opponent) {
                      opponent = duel.opponent;
                      won = duel.result === 'WIN';
                      isCancelled = duel.result === 'CANCELLED';
                      // Ignorar duelos cancelados - não aparecem no histórico
                      if (isCancelled) {
                        return null;
                      }
                    } else {
                      const player1Id = typeof duel.player1?.id === 'string' ? parseInt(duel.player1.id, 10) : Number(duel.player1?.id);
                      const player2Id = typeof duel.player2?.id === 'string' ? parseInt(duel.player2.id, 10) : Number(duel.player2?.id);
                      const isPlayer1 = player1Id === currentUserId;
                      opponent = isPlayer1 ? duel.player2 : duel.player1;
                      won = duel.winnerId === currentUserId;
                      isCancelled = duel.result === 'CANCELLED' || duel.result === 'DRAW';
                      // Ignorar duelos cancelados ou empates - não aparecem no histórico
                      if (isCancelled) {
                        return null;
                      }
                    }
                    
                    const getDuelTypeName = (origin: string | undefined): string => {
                      if (!origin) return 'Duelo';
                      switch (origin.toUpperCase()) {
                        case 'RANDOM': return 'Random Duel';
                        case 'ARENA': return 'Arena Duel';
                        case 'TOURNAMENT': return 'Tournament Duel';
                        case 'CHAT': return 'Chat Duel';
                        default: return 'Duelo';
                      }
                    };
                    
                    const duelTypeName = getDuelTypeName(duel.origin);
                    
                    if (!opponent) {
                      return null;
                    }

                    return (
                      <div
                        key={duel.id}
                        className={`p-4 rounded-xl border-2 ${
                          won 
                            ? 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/20' 
                            : 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Foto do jogador atual */}
                          <img
                            src={getProfileImageUrl(profileUser?.profileImage)}
                            alt={profileUser?.nickname}
                            className="w-12 h-12 rounded-full border-2 border-purple-500/50 object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                            }}
                          />
                          
                          {/* Texto do resultado */}
                          <div className="flex-1">
                            <div className="font-bold text-lg">
                              <span className={won ? 'text-green-400' : 'text-red-400'}>
                                {won ? 'Ganhou' : 'Perdeu'}
                              </span>
                              <span className="text-white"> um {duelTypeName} contra </span>
                              <Link
                                to={`/profile/${opponent?.id ?? ''}`}
                                className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                              >
                                {opponent?.clanTag ? `|${opponent.clanTag}| ` : ''}{opponent?.nickname || 'Desconhecido'}
                              </Link>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {duel.finishedAt 
                                ? `Finalizado em ${new Date(duel.finishedAt).toLocaleString('pt-BR')}`
                                : duel.createdAt
                                ? `Criado em ${new Date(duel.createdAt).toLocaleString('pt-BR')}`
                                : 'Data não disponível'
                              }
                            </div>
                          </div>
                          
                          {/* Foto do oponente (clicável para ir ao perfil) */}
                          <Link to={`/profile/${opponent?.id ?? ''}`} className="flex-shrink-0 rounded-full ring-2 ring-transparent hover:ring-blue-400/50 transition-all" title="Ver perfil">
                            <img
                              src={getProfileImageUrl(opponent?.profileImage)}
                              alt={opponent?.nickname}
                              className="w-12 h-12 rounded-full border-2 border-purple-500/50 object-cover"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                              }}
                            />
                          </Link>
                        </div>
                      </div>
                    );
                  } catch (error: any) {
                    console.error(`❌ [ProfilePage] Erro ao renderizar duelo ${index}:`, error);
                    return null;
                  }
                }).filter((item) => item !== null)}
              </div>
            )}
          </motion.div>
        </div>

        {/* Modal de Amigos */}
        {showFriendsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
            onClick={() => setShowFriendsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 rounded-xl border border-purple-500/30 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  👥 {isOwnProfile ? 'Meus Amigos' : `Amigos de ${profileUser?.nickname}`} ({friends.length})
                </h2>
                <button
                  onClick={() => setShowFriendsModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {loadingFriends ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                  </div>
                ) : friends.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-2">😔</p>
                    <p>{isOwnProfile ? 'Você ainda não tem amigos. Visite perfis de outros usuários para enviar solicitações!' : 'Este usuário ainda não tem amigos.'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {friends.map((friend) => (
                      <motion.div
                        key={friend.id}
                        whileHover={{ scale: 1.02 }}
                        className="p-4 rounded-xl border border-white/20 hover:border-purple-500/50 transition-colors cursor-pointer"
                        onClick={() => {
                          setShowFriendsModal(false);
                          navigate(`/profile/${friend.id}`);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={getProfileImageUrl(friend.profileImage)}
                            alt={friend.nickname}
                            className="w-16 h-16 rounded-full border-2 border-purple-500/50 object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">
                              {friend.clanTag ? `|${friend.clanTag}| ${friend.nickname}` : friend.nickname}
                            </p>
                            <p className="text-sm text-gray-400 truncate">{friend.nickname}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <span className={`w-2 h-2 rounded-full ${friend.isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                              <span>{friend.isOnline ? 'Online' : 'Offline'}</span>
                              <span>•</span>
                              <span>Nível {friend.level || 1}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Modal de Amigos */}
        {showFriendsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
            onClick={() => setShowFriendsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 rounded-xl border border-purple-500/30 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  👥 {isOwnProfile ? 'Meus Amigos' : `Amigos de ${profileUser?.nickname}`} ({friends.length})
                </h2>
                <button
                  onClick={() => setShowFriendsModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {loadingFriends ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                  </div>
                ) : friends.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-2">😔</p>
                    <p>{isOwnProfile ? 'Você ainda não tem amigos. Visite perfis de outros usuários para enviar solicitações!' : 'Este usuário ainda não tem amigos.'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {friends.map((friend) => (
                      <motion.div
                        key={friend.id}
                        whileHover={{ scale: 1.02 }}
                        className="p-4 rounded-xl border border-white/20 hover:border-purple-500/50 transition-colors cursor-pointer"
                        onClick={() => {
                          setShowFriendsModal(false);
                          navigate(`/profile/${friend.id}`);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={getProfileImageUrl(friend.profileImage)}
                            alt={friend.nickname}
                            className="w-16 h-16 rounded-full border-2 border-purple-500/50 object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">
                              {friend.clanTag ? `|${friend.clanTag}| ${friend.nickname}` : friend.nickname}
                            </p>
                            <p className="text-sm text-gray-400 truncate">{friend.nickname}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <span className={`w-2 h-2 rounded-full ${friend.isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                              <span>{friend.isOnline ? 'Online' : 'Offline'}</span>
                              <span>•</span>
                              <span>Nível {friend.level || 1}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Upload de Imagem (Modal) */}
        {isOwnProfile && selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
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
            className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
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
                          e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
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

                {/* Nome de usuário (para login) */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Nome de usuário</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                    placeholder="Usado para fazer login (3 a 30 caracteres)"
                  />
                  <p className="text-xs text-slate-400 mt-1">Só você vê este nome. Outros jogadores veem seu nickname.</p>
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

                {/* Trocar email */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Trocar email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 rounded-lg text-white border border-slate-600/50 focus:border-slate-500 focus:outline-none"
                    placeholder="novo@email.com"
                  />
                  <p className="text-xs text-slate-400 mt-1">Enviaremos um link de confirmação para seu email atual. A troca só será feita após clicar no link.</p>
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

        {/* Modal de Próximos Níveis - abre ao clicar no nível no perfil */}
        {showLevelsModal && (
          <div
            className="fixed inset-0 duel-modal-scrim z-50 flex items-center justify-center p-4"
            onClick={() => setShowLevelsModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="levels-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-gradient-to-br from-gray-900 to-black rounded-xl shadow-2xl border-2 border-purple-500/50 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 id="levels-modal-title" className="text-3xl font-bold text-white flex items-center gap-2">
                    <span>⭐</span> Próximos Níveis
                  </h2>
                  <button
                    onClick={() => setShowLevelsModal(false)}
                    className="text-gray-400 hover:text-white transition-colors text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
                <p className="text-gray-400 text-sm mb-6">Próximos 10 níveis: score necessário para cada nível e quanto falta para alcançar.</p>

                {loadingLevels ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                    <p className="text-gray-400 mt-4">Carregando próximos níveis...</p>
                  </div>
                ) : nextLevels.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">Você já alcançou o nível máximo! 🎉</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-purple-500/30">
                          <th className="text-left py-3 px-4 text-purple-400 font-bold">Nível</th>
                          <th className="text-left py-3 px-4 text-purple-400 font-bold">Score necessário</th>
                          <th className="text-left py-3 px-4 text-purple-400 font-bold">Quanto falta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nextLevels.map((level: any, index: number) => {
                          const currentScore = parseFloat(profileUser?.totalScore || 0);
                          const requiredScore = level.requiredScore || 0;
                          const scoreRemaining = Math.max(0, requiredScore - currentScore);
                          const isNextLevel = index === 0;

                          return (
                            <tr
                              key={level.level}
                              className={`border-b border-gray-700/50 ${
                                isNextLevel ? 'bg-purple-500/10' : ''
                              } hover:bg-gray-800/50 transition-colors`}
                            >
                              <td className="py-3 px-4">
                                <span className={`font-bold ${isNextLevel ? 'text-yellow-400' : 'text-white'}`}>
                                  {level.level}
                                  {isNextLevel && ' ⭐'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-300">
                                {formatScore(requiredScore)} pts
                              </td>
                              <td className="py-3 px-4">
                                <span className={scoreRemaining === 0 ? 'text-green-400' : 'text-yellow-400'}>
                                  {scoreRemaining === 0 ? '✅ Alcançado' : `${formatScore(scoreRemaining)} pts`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-gray-700/50">
                  <p className="text-sm text-gray-400 text-center">
                    Score atual: <span className="text-white font-bold">{formatScore(profileUser?.totalScore)} pts</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

