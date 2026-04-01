import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface MaletaTemplate {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  bonusDecks: number;
  bonusMaletaCapacity: number;
  priceCredits: number | null;
  priceCash: number | null;
  isActive: boolean;
  isForSale: boolean;
  createdAt: string;
}

export default function AdminBriefcasesPanel() {
  const [maletas, setMaletas] = useState<MaletaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMaleta, setEditingMaleta] = useState<MaletaTemplate | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    bonusDecks: 0,
    bonusMaletaCapacity: 0,
    priceCredits: 0,
    priceCash: 0,
    isActive: true,
    isForSale: true,
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadMaletas();
  }, []);

  const loadMaletas = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/maletas', { timeout: 10000 });
      setMaletas(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      console.error('Erro ao carregar maletas:', error);
      setMaletas([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      image: '',
      bonusDecks: 0,
      bonusMaletaCapacity: 0,
      priceCredits: 0,
      priceCash: 0,
      isActive: true,
      isForSale: true,
    });
    setEditingMaleta(null);
  };

  const handleEdit = (m: MaletaTemplate) => {
    setEditingMaleta(m);
    setFormData({
      name: m.name || '',
      description: m.description || '',
      image: m.image || '',
      bonusDecks: m.bonusDecks ?? 0,
      bonusMaletaCapacity: m.bonusMaletaCapacity ?? 0,
      priceCredits: m.priceCredits ?? 0,
      priceCash: m.priceCash ?? 0,
      isActive: m.isActive,
      isForSale: m.isForSale,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        image: formData.image?.trim() || null,
        bonusDecks: Number(formData.bonusDecks) || 0,
        bonusMaletaCapacity: Number(formData.bonusMaletaCapacity) || 0,
        priceCredits: Number(formData.priceCredits) || null,
        priceCash: Number(formData.priceCash) || null,
        isActive: formData.isActive,
        isForSale: formData.isForSale,
      };

      if (editingMaleta) {
        await api.put(`/admin/maletas/${editingMaleta.id}`, payload);
        setMessage({ type: 'success', text: '✅ Maleta atualizada com sucesso!' });
      } else {
        await api.post('/admin/maletas', payload);
        setMessage({ type: 'success', text: '✅ Maleta criada com sucesso!' });
      }

      resetForm();
      setShowForm(false);
      loadMaletas();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar esta maleta? Usuários que a possuem manterão seus limites atuais, mas não conseguirão comprar novamente.')) return;
    setLoading(true);
    try {
      await api.delete(`/admin/maletas/${id}`);
      setMessage({ type: 'success', text: '✅ Maleta deletada com sucesso!' });
      loadMaletas();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || '❌ Erro ao deletar maleta' });
      setLoading(false);
    }
  };

  const filteredMaletas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return maletas.filter((m) => {
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q);
      const matchesFilter =
        filter === 'all' || (filter === 'active' && m.isActive) || (filter === 'inactive' && !m.isActive);
      return matchesSearch && matchesFilter;
    });
  }, [maletas, filter, searchTerm]);

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-amber-900/10 to-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-4xl font-bold mb-2">🧳 Gerenciamento de Maletas</h1>
              <p className="text-gray-300 text-sm">Crie níveis que aumentam decks e capacidade da maleta.</p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(!showForm);
                }}
                className="bg-amber-600 hover:bg-amber-700 px-6 py-3 rounded-lg font-bold transition-all"
              >
                {showForm ? '❌ Cancelar' : '➕ Nova Maleta'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar maleta..."
              className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500 text-sm text-white"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500 text-sm text-white"
            >
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="all">Todas</option>
            </select>
          </div>
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-900/50 border border-green-500' : 'bg-red-900/50 border border-red-500'
            }`}
          >
            <p className="text-white font-semibold">{message.text}</p>
          </motion.div>
        )}

        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-lg p-6 mb-8"
          >
            <h2 className="text-2xl font-bold mb-6">{editingMaleta ? '✏️ Editar Maleta' : '➕ Nova Maleta'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Nome *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Imagem (URL)</label>
                  <input
                    type="text"
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                    placeholder="https://... ou /uploads/... (opcional)"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold mb-2">Descrição</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Bônus de Decks</label>
                  <input
                    type="number"
                    value={formData.bonusDecks}
                    onChange={(e) => setFormData({ ...formData, bonusDecks: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Bônus de Cartas na Maleta</label>
                  <input
                    type="number"
                    value={formData.bonusMaletaCapacity}
                    onChange={(e) => setFormData({ ...formData, bonusMaletaCapacity: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Preço em Créditos</label>
                  <input
                    type="number"
                    value={formData.priceCredits}
                    onChange={(e) => setFormData({ ...formData, priceCredits: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Preço em Cash</label>
                  <input
                    type="number"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Status (Ativa?)</label>
                  <select
                    value={formData.isActive ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  >
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Disponível na Loja?</label>
                  <select
                    value={formData.isForSale ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, isForSale: e.target.value === 'true' })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  >
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 font-bold">
                  Cancelar
                </button>
                <button type="submit" className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 font-bold text-white" disabled={loading}>
                  {editingMaleta ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-bold mb-4">Níveis cadastrados</h2>
          {loading ? (
            <p className="text-gray-300">Carregando...</p>
          ) : filteredMaletas.length === 0 ? (
            <p className="text-gray-300">Nenhuma maleta encontrada.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMaletas.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-gray-700 bg-gray-900/40 p-4"
                >
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 rounded-lg bg-amber-600/20 border border-amber-500/30 flex items-center justify-center font-bold text-amber-200">
                      🧳
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white truncate">{m.name}</p>
                        {!m.isActive ? (
                          <span className="text-xs px-2 py-1 rounded bg-red-900/50 border border-red-500 text-red-200">Inativa</span>
                        ) : !m.isForSale ? (
                          <span className="text-xs px-2 py-1 rounded bg-amber-900/50 border border-amber-500/40 text-amber-200">Fora da loja</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-green-900/50 border border-green-500 text-green-200">Ativa</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mt-1">
                        +{m.bonusDecks} deck(s) • +{m.bonusMaletaCapacity} cartas
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        💰 {m.priceCredits ?? 0} créditos • 💵 {m.priceCash ?? 0} cash
                      </p>
                      {m.description ? <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">{m.description}</p> : null}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end mt-4 flex-wrap">
                    <button
                      onClick={() => handleEdit(m)}
                      className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 font-bold text-sm"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-500/30 text-red-100 hover:bg-red-900/50 font-bold text-sm"
                    >
                      Deletar
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

