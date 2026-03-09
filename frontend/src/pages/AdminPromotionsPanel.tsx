import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface CardPromotion {
  id: string;
  cardId: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  label: string | null;
  createdAt: string;
  card?: { id: string; name: string; priceCredits?: number; priceCash?: number };
}

interface CardOption {
  id: string;
  name: string;
  priceCredits?: number;
  priceCash?: number;
}

export default function AdminPromotionsPanel() {
  const [promotions, setPromotions] = useState<CardPromotion[]>([]);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<CardPromotion | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    cardId: '',
    discountPercent: 10,
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    label: '',
  });

  useEffect(() => {
    loadPromotions();
    loadCards();
  }, []);

  const loadPromotions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/promotions', { timeout: 10000 });
      setPromotions(response.data || []);
    } catch (error: any) {
      console.error('Erro ao carregar promoções:', error);
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCards = async () => {
    try {
      const response = await api.get('/cards/admin/all', { timeout: 15000 });
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setCards(list.filter((c: any) => c.isForSale !== false).map((c: any) => ({ id: c.id, name: c.name, priceCredits: c.priceCredits, priceCash: c.priceCash })));
    } catch (error: any) {
      console.error('Erro ao carregar cartas:', error);
      setCards([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const payload = {
        cardId: formData.cardId,
        discountPercent: Math.min(100, Math.max(0, formData.discountPercent)),
        startsAt: new Date(formData.startsAt).toISOString(),
        endsAt: new Date(formData.endsAt).toISOString(),
        label: formData.label.trim() || null,
      };
      if (editingPromotion) {
        await api.put(`/admin/promotions/${editingPromotion.id}`, payload);
        setMessage({ type: 'success', text: '✅ Promoção atualizada com sucesso!' });
      } else {
        await api.post('/admin/promotions', payload);
        setMessage({ type: 'success', text: '✅ Promoção criada com sucesso!' });
      }
      resetForm();
      loadPromotions();
      setShowForm(false);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ ${error.response?.data?.message || error.message || 'Erro ao salvar promoção'}`,
      });
    }
  };

  const handleEdit = (p: CardPromotion) => {
    setEditingPromotion(p);
    setFormData({
      cardId: p.cardId,
      discountPercent: p.discountPercent,
      startsAt: new Date(p.startsAt).toISOString().slice(0, 16),
      endsAt: new Date(p.endsAt).toISOString().slice(0, 16),
      label: p.label || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta promoção?')) return;
    try {
      await api.delete(`/admin/promotions/${id}`);
      setMessage({ type: 'success', text: '✅ Promoção removida!' });
      loadPromotions();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || '❌ Erro ao remover' });
    }
  };

  const resetForm = () => {
    setFormData({
      cardId: '',
      discountPercent: 10,
      startsAt: new Date().toISOString().slice(0, 16),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      label: '',
    });
    setEditingPromotion(null);
  };

  const now = new Date();
  const isActive = (p: CardPromotion) => {
    const start = new Date(p.startsAt);
    const end = new Date(p.endsAt);
    return now >= start && now <= end;
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-rose-900/10 to-gray-900">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <span className="text-4xl">🏷️</span>
            Promoções (Cartas)
          </h1>
          <p className="text-gray-400 mt-1">Crie descontos por período para cartas da loja. O preço exibido e cobrado na compra será o preço com desconto.</p>
        </motion.div>

        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-900/40 text-green-200' : 'bg-red-900/40 text-red-200'}`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors"
          >
            + Nova promoção
          </button>
          {showForm && (
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>

        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-8 p-6 rounded-xl bg-white/5 border border-white/10"
          >
            <h2 className="text-xl font-bold text-white mb-4">
              {editingPromotion ? 'Editar promoção' : 'Nova promoção'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Carta</label>
                <select
                  required
                  value={formData.cardId}
                  onChange={(e) => setFormData({ ...formData, cardId: e.target.value })}
                  className="w-full max-w-md px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white"
                  disabled={!!editingPromotion}
                >
                  <option value="">Selecione uma carta</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.priceCredits != null ? `💰 ${c.priceCredits}` : ''} {c.priceCash != null ? `💵 ${c.priceCash}` : ''}
                    </option>
                  ))}
                </select>
                {editingPromotion && (
                  <p className="text-xs text-gray-500 mt-1">Não é possível alterar a carta ao editar.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Desconto (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.discountPercent}
                  onChange={(e) => setFormData({ ...formData, discountPercent: Number(e.target.value) || 0 })}
                  className="w-24 px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Início</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.startsAt}
                    onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Fim</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.endsAt}
                    onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Rótulo (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Black Friday"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full max-w-md px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white placeholder-gray-500"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors"
              >
                {editingPromotion ? 'Atualizar' : 'Criar'} promoção
              </button>
            </form>
          </motion.div>
        )}

        <div className="rounded-xl border border-white/10 overflow-hidden bg-white/5">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Carregando promoções...</div>
          ) : promotions.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              Nenhuma promoção cadastrada. Clique em &quot;Nova promoção&quot; para criar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Carta</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Desconto</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Início</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Fim</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-gray-300 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 text-white">
                        {p.card?.name || p.cardId}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-rose-400 font-bold">{p.discountPercent}%</span>
                        {p.label && (
                          <span className="ml-2 text-gray-500 text-sm">({p.label})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        {new Date(p.startsAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        {new Date(p.endsAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        {isActive(p) ? (
                          <span className="text-green-400 font-medium">Ativa</span>
                        ) : new Date(p.endsAt) < now ? (
                          <span className="text-gray-500">Encerrada</span>
                        ) : (
                          <span className="text-amber-400">Agendada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          className="text-blue-400 hover:text-blue-300 mr-3"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
