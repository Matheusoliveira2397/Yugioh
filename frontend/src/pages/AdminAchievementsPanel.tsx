import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface User {
  id: number;
  username: string;
  nickname: string;
  profileImage?: string;
}

export default function AdminAchievementsPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [manualIdentifiers, setManualIdentifiers] = useState<string>(''); // IDs ou nicknames separados por vírgula
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseMessage, setResponseMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 1000 }
      });
      setUsers(response.data.users || response.data || []);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUserToggle = (userId: number) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const filteredUsers = users.filter(u => 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.nickname.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    }
  };

  const handleSendAchievement = async () => {
    if (!title.trim()) {
      setResponseMessage({ type: 'error', text: 'O título da conquista é obrigatório.' });
      return;
    }

    // Combinar IDs selecionados da lista com identificadores manuais
    const manualIds = manualIdentifiers
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
    
    const allIdentifiers = [
      ...selectedUserIds.map(id => id.toString()),
      ...manualIds
    ];

    if (allIdentifiers.length === 0) {
      setResponseMessage({ type: 'error', text: 'Selecione ou digite pelo menos um usuário (ID ou nickname).' });
      return;
    }

    setLoading(true);
    setResponseMessage(null);

    try {
      const formData = new FormData();
      formData.append('userIds', allIdentifiers.join(','));
      formData.append('title', title);
      formData.append('description', description);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await axios.post(
        `${API_URL}/admin/achievements/send`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          }
        }
      );

      setResponseMessage({ 
        type: 'success', 
        text: `Conquista enviada para ${response.data.sentCount} usuário(s) com sucesso!` 
      });
      
      // Limpar formulário
      setTitle('');
      setDescription('');
      setImageFile(null);
      setImagePreview(null);
      setSelectedUserIds([]);
      setManualIdentifiers('');
    } catch (error: any) {
      console.error('Erro ao enviar conquista:', error);
      setResponseMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Erro ao enviar conquista.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.nickname.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen p-8 relative z-10"
    >
      <div className="max-w-4xl mx-auto bg-slate-800/70 backdrop-blur-md rounded-xl shadow-2xl border border-purple-500/30 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-purple-400">🏆</span> Enviar Conquista
          </h1>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            ← Voltar
          </button>
        </div>

        {/* Formulário */}
        <div className="space-y-6">
          {/* Título */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-2">
              Título da Conquista: *
            </label>
            <input
              id="title"
              type="text"
              className="w-full p-3 bg-slate-700 border border-purple-500/50 rounded-lg text-white placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Ex: Campeão do Torneio"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
              Descrição:
            </label>
            <textarea
              id="description"
              rows={3}
              className="w-full p-3 bg-slate-700 border border-purple-500/50 rounded-lg text-white placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500 resize-y"
              placeholder="Descreva a conquista..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            ></textarea>
          </div>

          {/* Imagem */}
          <div>
            <label htmlFor="image" className="block text-sm font-medium text-gray-300 mb-2">
              Imagem da Conquista:
            </label>
            {imagePreview && (
              <div className="mb-3">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-32 h-32 object-cover rounded-lg border-2 border-purple-500"
                />
              </div>
            )}
            <input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={loading}
              className="w-full p-3 bg-slate-700 border border-purple-500/50 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
            />
          </div>

          {/* Seleção de Usuários */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-300">
                Selecionar Usuários: *
              </label>
              <button
                onClick={handleSelectAll}
                className="text-sm text-purple-400 hover:text-purple-300"
                disabled={loading}
              >
                {selectedUserIds.length === filteredUsers.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>
            </div>

            {/* Input Manual para IDs ou Nicknames */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Ou digite IDs ou nicknames (separados por vírgula):
              </label>
              <input
                type="text"
                placeholder="Ex: 1,2,3 ou admin,player1,player2"
                value={manualIdentifiers}
                onChange={(e) => setManualIdentifiers(e.target.value)}
                className="w-full p-2 bg-slate-700 border border-purple-500/50 rounded-lg text-white placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500"
                disabled={loading}
              />
              <p className="text-xs text-gray-400 mt-1">
                Você pode usar IDs numéricos ou nicknames. Exemplo: "1,admin,2" ou "player1,player2"
              </p>
            </div>
            
            {/* Busca */}
            <input
              type="text"
              placeholder="Buscar usuário na lista..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 mb-3 bg-slate-700 border border-purple-500/50 rounded-lg text-white placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500"
              disabled={loading}
            />

            {/* Lista de Usuários */}
            <div className="max-h-64 overflow-y-auto bg-slate-900/50 rounded-lg border border-purple-500/30 p-3">
              {filteredUsers.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Nenhum usuário encontrado</p>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 p-2 hover:bg-slate-800/50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                        disabled={loading}
                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                      />
                      <img
                        src={getProfileImageUrl(user.profileImage)}
                        alt={user.nickname}
                        className="w-8 h-8 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                        }}
                      />
                      <div className="flex-1">
                        <p className="text-white font-semibold">{user.nickname}</p>
                        <p className="text-gray-400 text-sm">@{user.username}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {selectedUserIds.length} usuário(s) selecionado(s) da lista
              {manualIdentifiers && ` + ${manualIdentifiers.split(',').filter(id => id.trim().length > 0).length} identificador(es) manual(is)`}
            </p>
          </div>

          {/* Mensagem de Resposta */}
          {responseMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-lg text-sm font-medium ${
                responseMessage.type === 'success' 
                  ? 'bg-green-500/20 text-green-300 border border-green-500/50' 
                  : 'bg-red-500/20 text-red-300 border border-red-500/50'
              }`}
            >
              {responseMessage.text}
            </motion.div>
          )}

          {/* Botões */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="px-6 py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleSendAchievement}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              Enviar Conquista
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

