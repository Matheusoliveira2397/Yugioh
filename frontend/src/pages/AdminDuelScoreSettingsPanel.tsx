import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

interface DuelScoreSettings {
  scoreRandom: number;
  scoreChat: number;
  scoreTournament: number;
  scoreArena: number;
  scoreOther: number;
}

const FIELDS: { key: keyof DuelScoreSettings; label: string; description: string }[] = [
  { key: 'scoreRandom', label: 'Random Duel', description: 'Score por vitória no duelo aleatório (matchmaking)' },
  { key: 'scoreChat', label: 'Chat', description: 'Score por vitória em duelo iniciado pelo chat' },
  { key: 'scoreTournament', label: 'Torneio', description: 'Score por vitória em torneio' },
  { key: 'scoreArena', label: 'Arena', description: 'Score por vitória na arena' },
  { key: 'scoreOther', label: 'Outros', description: 'Score por vitória em outros tipos de duelo' },
];

export default function AdminDuelScoreSettingsPanel() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<DuelScoreSettings>({
    scoreRandom: 1.7,
    scoreChat: 1.0,
    scoreTournament: 10.0,
    scoreArena: 2.0,
    scoreOther: 1.0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<DuelScoreSettings>('/admin/duel-score-settings');
      setSettings({
        scoreRandom: Number(data.scoreRandom) ?? 1.7,
        scoreChat: Number(data.scoreChat) ?? 1.0,
        scoreTournament: Number(data.scoreTournament) ?? 10.0,
        scoreArena: Number(data.scoreArena) ?? 2.0,
        scoreOther: Number(data.scoreOther) ?? 1.0,
      });
    } catch (e) {
      console.error('Erro ao carregar configurações:', e);
      setMessage({ type: 'error', text: 'Erro ao carregar configurações.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: keyof DuelScoreSettings, value: string) => {
    const num = parseFloat(value);
    if (!Number.isNaN(num) && num >= 0) {
      setSettings((s) => ({ ...s, [key]: num }));
    } else if (value === '' || value === '-') {
      setSettings((s) => ({ ...s, [key]: 0 }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      await api.put('/admin/duel-score-settings', settings);
      setMessage({ type: 'success', text: 'Score por tipo de duelo atualizado com sucesso.' });
    } catch (e: any) {
      console.error('Erro ao salvar:', e);
      setMessage({ type: 'error', text: e.response?.data?.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-5">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Voltar
          </button>
          <h1 className="text-xl font-bold text-white">
            Score por tipo de duelo
          </h1>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          Quanto de score o duelista ganha por vitória em cada tipo de duelo (ranking geral e season).
        </p>

        {message && (
          <div
            className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              message.type === 'success' ? 'bg-emerald-900/50 text-emerald-200' : 'bg-red-900/50 text-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 py-8">Carregando...</p>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-xl bg-black/20 border border-white/10 p-4 space-y-4">
            {FIELDS.map(({ key, label, description }) => (
              <div key={key} className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <label htmlFor={key} className="block text-white font-medium text-sm">
                    {label}
                  </label>
                  <p className="text-slate-500 text-xs mt-0.5">{description}</p>
                </div>
                <div className="w-24">
                  <input
                    id={key}
                    type="number"
                    min={0}
                    step={0.1}
                    value={settings[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-right focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
