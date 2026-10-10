import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';
type Participation = 'NONE' | 'RANDOM';
interface Bot { id: string; name: string; level: number; difficulty: Difficulty; participation: Participation; intervalMinutes: number; enabled: boolean; sourceDeckId: string; }
interface Deck { id: string; name: string; }
const empty = { name: '', deckId: '', level: 1, difficulty: 'NORMAL' as Difficulty, participation: 'RANDOM' as Participation, intervalMinutes: 30 };

export default function AdminBotsPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [botRes, deckRes] = await Promise.all([api.get<Bot[]>('/admin/bots'), api.get<Deck[]>('/decks')]);
      setBots(botRes.data);
      setDecks(deckRes.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao carregar os bots ou decks.');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (user?.role === 'MASTER') void load(); }, [user?.role]);
  if (!user || user.role !== 'MASTER') return <Navigate to="/admin" replace />;

  const reset = () => { setEditingId(null); setForm(empty); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      if (editingId) await api.patch('/admin/bots/' + editingId, form);
      else await api.post('/admin/bots', form);
      setMessage('Configuração salva. O bot permanece desativado até a integração da IA.');
      reset();
      await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Não foi possível salvar o bot.'); }
    finally { setSaving(false); }
  };
  const edit = (bot: Bot) => {
    setEditingId(bot.id);
    setForm({ name: bot.name, deckId: bot.sourceDeckId, level: bot.level, difficulty: bot.difficulty, participation: bot.participation, intervalMinutes: bot.intervalMinutes });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async (bot: Bot) => {
    if (!window.confirm('Desativar permanentemente o bot ' + bot.name + '? O histórico será preservado.')) return;
    setError(''); setMessage('');
    try { await api.delete('/admin/bots/' + bot.id); setMessage('Bot removido do gerenciamento.'); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Falha ao remover bot.'); }
  };
  const field = 'w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-white';
  return <div className="mx-auto max-w-5xl p-5 text-white">
    <button onClick={() => navigate('/admin')} className="mb-5 text-blue-300">← Voltar ao painel</button>
    <h1 className="mb-2 text-3xl font-bold">Gerenciar Bots</h1>
    <p className="mb-5 text-amber-200">Etapa de configuração: os bots não entram em duelos ainda. O executor de turnos e efeitos precisa ser integrado antes da ativação.</p>
    {error && <p role="alert" className="mb-3 rounded bg-red-900 p-3">{error}</p>}
    {message && <p role="status" className="mb-3 rounded bg-green-900 p-3">{message}</p>}
    <form onSubmit={save} className="mb-8 grid gap-4 rounded-xl bg-slate-900 p-5 md:grid-cols-2">
      <label>Nome do bot<input className={field} required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Deck (da conta Master)<select className={field} required value={form.deckId} onChange={e => setForm({ ...form, deckId: e.target.value })}><option value="">Selecione um deck</option>{decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Nível<input className={field} type="number" min={1} max={100} value={form.level} onChange={e => setForm({ ...form, level: Number(e.target.value) })} /></label>
      <label>Dificuldade<select className={field} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value as Difficulty })}><option value="EASY">Fácil</option><option value="NORMAL">Normal</option><option value="HARD">Difícil</option><option value="EXPERT">Especialista</option></select></label>
      <label>Participação planejada<select className={field} value={form.participation} onChange={e => setForm({ ...form, participation: e.target.value as Participation })}><option value="NONE">Não participar</option><option value="RANDOM">Random Duel</option></select></label>
      <label>Intervalo planejado (minutos)<input className={field} type="number" min={1} max={10080} value={form.intervalMinutes} onChange={e => setForm({ ...form, intervalMinutes: Number(e.target.value) })} /></label>
      <div className="flex gap-3 md:col-span-2"><button disabled={saving || !form.deckId} className="rounded bg-blue-600 px-5 py-3 disabled:opacity-50">{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar bot'}</button>{editingId && <button type="button" onClick={reset} className="rounded bg-slate-600 px-5 py-3">Cancelar</button>}</div>
    </form>
    <h2 className="mb-3 text-xl font-semibold">Bots cadastrados</h2>
    {loading ? <p>Carregando...</p> : bots.length === 0 ? <p>Nenhum bot cadastrado.</p> :
      <div className="grid gap-3">{bots.map(bot => <div key={bot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 p-4">
        <div><strong>{bot.name}</strong><p className="text-sm text-slate-300">Nível {bot.level} · {bot.difficulty} · {bot.participation} · a cada {bot.intervalMinutes} min</p><p className="text-xs text-amber-300">Desativado: execução automática pendente</p></div>
        <div className="flex gap-2"><button className="rounded bg-blue-700 px-3 py-2" onClick={() => edit(bot)}>Editar</button><button className="rounded bg-red-800 px-3 py-2" onClick={() => void remove(bot)}>Remover</button></div>
      </div>)}</div>}
  </div>;
}
