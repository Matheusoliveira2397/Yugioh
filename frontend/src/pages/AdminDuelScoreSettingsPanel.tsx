import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

interface DuelScoreSettings {
  scoreRandom: number;
  scoreRanked: number;
  rankedPointsOnWin: number;
  rankedPointsOnLoss: number;
  scoreChat: number;
  scoreTournament: number;
  scoreArena: number;
  scoreOther: number;
}

const SCORE_FIELDS: {
  key: keyof DuelScoreSettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'scoreRandom',
    label: 'Random Duel (Casual)',
    description: 'Score (só sobe) por vitória no duelo aleatório',
  },
  {
    key: 'scoreRanked',
    label: 'Partida Ranqueada — Score',
    description: 'Score (só sobe) por vitória na ranqueada',
  },
  {
    key: 'scoreChat',
    label: 'Chat',
    description: 'Score por vitória em duelo iniciado pelo chat',
  },
  {
    key: 'scoreTournament',
    label: 'Torneio',
    description: 'Score por vitória em torneio',
  },
  {
    key: 'scoreArena',
    label: 'Arena',
    description: 'Score por vitória na arena',
  },
  {
    key: 'scoreOther',
    label: 'Outros',
    description: 'Score por vitória em outros tipos de duelo',
  },
];

const RANKED_POINT_FIELDS: {
  key: keyof DuelScoreSettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'rankedPointsOnWin',
    label: 'Pontos ranqueados na vitória',
    description: 'Quanto sobe o ranked_points ao vencer (pode subir e descer)',
  },
  {
    key: 'rankedPointsOnLoss',
    label: 'Pontos ranqueados na derrota',
    description: 'Quanto desce o ranked_points ao perder (mínimo 0)',
  },
];

export default function AdminDuelScoreSettingsPanel() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<DuelScoreSettings>({
    scoreRandom: 1.7,
    scoreRanked: 2.0,
    rankedPointsOnWin: 25,
    rankedPointsOnLoss: 20,
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
        scoreRanked: Number(data.scoreRanked) ?? 2.0,
        rankedPointsOnWin: Number(data.rankedPointsOnWin) ?? 25,
        rankedPointsOnLoss: Number(data.rankedPointsOnLoss) ?? 20,
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
      setMessage({ type: 'success', text: 'Configurações atualizadas com sucesso.' });
    } catch (e: any) {
      console.error('Erro ao salvar:', e);
      setMessage({ type: 'error', text: e.response?.data?.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const renderField = (key: keyof DuelScoreSettings, label: string, description: string) => (
    <div key={key} className="flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0">
        <label htmlFor={key} className="block text-white font-medium text-sm">
          {label}
        </label>
        <p className="text-slate-500 text-xs">{description}</p>
      </div>
      <input
        id={key}
        type="number"
        min={0}
        step={key.startsWith('ranked') ? 1 : 0.1}
        value={settings[key]}
        onChange={(e) => handleChange(key, e.target.value)}
        className="w-28 rounded-lg bg-slate-900 border border-white/15 px-3 py-2 text-white text-sm"
      />
    </div>
  );

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
          <h1 className="text-xl font-bold text-white">Score e Ranqueada</h1>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          O <strong className="text-slate-300">score</strong> só sobe nas vitórias. Os{' '}
          <strong className="text-amber-300">pontos ranqueados</strong> sobem na vitória e descem
          na derrota (somente na fila Ranked).
        </p>

        {message && (
          <div
            className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-emerald-900/50 text-emerald-200'
                : 'bg-red-900/50 text-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 py-8">Carregando...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl bg-black/20 border border-white/10 p-4 space-y-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Score por vitória (só sobe)
              </h2>
              {SCORE_FIELDS.map(({ key, label, description }) =>
                renderField(key, label, description),
              )}
            </div>

            <div className="rounded-xl bg-amber-950/20 border border-amber-500/30 p-4 space-y-4">
              <h2 className="text-sm font-semibold text-amber-200 uppercase tracking-wide">
                Pontos da Partida Ranqueada (sobe e desce)
              </h2>
              {RANKED_POINT_FIELDS.map(({ key, label, description }) =>
                renderField(key, label, description),
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
