import { useEffect, useState } from 'react';
import {
  COLOR_SCHEMES,
  ColorSchemeId,
  StoryCharacter,
  TAGFORCE_ART,
  defaultCharacter,
  getScheme,
  schemeCssFilter,
} from './storyCharacter';

type Props = {
  initialName?: string;
  initial?: StoryCharacter | null;
  onConfirm: (character: StoryCharacter) => void;
  onCancel?: () => void;
};

export default function StoryCharacterCreate({ initialName, initial, onConfirm, onCancel }: Props) {
  const [draft, setDraft] = useState<StoryCharacter>(() => initial || defaultCharacter(initialName || 'Duelista'));
  const valid = draft.name.trim().length >= 2;
  const scheme = getScheme(draft.colorScheme);

  useEffect(() => {
    // pré-carrega arte
    const img = new Image();
    img.src = TAGFORCE_ART;
  }, []);

  const setScheme = (colorScheme: ColorSchemeId) => setDraft((d) => ({ ...d, colorScheme }));

  return (
    <div className="relative min-h-[75vh] overflow-hidden rounded-2xl border border-red-500/40 bg-black text-white shadow-2xl">
      {/* glow Tag Force */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(220,38,38,0.35), transparent 45%), radial-gradient(ellipse at 70% 80%, rgba(37,99,235,0.2), transparent 50%)',
        }}
      />

      <header className="relative z-10 border-b border-white/10 px-4 py-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-red-400">Yu-Gi-Oh! · Tag Force</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
          Select Duelist
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Escolha nome, gênero e cor do uniforme — visual no estilo clássico Tag Force.
        </p>
      </header>

      <div className="relative z-10 grid items-stretch gap-0 lg:grid-cols-[1.1fr_1fr]">
        {/* Arte grande — igual à referência */}
        <div className="relative flex min-h-[420px] items-end justify-center bg-black px-4 pb-8 pt-4">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 50% 60%, rgba(80,20,40,0.5), transparent 65%)',
            }}
          />
          <img
            src={TAGFORCE_ART}
            alt="Duelista Tag Force"
            className="relative z-10 max-h-[480px] w-auto object-contain drop-shadow-2xl transition duration-300"
            style={{ filter: schemeCssFilter(scheme) }}
            draggable={false}
          />
          <div className="absolute bottom-3 left-0 right-0 z-20 text-center">
            <p
              className="text-2xl font-black tracking-wide drop-shadow-lg"
              style={{ color: scheme.accent, fontFamily: 'Georgia, serif' }}
            >
              {draft.name.trim() || '???'}
            </p>
            <p className="text-xs uppercase tracking-widest text-slate-400">
              {draft.gender === 'male' ? 'Duelista' : 'Duelista'} · {scheme.label}
            </p>
          </div>
        </div>

        {/* Painel de opções */}
        <section className="flex flex-col border-t border-white/10 bg-slate-950/90 lg:border-l lg:border-t-0">
          <div className="space-y-5 p-5 sm:p-6">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-red-300/90">Nome</span>
              <input
                value={draft.name}
                maxLength={12}
                autoFocus
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    name: e.target.value.replace(/[^\p{L}\p{N} _\-']/gu, ''),
                  }))
                }
                placeholder="Seu nome de duelista"
                className="w-full rounded-lg border border-red-500/40 bg-black px-4 py-3 text-lg text-white outline-none ring-red-500/40 focus:ring-2"
              />
              <span className="mt-1 block text-xs text-slate-500">{draft.name.trim().length}/12</span>
            </label>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-red-300/90">Gênero</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'male' as const, label: 'Masculino' },
                    { id: 'female' as const, label: 'Feminino' },
                  ]
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, gender: g.id }))}
                    className={`rounded-lg border px-3 py-3 font-semibold transition ${
                      draft.gender === g.id
                        ? 'border-red-400 bg-red-600/30 text-white'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-red-300/90">Cor do uniforme</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COLOR_SCHEMES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScheme(s.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition ${
                      draft.colorScheme === s.id
                        ? 'border-amber-300 bg-white/10 ring-2 ring-amber-400/50'
                        : 'border-white/10 bg-black/40 hover:border-white/25'
                    }`}
                  >
                    <span
                      className="h-8 w-8 rounded-full border border-white/30 shadow"
                      style={{ background: s.accent }}
                    />
                    <span className="text-[11px] font-medium text-slate-200">{s.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                A arte é a mesma do Tag Force; a cor troca o tom do uniforme (como palette swap).
              </p>
            </div>
          </div>

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 sm:p-5">
            <div className="flex gap-2">
              {onCancel && (
                <button type="button" onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2.5 text-sm hover:bg-white/15">
                  Voltar
                </button>
              )}
              <button
                type="button"
                onClick={() => setDraft(defaultCharacter(initialName || 'Duelista'))}
                className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm hover:bg-slate-700"
              >
                Resetar
              </button>
            </div>
            <button
              type="button"
              disabled={!valid}
              onClick={() =>
                onConfirm({
                  ...draft,
                  name: draft.name.trim().slice(0, 12),
                  createdAt: draft.createdAt || new Date().toISOString(),
                })
              }
              className="rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-red-700/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Começar história
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
