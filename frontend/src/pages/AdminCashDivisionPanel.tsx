import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CashDivisionConfig {
  dayOfWeek: number | null;
  time: string | null;
  defaultMembers: number | null;
}

export default function AdminCashDivisionPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<CashDivisionConfig>({
    dayOfWeek: null,
    time: null,
    defaultMembers: null,
  });
  const [responseMessage, setResponseMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/groups/cash-division/default`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfig(response.data || { dayOfWeek: null, time: null, defaultMembers: null });
    } catch (error: any) {
      console.error('Erro ao buscar configuração:', error);
      setResponseMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao buscar configuração',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!config.dayOfWeek && config.dayOfWeek !== 0) {
      setResponseMessage({ type: 'error', text: 'Selecione um dia da semana' });
      return;
    }

    if (!config.time) {
      setResponseMessage({ type: 'error', text: 'Selecione um horário' });
      return;
    }

    if (!config.defaultMembers || config.defaultMembers < 1) {
      setResponseMessage({ type: 'error', text: 'Número de membros deve ser pelo menos 1' });
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/groups/cash-division/default`,
        {
          dayOfWeek: config.dayOfWeek,
          time: config.time,
          defaultMembers: config.defaultMembers,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setResponseMessage({ type: 'success', text: 'Configuração salva com sucesso!' });
      setTimeout(() => setResponseMessage(null), 3000);
    } catch (error: any) {
      console.error('Erro ao salvar configuração:', error);
      setResponseMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao salvar configuração',
      });
    } finally {
      setSaving(false);
    }
  };

  const daysOfWeek = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
  ];

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="text-6xl">💰</span>
            <div>
              <h1 className="text-5xl font-bold text-white">Divisão de Cash dos Grupos</h1>
              <p className="text-slate-400 text-lg">
                Configure quando e como o cash dos grupos será dividido automaticamente
              </p>
            </div>
          </div>
        </motion.div>

        {/* Mensagem de resposta */}
        {responseMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg ${
              responseMessage.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {responseMessage.text}
          </motion.div>
        )}

        {/* Formulário */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/30 rounded-2xl border border-slate-700/50 p-8"
        >
          <form onSubmit={handleSave} className="space-y-6">
            {/* Dia da Semana */}
            <div>
              <label className="block text-slate-300 font-semibold mb-2">
                Dia da Semana
              </label>
              <select
                value={config.dayOfWeek ?? ''}
                onChange={(e) => setConfig({ ...config, dayOfWeek: e.target.value ? parseInt(e.target.value, 10) : null })}
                className="w-full px-4 py-3 bg-slate-900/30 border border-slate-700/50 rounded-xl text-white focus:border-purple-500 focus:outline-none"
                required
              >
                <option value="">Selecione um dia</option>
                {daysOfWeek.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              <p className="text-slate-400 text-sm mt-1">
                O cash será dividido toda semana neste dia
              </p>
            </div>

            {/* Horário */}
            <div>
              <label className="block text-slate-300 font-semibold mb-2">
                Horário
              </label>
              <input
                type="time"
                value={config.time || ''}
                onChange={(e) => setConfig({ ...config, time: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900/30 border border-slate-700/50 rounded-xl text-white focus:border-purple-500 focus:outline-none"
                required
              />
              <p className="text-slate-400 text-sm mt-1">
                Horário exato em que a divisão será executada (formato: HH:mm)
              </p>
            </div>

            {/* Número Padrão de Membros */}
            <div>
              <label className="block text-slate-300 font-semibold mb-2">
                Número Padrão de Membros para Divisão
              </label>
              <input
                type="number"
                min="1"
                value={config.defaultMembers ?? ''}
                onChange={(e) => setConfig({ ...config, defaultMembers: e.target.value ? parseInt(e.target.value, 10) : null })}
                className="w-full px-4 py-3 bg-slate-900/30 border border-slate-700/50 rounded-xl text-white focus:border-purple-500 focus:outline-none"
                placeholder="Ex: 10"
                required
              />
              <p className="text-slate-400 text-sm mt-1">
                Número padrão de membros que receberão cash. Os líderes podem alterar este valor para seus grupos.
              </p>
            </div>

            {/* Informações */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h3 className="text-blue-400 font-semibold mb-2">ℹ️ Como funciona:</h3>
              <ul className="text-slate-300 text-sm space-y-1 list-disc list-inside">
                <li>O cash total do grupo será dividido igualmente entre o número de membros configurado</li>
                <li>Se o grupo tiver menos membros que o configurado, apenas os membros existentes receberão</li>
                <li>O cash restante (se houver) permanece no grupo</li>
                <li>Os líderes podem configurar um número diferente de membros para seus grupos específicos</li>
              </ul>
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving || loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando...' : 'Salvar Configuração'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all"
              >
                Voltar
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

