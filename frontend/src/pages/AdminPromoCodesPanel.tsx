import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/axios';

type RewardType = 'credits' | 'cash' | 'card';

interface PromoCodeRow {
  id: string;
  code: string;
  label: string | null;
  isActive: boolean;
  maxUses: number | null;
  usesCount: number;
  maxUsesPerUser: number;
  startsAt: string | null;
  expiresAt: string | null;
  rewardType: RewardType;
  rewardAmount: number;
  rewardCardId: string | null;
  rewardCard?: { id: string; name: string; cardImage: string } | null;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  code: '',
  label: '',
  isActive: true,
  maxUses: '' as string | number,
  maxUsesPerUser: 1,
  startsAt: '',
  expiresAt: '',
  rewardType: 'credits' as RewardType,
  rewardAmount: 100,
  rewardCardId: '',
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rewardLabel(r: PromoCodeRow): string {
  if (r.rewardType === 'credits') return `${r.rewardAmount} créditos`;
  if (r.rewardType === 'cash') return `${r.rewardAmount} cash`;
  if (r.rewardType === 'card') {
    const name = r.rewardCard?.name || r.rewardCardId || 'carta';
    return r.rewardAmount > 1 ? `${r.rewardAmount}x ${name}` : name;
  }
  return '—';
}

export default function AdminPromoCodesPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PromoCodeRow | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const loadRows = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/promo-codes', { timeout: 15000 });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao carregar códigos',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setEditing(null);
  };

  const handleEdit = (r: PromoCodeRow) => {
    setEditing(r);
    setFormData({
      code: r.code,
      label: r.label || '',
      isActive: r.isActive,
      maxUses: r.maxUses ?? '',
      maxUsesPerUser: r.maxUsesPerUser ?? 1,
      startsAt: toLocalInput(r.startsAt),
      expiresAt: toLocalInput(r.expiresAt),
      rewardType: r.rewardType,
      rewardAmount: r.rewardAmount,
      rewardCardId: r.rewardCardId || '',
    });
    setShowForm(true);
  };

  const buildPayload = () => {
    const maxUsesRaw = formData.maxUses;
    const maxUses =
      maxUsesRaw === '' || maxUsesRaw === null || maxUsesRaw === undefined
        ? null
        : Math.max(1, Math.floor(Number(maxUsesRaw)));

    return {
      code: formData.code.trim() || undefined,
      label: formData.label.trim() || null,
      isActive: formData.isActive,
      maxUses,
      maxUsesPerUser: Math.max(1, Math.floor(Number(formData.maxUsesPerUser)) || 1),
      startsAt: formData.startsAt ? new Date(formData.startsAt).toISOString() : null,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
      rewardType: formData.rewardType,
      rewardAmount: Math.floor(Number(formData.rewardAmount)) || 0,
      rewardCardId:
        formData.rewardType === 'card' ? formData.rewardCardId.trim() || null : null,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await api.put(`/admin/promo-codes/${editing.id}`, payload);
        setMessage({ type: 'success', text: 'Código atualizado.' });
      } else {
        const res = await api.post('/admin/promo-codes', payload);
        const createdCode = res.data?.code || payload.code || '';
        setMessage({
          type: 'success',
          text: createdCode
            ? `Código criado: ${createdCode}`
            : 'Código criado.',
        });
      }
      resetForm();
      setShowForm(false);
      await loadRows();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Erro ao salvar',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (r: PromoCodeRow) => {
    setMessage(null);
    try {
      const path = r.isActive
        ? `/admin/promo-codes/${r.id}/deactivate`
        : `/admin/promo-codes/${r.id}/activate`;
      await api.post(path);
      setMessage({
        type: 'success',
        text: r.isActive ? 'Código desativado.' : 'Código ativado.',
      });
      await loadRows();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Erro ao alterar status',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este código permanentemente?')) return;
    setLoading(true);
    try {
      await api.delete(`/admin/promo-codes/${id}`);
      setMessage({ type: 'success', text: 'Código excluído.' });
      await loadRows();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Erro ao excluir',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-violet-950/20 to-gray-900">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="text-slate-400 hover:text-white text-sm font-medium"
            >
              ← Painel admin
            </button>
            <button
              type="button"
              onClick={() => navigate('/redeem')}
              className="text-slate-400 hover:text-violet-300 text-sm font-medium"
            >
              Ver página de resgate
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1">Códigos de resgate</h1>
              <p className="text-slate-400 text-sm">
                Gere códigos, deixe ativos e as contas resgatam a premiação em{' '}
                <strong className="text-violet-300">/redeem</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
              className="px-5 py-2.5 rounded-lg font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-lg shadow-violet-900/40"
            >
              {showForm ? 'Fechar formulário' : '+ Novo código'}
            </button>
          </div>
        </motion.div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-600 text-emerald-200'
                : 'bg-red-950/50 border-red-600 text-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="mb-8 rounded-xl border border-slate-600 bg-slate-900/70 p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-white">
              {editing ? 'Editar código' : 'Novo código'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Código {editing ? '*' : '(vazio = gera automático)'}
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="Ex.: NATAL2026"
                  maxLength={64}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white font-mono tracking-wide uppercase"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Rótulo interno (opcional)</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Ex.: Evento de lançamento"
                  maxLength={120}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipo de premiação *</label>
                <select
                  value={formData.rewardType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rewardType: e.target.value as RewardType,
                    })
                  }
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                >
                  <option value="credits">Créditos</option>
                  <option value="cash">Cash</option>
                  <option value="card">Carta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {formData.rewardType === 'card' ? 'Quantidade de cartas *' : 'Quantidade *'}
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.rewardAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, rewardAmount: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              {formData.rewardType === 'card' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">ID da carta (UUID) *</label>
                  <input
                    type="text"
                    required
                    value={formData.rewardCardId}
                    onChange={(e) =>
                      setFormData({ ...formData, rewardCardId: e.target.value })
                    }
                    placeholder="UUID da carta no banco"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white font-mono text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Limite total de usos (vazio = ilimitado)
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  placeholder="Ilimitado"
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Usos por conta</label>
                <input
                  type="number"
                  min={1}
                  value={formData.maxUsesPerUser}
                  onChange={(e) =>
                    setFormData({ ...formData, maxUsesPerUser: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Início (opcional)</label>
                <input
                  type="datetime-local"
                  value={formData.startsAt}
                  onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Expiração (opcional)</label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded border-slate-500"
              />
              Ativo (contas podem resgatar)
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="px-5 py-2 rounded-lg border border-slate-500 text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </motion.form>
        )}

        <div className="rounded-xl border border-slate-700 overflow-hidden bg-slate-900/40">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-slate-400">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-slate-400">Nenhum código. Crie o primeiro acima.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/80 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Premiação</th>
                    <th className="px-4 py-3">Usos</th>
                    <th className="px-4 py-3">Ativo</th>
                    <th className="px-4 py-3">Validade</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-700/80 hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <div className="font-mono text-white tracking-wide">{r.code}</div>
                        {r.label && (
                          <div className="text-xs text-slate-500 mt-0.5">{r.label}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-violet-200">{rewardLabel(r)}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {r.usesCount}
                        {r.maxUses != null ? ` / ${r.maxUses}` : ' / ∞'}
                        <span className="text-slate-500 text-xs block">
                          {r.maxUsesPerUser}x por conta
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            r.isActive ? 'text-emerald-400 font-medium' : 'text-slate-500'
                          }
                        >
                          {r.isActive ? 'Sim' : 'Não'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {r.expiresAt
                          ? `até ${new Date(r.expiresAt).toLocaleString('pt-BR')}`
                          : 'sem expiração'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          className="text-blue-400 hover:text-blue-300 mr-3"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(r)}
                          className="text-amber-400 hover:text-amber-300 mr-3"
                        >
                          {r.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Excluir
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
