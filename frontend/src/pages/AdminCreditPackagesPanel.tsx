import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface CreditPackageRow {
  id: string;
  credits: number;
  bonusCredits: number;
  priceBrl: string;
  description: string | null;
  isPopular: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCreditPackagesPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CreditPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditPackageRow | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    credits: 100,
    bonusCredits: 0,
    priceBrl: 9.9,
    description: '',
    isPopular: false,
    sortOrder: 0,
    isActive: true,
  });

  const [contactPix, setContactPix] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactSaving, setContactSaving] = useState(false);

  const loadRows = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/credit-packages', { timeout: 15000 });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao carregar pacotes de crédito',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentContact = async () => {
    try {
      const res = await api.get<{ pixKey?: string | null; whatsapp?: string | null }>(
        '/admin/credit-payment-contact',
        { timeout: 15000 },
      );
      setContactPix(res.data?.pixKey ?? '');
      setContactWhatsapp(res.data?.whatsapp ?? '');
    } catch (e) {
      console.error(e);
    }
  };

  const savePaymentContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setContactSaving(true);
    try {
      await api.put('/admin/credit-payment-contact', {
        pixKey: contactPix.trim() ? contactPix.trim() : null,
        whatsapp: contactWhatsapp.trim() ? contactWhatsapp.trim() : null,
      });
      setMessage({ type: 'success', text: '✅ PIX e WhatsApp salvos (exibidos em Comprar créditos).' });
      await loadPaymentContact();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Erro ao salvar contato',
      });
    } finally {
      setContactSaving(false);
    }
  };

  useEffect(() => {
    loadRows();
    loadPaymentContact();
  }, []);

  const resetForm = () => {
    setFormData({
      credits: 100,
      bonusCredits: 0,
      priceBrl: 9.9,
      description: '',
      isPopular: false,
      sortOrder: 0,
      isActive: true,
    });
    setEditing(null);
  };

  const handleEdit = (r: CreditPackageRow) => {
    setEditing(r);
    setFormData({
      credits: r.credits,
      bonusCredits: r.bonusCredits ?? 0,
      priceBrl: parseFloat(String(r.priceBrl)) || 0,
      description: r.description || '',
      isPopular: r.isPopular,
      sortOrder: r.sortOrder ?? 0,
      isActive: r.isActive,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const payload = {
        credits: Math.floor(Number(formData.credits)) || 0,
        bonusCredits: Math.max(0, Math.floor(Number(formData.bonusCredits)) || 0),
        priceBrl: Number(formData.priceBrl),
        description: formData.description.trim() || null,
        isPopular: formData.isPopular,
        sortOrder: Number(formData.sortOrder) || 0,
        isActive: formData.isActive,
      };
      if (editing) {
        await api.put(`/admin/credit-packages/${editing.id}`, payload);
        setMessage({ type: 'success', text: '✅ Pacote atualizado.' });
      } else {
        await api.post('/admin/credit-packages', payload);
        setMessage({ type: 'success', text: '✅ Pacote criado.' });
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

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este pacote da loja de créditos?')) return;
    setLoading(true);
    try {
      await api.delete(`/admin/credit-packages/${id}`);
      setMessage({ type: 'success', text: '✅ Pacote removido.' });
      await loadRows();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Erro ao remover',
      });
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.credits - b.credits),
    [rows],
  );

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-emerald-950/20 to-gray-900">
      <div className="max-w-5xl mx-auto">
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
              onClick={() => navigate('/admin/payments')}
              className="text-slate-400 hover:text-teal-300 text-sm font-medium"
            >
              💳 Pagamentos (créditos manuais)
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1">💎 Pacotes de crédito</h1>
              <p className="text-slate-400 text-sm">
                Defina os pacotes exibidos em <strong className="text-emerald-300">Comprar créditos</strong> para
                o jogador escolher (valores em R$; integração de pagamento continua no gateway).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
              className="px-5 py-2.5 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-900/40"
            >
              {showForm ? 'Fechar formulário' : '+ Novo pacote (clique)'}
            </button>
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={savePaymentContact}
          className="mb-8 rounded-xl border border-teal-700/60 bg-slate-900/70 p-6 space-y-4"
        >
          <h2 className="text-lg font-bold text-white">📱 PIX e WhatsApp (página &quot;Comprar créditos&quot;)</h2>
          <p className="text-slate-400 text-sm">
            Os jogadores veem estes dados na loja de créditos para pagamento manual ou contato. Deixe em branco para
            ocultar cada campo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Chave PIX</label>
              <input
                type="text"
                value={contactPix}
                onChange={(e) => setContactPix(e.target.value)}
                placeholder="E-mail, CPF, telefone ou chave aleatória"
                maxLength={255}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">WhatsApp</label>
              <input
                type="text"
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
                placeholder="+55 11 99999-9999"
                maxLength={64}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={contactSaving}
            className="px-5 py-2.5 rounded-lg font-bold bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white transition-colors"
          >
            {contactSaving ? 'Salvando…' : 'Salvar PIX e WhatsApp'}
          </button>
        </motion.form>

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
              {editing ? 'Editar pacote' : 'Novo pacote'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Créditos base *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: Number(e.target.value) })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bônus (créditos extra)</label>
                <input
                  type="number"
                  min={0}
                  value={formData.bonusCredits}
                  onChange={(e) => setFormData({ ...formData, bonusCredits: Number(e.target.value) })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Preço (R$) *</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={formData.priceBrl}
                  onChange={(e) => setFormData({ ...formData, priceBrl: Number(e.target.value) })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ordem na lista</label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Descrição (opcional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                placeholder="Ex.: Melhor custo-benefício"
              />
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPopular}
                  onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                  className="rounded border-slate-500"
                />
                Destacar como &quot;Mais popular&quot;
              </label>
              <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-slate-500"
                />
                Ativo (visível na loja de créditos)
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
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
          ) : sorted.length === 0 ? (
            <p className="p-8 text-center text-slate-400">Nenhum pacote. Crie o primeiro acima.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/80 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Ordem</th>
                    <th className="px-4 py-3">Créditos</th>
                    <th className="px-4 py-3">Bônus</th>
                    <th className="px-4 py-3">Preço R$</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Popular</th>
                    <th className="px-4 py-3">Ativo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-t border-slate-700/80 hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-400">{r.sortOrder}</td>
                      <td className="px-4 py-3 text-white font-medium">{r.credits}</td>
                      <td className="px-4 py-3 text-emerald-300">{r.bonusCredits || '—'}</td>
                      <td className="px-4 py-3 text-amber-300">
                        R$ {parseFloat(String(r.priceBrl)).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate" title={r.description || ''}>
                        {r.description || '—'}
                      </td>
                      <td className="px-4 py-3">{r.isPopular ? '⭐' : '—'}</td>
                      <td className="px-4 py-3">{r.isActive ? 'Sim' : 'Não'}</td>
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
