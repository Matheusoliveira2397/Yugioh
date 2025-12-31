import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface SocialMedia {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  icon: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminSocialMediaPanel() {
  const { user, token } = useAuthStore();
  const [socialMedia, setSocialMedia] = useState<SocialMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    platform: '',
    url: '',
    label: '',
    icon: '',
    order: 0,
    isActive: true,
  });

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchSocialMedia();
  }, []);

  const fetchSocialMedia = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/social-media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSocialMedia(response.data);
    } catch (error) {
      console.error('Erro ao buscar redes sociais:', error);
      alert('Erro ao buscar redes sociais');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.platform || !formData.url) {
      alert('Preencha pelo menos a plataforma e a URL');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/admin/social-media`,
        {
          ...formData,
          label: formData.label || null,
          icon: formData.icon || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchSocialMedia();
      resetForm();
      alert('Rede social criada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao criar rede social:', error);
      alert(error.response?.data?.message || 'Erro ao criar rede social');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/admin/social-media/${id}`,
        {
          ...formData,
          label: formData.label || null,
          icon: formData.icon || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchSocialMedia();
      setEditingId(null);
      resetForm();
      alert('Rede social atualizada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao atualizar rede social:', error);
      alert(error.response?.data?.message || 'Erro ao atualizar rede social');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta rede social?')) {
      return;
    }

    try {
      setSaving(true);
      await axios.delete(`${API_URL}/admin/social-media/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchSocialMedia();
      alert('Rede social excluída com sucesso!');
    } catch (error: any) {
      console.error('Erro ao excluir rede social:', error);
      alert(error.response?.data?.message || 'Erro ao excluir rede social');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (social: SocialMedia) => {
    setEditingId(social.id);
    setFormData({
      platform: social.platform,
      url: social.url,
      label: social.label || '',
      icon: social.icon || '',
      order: social.order,
      isActive: social.isActive,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      platform: '',
      url: '',
      label: '',
      icon: '',
      order: 0,
      isActive: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            📱 Gerenciar Redes Sociais
          </h1>
          <p className="text-gray-400">
            Configure os links das redes sociais que aparecem abaixo do chat
          </p>
        </div>

        {/* Formulário de Criação/Edição */}
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">
            {editingId ? 'Editar Rede Social' : 'Nova Rede Social'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-300 mb-2">Plataforma *</label>
              <input
                type="text"
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                placeholder="Ex: discord, youtube, twitter"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">URL *</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://..."
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">Label (opcional)</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Ex: Nosso Discord"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">Ícone (emoji, opcional)</label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="Ex: 💬, 📺"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">Ordem</label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-5 h-5"
                />
                Ativo
              </label>
            </div>
          </div>
          <div className="flex gap-4 mt-6">
            {editingId ? (
              <>
                <button
                  onClick={() => handleUpdate(editingId)}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold disabled:opacity-50"
              >
                {saving ? 'Criando...' : 'Criar Rede Social'}
              </button>
            )}
          </div>
        </div>

        {/* Lista de Redes Sociais */}
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Redes Sociais Configuradas</h2>
          {socialMedia.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhuma rede social configurada</p>
          ) : (
            <div className="space-y-4">
              {socialMedia.map((social, index) => (
                <motion.div
                  key={social.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-lg border-2 ${
                    social.isActive ? 'bg-gray-700/50 border-green-500/50' : 'bg-gray-800/50 border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{social.icon || '🔗'}</span>
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {social.label || social.platform}
                        </h3>
                        <p className="text-sm text-gray-400">{social.url}</p>
                        <p className="text-xs text-gray-500">
                          Plataforma: {social.platform} | Ordem: {social.order}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          social.isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {social.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                      <button
                        onClick={() => startEdit(social)}
                        disabled={saving || editingId !== null}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(social.id)}
                        disabled={saving || editingId !== null}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

