import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import CardManagement from '../components/admin/CardManagement';
import UserManagement from '../components/admin/UserManagement';
import SeasonManagement from '../components/admin/SeasonManagement';
import NewsManagement from '../components/admin/NewsManagement';

type TabType = 'cards' | 'users' | 'seasons' | 'economy' | 'news';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('cards');
  const { user } = useAuthStore();

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const tabs = [
    { id: 'cards' as TabType, label: '🃏 Cartas', icon: '🎴' },
    { id: 'users' as TabType, label: '👥 Usuários', icon: '👤' },
    { id: 'news' as TabType, label: '📰 Notícias', icon: '📢' },
    { id: 'seasons' as TabType, label: '📅 Seasons', icon: '🏆' },
    { id: 'economy' as TabType, label: '💰 Economia', icon: '💵' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="text-6xl">⚙️</span>
            <div>
              <h1 className="text-5xl font-bold text-white">Painel Administrativo</h1>
              <p className="text-slate-400 text-lg">
                Gerenciamento completo do sistema
              </p>
            </div>
          </div>

          {/* Badge de Admin */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg">
            <span className="text-2xl">👑</span>
            <span className="text-yellow-400 font-bold">
              {user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}
            </span>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
                ${activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                }
              `}
            >
              <span className="text-2xl">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700"
        >
          {activeTab === 'cards' && <CardManagement />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'news' && <NewsManagement />}
          {activeTab === 'seasons' && <SeasonManagement />}
          {activeTab === 'economy' && (
            <div className="text-center text-slate-400 py-12">
              <span className="text-6xl mb-4 block">🚧</span>
              <p className="text-xl">Em desenvolvimento</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
