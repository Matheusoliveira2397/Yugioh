import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Division {
  id: string;
  name: string;
  order: number;
  maxDuelistas: number;
  sobe: number;
  desce: number;
  premiacao?: string;
  premiacaoJson?: any;
  createdAt: string;
  updatedAt: string;
}

export default function AdminDivisionsPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [responseMessage, setResponseMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    order: 1,
    maxDuelistas: 100,
    sobe: 10,
    desce: 10,
    premiacao: '',
    premiacaoJson: null as any,
  });

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchDivisions();
  }, []);

  const fetchDivisions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/divisions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDivisions(response.data || []);
    } catch (error: any) {
      console.error('Erro ao buscar divisões:', error);
      setResponseMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao buscar divisões',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({
      name: '',
      order: divisions.length > 0 ? Math.max(...divisions.map(d => d.order)) + 1 : 1,
      maxDuelistas: 100,
      sobe: 10,
      desce: 10,
      premiacao: '',
      premiacaoJson: null,
    });
    setShowCreateModal(true);
    setResponseMessage(null);
  };

  const handleEdit = (division: Division) => {
    setEditingDivision(division);
    setFormData({
      name: division.name,
      order: division.order,
      maxDuelistas: division.maxDuelistas,
      sobe: division.sobe,
      desce: division.desce,
      premiacao: division.premiacao || '',
      premiacaoJson: division.premiacaoJson || null,
    });
    setShowEditModal(true);
    setResponseMessage(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta divisão?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/admin/divisions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResponseMessage({ type: 'success', text: 'Divisão excluída com sucesso!' });
      fetchDivisions();
    } catch (error: any) {
      console.error('Erro ao excluir divisão:', error);
      setResponseMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao excluir divisão',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      const payload: any = {
        name: formData.name,
        order: formData.order,
        maxDuelistas: formData.maxDuelistas,
        sobe: formData.sobe,
        desce: formData.desce,
      };

      if (formData.premiacao) {
        payload.premiacao = formData.premiacao;
      }

      if (formData.premiacaoJson) {
        payload.premiacaoJson = formData.premiacaoJson;
      }

      if (editingDivision) {
        await axios.put(`${API_URL}/admin/divisions/${editingDivision.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setResponseMessage({ type: 'success', text: 'Divisão atualizada com sucesso!' });
      } else {
        await axios.post(`${API_URL}/admin/divisions`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setResponseMessage({ type: 'success', text: 'Divisão criada com sucesso!' });
      }

      setShowCreateModal(false);
      setShowEditModal(false);
      setEditingDivision(null);
      fetchDivisions();
    } catch (error: any) {
      console.error('Erro ao salvar divisão:', error);
      setResponseMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao salvar divisão',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePremiacaoJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const json = JSON.parse(e.target.value);
      setFormData({ ...formData, premiacaoJson: json });
    } catch (error) {
      // Ignorar JSON inválido temporariamente
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin')}
            className="mb-4 text-purple-400 hover:text-purple-300 transition-colors"
          >
            ← Voltar ao Painel Admin
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold text-white mb-2">Gerenciar Divisões</h1>
            <button
              onClick={handleCreate}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all font-semibold"
            >
              + Nova Divisão
            </button>
          </div>
          <p className="text-gray-400">Gerencie as divisões do ranking da season</p>
        </div>

        {/* Mensagem de resposta */}
        {responseMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg ${
              responseMessage.type === 'success'
                ? 'bg-green-500/20 text-green-300 border border-green-500/50'
                : 'bg-red-500/20 text-red-300 border border-red-500/50'
            }`}
          >
            {responseMessage.text}
          </motion.div>
        )}

        {/* Lista de Divisões */}
        {loading && divisions.length === 0 ? (
          <div className="text-center text-gray-400 py-12">Carregando divisões...</div>
        ) : divisions.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            Nenhuma divisão cadastrada. Clique em "Nova Divisão" para começar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {divisions.map((division) => (
              <motion.div
                key={division.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20 hover:border-purple-500/40 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">{division.name}</h3>
                    <p className="text-sm text-gray-400">Ordem: {division.order}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(division)}
                      className="px-3 py-1 bg-blue-600/50 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(division.id)}
                      className="px-3 py-1 bg-red-600/50 hover:bg-red-600 text-white rounded text-sm transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Máx. Duelistas:</span>
                    <span className="text-white font-semibold">{division.maxDuelistas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sobe:</span>
                    <span className="text-green-400 font-semibold">{division.sobe}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Desce:</span>
                    <span className="text-red-400 font-semibold">{division.desce}</span>
                  </div>
                  {division.premiacao && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <span className="text-gray-400 text-xs">Premiação:</span>
                      <p className="text-white text-xs mt-1">{division.premiacao}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Modal Criar/Editar */}
        {(showCreateModal || showEditModal) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-purple-500/30"
            >
              <h2 className="text-2xl font-bold text-white mb-6">
                {editingDivision ? 'Editar Divisão' : 'Nova Divisão'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-gray-300 mb-2">Nome da Divisão</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-300 mb-2">Ordem</label>
                    <input
                      type="number"
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      required
                      min="1"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-2">Máx. Duelistas</label>
                    <input
                      type="number"
                      value={formData.maxDuelistas}
                      onChange={(e) => setFormData({ ...formData, maxDuelistas: parseInt(e.target.value) || 100 })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      required
                      min="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-300 mb-2">Sobe (quantidade)</label>
                    <input
                      type="number"
                      value={formData.sobe}
                      onChange={(e) => setFormData({ ...formData, sobe: parseInt(e.target.value) || 10 })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      required
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-2">Desce (quantidade)</label>
                    <input
                      type="number"
                      value={formData.desce}
                      onChange={(e) => setFormData({ ...formData, desce: parseInt(e.target.value) || 10 })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      required
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 mb-2">Premiação (texto)</label>
                  <textarea
                    value={formData.premiacao}
                    onChange={(e) => setFormData({ ...formData, premiacao: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                    rows={3}
                    placeholder="Ex: 1000 créditos, 5 cartas raras..."
                  />
                </div>

                <div>
                  <label className="block text-gray-300 mb-2">Premiação (JSON - opcional)</label>
                  <textarea
                    onChange={handlePremiacaoJsonChange}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none font-mono text-sm"
                    rows={5}
                    placeholder='{"credits": 1000, "cards": 5, "items": []}'
                  />
                  <p className="text-xs text-gray-500 mt-1">Formato JSON estruturado para premiação</p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : editingDivision ? 'Atualizar' : 'Criar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                      setEditingDivision(null);
                    }}
                    className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

