import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const ProfilePage: React.FC = () => {
  const { user, token } = useAuthStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validações básicas
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

    // Cria preview local
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!token || !user || !selectedFile) return;

    setLoading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('profileImage', selectedFile);

      const response = await axios.post(
        `${API_URL}/users/${user.id}/profile-image`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const newImageUrl = response.data.profileImage;

      // Atualiza o user no store
      useAuthStore.setState({
        user: { ...user, profileImage: newImageUrl },
      });

      setSelectedFile(null);
      setPreviewUrl(null);
      setMessage('✅ Imagem de perfil atualizada com sucesso!');

      // Força reload da página após 1 segundo para garantir que a nova imagem carregue
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      setMessage('❌ Erro ao fazer upload: ' + (error.response?.data?.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <p className="text-white text-xl">Carregando...</p>
      </div>
    );
  }

  const currentImageUrl = previewUrl || `${API_URL}${user.profileImage}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold text-yellow-400 mb-2">⚙️ Perfil do Duelista</h1>
          <p className="text-gray-300">Personalize sua imagem de perfil</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Preview do Perfil */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border-2 border-purple-500/30"
          >
            <h2 className="text-2xl font-bold text-purple-400 mb-6 text-center">Preview</h2>
            
            <div className="flex flex-col items-center">
              <motion.div
                key={currentImageUrl}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-48 h-48 rounded-full overflow-hidden border-4 border-gradient-to-r from-purple-500 to-blue-500 shadow-2xl mb-4"
              >
                <img
                  src={currentImageUrl}
                  alt="Imagem de Perfil"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/avatars/default.png';
                  }}
                />
              </motion.div>

              {previewUrl && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-green-400 mb-2"
                >
                  ✨ Preview da nova imagem
                </motion.div>
              )}

              <h3 className="text-2xl font-bold text-yellow-400 mb-2">{user.nickname}</h3>
              <p className="text-gray-400 mb-1">@{user.username}</p>
              <p className="text-sm text-gray-500 mb-4">{user.email}</p>

              <div className="flex gap-4 text-sm">
                <div className="bg-green-500/20 px-4 py-2 rounded-lg">
                  <span className="text-green-400 font-bold">{user.wins}</span>
                  <span className="text-gray-400 ml-1">Vitórias</span>
                </div>
                <div className="bg-red-500/20 px-4 py-2 rounded-lg">
                  <span className="text-red-400 font-bold">{user.losses}</span>
                  <span className="text-gray-400 ml-1">Derrotas</span>
                </div>
              </div>

              <div className="mt-4 bg-blue-500/20 px-6 py-3 rounded-lg">
                <span className="text-blue-400 font-bold text-lg">Rating: {user.rating}</span>
              </div>

              <div className="mt-2 bg-purple-500/20 px-6 py-3 rounded-lg">
                <span className="text-purple-400 font-bold text-lg">💎 {user.gems} Gemas</span>
              </div>
            </div>
          </motion.div>

          {/* Upload de Imagem */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border-2 border-purple-500/30"
          >
            <h2 className="text-2xl font-bold text-purple-400 mb-6 text-center">📸 Envie sua Foto</h2>

            {/* Input de Upload */}
            <div className="mb-6">
              <label
                htmlFor="profile-upload"
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-purple-500/50 rounded-lg cursor-pointer bg-purple-500/5 hover:bg-purple-500/10 transition-all"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg
                    className="w-16 h-16 mb-4 text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mb-2 text-lg text-gray-300">
                    <span className="font-semibold">Clique para enviar</span>
                  </p>
                  <p className="text-sm text-gray-400">ou arraste e solte</p>
                  <p className="text-xs text-gray-500 mt-2">PNG, JPG, WEBP (MAX. 5MB)</p>
                </div>
                <input
                  id="profile-upload"
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {/* Botão de Upload */}
            {selectedFile && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleUpload}
                disabled={loading}
                className={`w-full py-4 rounded-lg font-bold text-xl mb-4 transition-all ${
                  loading
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/50'
                }`}
              >
                {loading ? '⏳ Enviando...' : '✨ Salvar Imagem de Perfil'}
              </motion.button>
            )}

            {/* Mensagem de Feedback */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 p-4 rounded-lg text-center font-semibold ${
                  message.includes('✅')
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                    : 'bg-red-500/20 text-red-400 border border-red-500/50'
                }`}
              >
                {message}
              </motion.div>
            )}

            {/* Info */}
            <div className="mt-6 p-4 bg-blue-500/10 border-l-4 border-blue-500 rounded">
              <p className="text-sm text-blue-300">
                💡 <strong>Dica:</strong> Escolha uma imagem clara e bem iluminada para melhor visualização no seu perfil!
              </p>
            </div>

            {/* Info Técnica */}
            <div className="mt-4 p-4 bg-purple-500/10 border-l-4 border-purple-500 rounded">
              <p className="text-xs text-purple-300">
                🔒 <strong>Segurança:</strong> Sua imagem é salva de forma segura no servidor e só você pode alterá-la.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
