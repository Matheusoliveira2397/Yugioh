import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface SiteTab {
  id: string;
  key: string;
  label: string;
  route: string;
  icon: string;
  isActive: boolean;
  order: number;
}

export default function AdminSiteTabsPanel() {
  const { user, token } = useAuthStore();
  const [tabs, setTabs] = useState<SiteTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchTabs();
  }, []);

  const fetchTabs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/site-tabs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTabs(response.data);
    } catch (error) {
      console.error('Erro ao buscar abas:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTab = async (key: string, currentStatus: boolean) => {
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/admin/site-tabs/${key}`,
        { isActive: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTabs((prev) =>
        prev.map((tab) => (tab.key === key ? { ...tab, isActive: !currentStatus } : tab))
      );
    } catch (error) {
      console.error('Erro ao atualizar aba:', error);
      alert('Erro ao atualizar aba. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const initializeTabs = async () => {
    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/admin/site-tabs/initialize`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchTabs();
      alert('Abas inicializadas com sucesso!');
    } catch (error) {
      console.error('Erro ao inicializar abas:', error);
      alert('Erro ao inicializar abas. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-5xl">🔧</span>
              <div>
                <h1 className="text-4xl font-bold text-white">Gerenciar Abas do Site</h1>
                <p className="text-slate-400">Ative ou desative abas do menu de navegação</p>
              </div>
            </div>
            <button
              onClick={initializeTabs}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Inicializar Abas'}
            </button>
          </div>
        </motion.div>

        {/* Lista de Abas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabs.map((tab, index) => (
            <motion.div
              key={tab.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-gray-800/50 rounded-lg p-4 border-2 ${
                tab.isActive ? 'border-green-500/50' : 'border-gray-700/50'
              }`}
            >
              <div className="flex items-center justify-between mb-3 min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-2xl bg-gray-700/50 rounded-lg overflow-hidden min-w-[2.5rem]" title={tab.icon || undefined}>
                    <span className="overflow-hidden text-ellipsis max-w-full block truncate">{tab.icon || '📑'}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-white truncate" title={tab.label}>{tab.label}</h3>
                    <p className="text-xs text-gray-400 truncate" title={tab.route}>{tab.route}</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tab.isActive}
                    onChange={() => toggleTab(tab.key, tab.isActive)}
                    disabled={saving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`px-2 py-1 rounded ${
                  tab.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-500'
                }`}>
                  {tab.isActive ? 'Ativa' : 'Inativa'}
                </span>
                <span className="text-gray-600">Ordem: {tab.order}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Botão Voltar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <button
            onClick={() => window.history.back()}
            className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-all"
          >
            ← Voltar
          </button>
        </motion.div>
      </div>
    </div>
  );
}

