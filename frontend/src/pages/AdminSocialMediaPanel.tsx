import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import { InstagramIcon, WhatsAppIcon, DiscordIcon, YouTubeIcon } from '../components/SocialMediaIcons';
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

  const handleSocialMediaUpdate = (platform: string, url: string) => {
    const existing = socialMedia.find(s => s.platform.toLowerCase() === platform.toLowerCase());
    if (existing) {
      // Atualizar existente
      const updated = socialMedia.map(s => 
        s.platform.toLowerCase() === platform.toLowerCase() 
          ? { ...s, url, isActive: url.trim() !== '' }
          : s
      );
      setSocialMedia(updated);
    } else {
      // Criar novo (ícones são renderizados via SVG, não precisamos salvar emoji)
      const newSocial: SocialMedia = {
        id: '',
        platform: platform.toLowerCase(),
        url,
        label: null,
        icon: null, // Ícones são renderizados via SVG
        order: 0,
        isActive: url.trim() !== '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSocialMedia([...socialMedia, newSocial]);
    }
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      
      const platforms = ['instagram', 'whatsapp', 'discord', 'youtube'];
      
      // Processar cada plataforma
      for (const platform of platforms) {
        const social = socialMedia.find(s => s.platform.toLowerCase() === platform);
        
        if (social) {
          if (social.id) {
            // Atualizar existente
            await axios.put(
              `${API_URL}/admin/social-media/${social.id}`,
              {
                url: social.url,
                isActive: social.url.trim() !== '',
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else if (social.url.trim() !== '') {
            // Criar novo
            await axios.post(
              `${API_URL}/admin/social-media`,
              {
                platform: platform.toLowerCase(),
                url: social.url,
                label: null,
                icon: null, // Ícones são renderizados via SVG
                order: 0,
                isActive: true,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        } else {
          // Se não existe, verificar se há uma entrada no banco que precisa ser desativada
          // Isso será tratado automaticamente quando buscarmos novamente
        }
      }
      
      await fetchSocialMedia();
      alert('Redes sociais salvas com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar redes sociais:', error);
      alert(error.response?.data?.message || 'Erro ao salvar redes sociais');
    } finally {
      setSaving(false);
    }
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
            Configure os links das redes sociais que aparecem no rodapé do jogo
          </p>
        </div>

        {/* Formulário de Configuração das Redes Sociais Principais */}
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">
            Configurar Links das Redes Sociais
          </h2>
          <div className="space-y-4">
            {/* Instagram */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <InstagramIcon className="w-6 h-6 text-pink-500" />
                <h3 className="text-lg font-bold text-white">Instagram</h3>
              </div>
              <input
                type="url"
                value={socialMedia.find(s => s.platform.toLowerCase() === 'instagram')?.url || ''}
                onChange={(e) => handleSocialMediaUpdate('instagram', e.target.value)}
                placeholder="https://instagram.com/seu-perfil"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-pink-500 focus:outline-none"
              />
            </div>

            {/* WhatsApp */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <WhatsAppIcon className="w-6 h-6 text-green-500" />
                <h3 className="text-lg font-bold text-white">WhatsApp</h3>
              </div>
              <input
                type="url"
                value={socialMedia.find(s => s.platform.toLowerCase() === 'whatsapp')?.url || ''}
                onChange={(e) => handleSocialMediaUpdate('whatsapp', e.target.value)}
                placeholder="https://wa.me/seu-numero"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
              />
            </div>

            {/* Discord */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <DiscordIcon className="w-6 h-6 text-indigo-500" />
                <h3 className="text-lg font-bold text-white">Discord</h3>
              </div>
              <input
                type="url"
                value={socialMedia.find(s => s.platform.toLowerCase() === 'discord')?.url || ''}
                onChange={(e) => handleSocialMediaUpdate('discord', e.target.value)}
                placeholder="https://discord.gg/seu-servidor"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* YouTube */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <YouTubeIcon className="w-6 h-6 text-red-500" />
                <h3 className="text-lg font-bold text-white">YouTube</h3>
              </div>
              <input
                type="url"
                value={socialMedia.find(s => s.platform.toLowerCase() === 'youtube')?.url || ''}
                onChange={(e) => handleSocialMediaUpdate('youtube', e.target.value)}
                placeholder="https://youtube.com/@seu-canal"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold disabled:opacity-50 transition-all"
            >
              {saving ? 'Salvando...' : '💾 Salvar Todas as Configurações'}
            </button>
          </div>
        </div>

      </motion.div>
    </div>
  );
}

