import { useState, type Dispatch, type SetStateAction } from 'react';
import api from '../../api/axios';

export type BulkImportNotify = (m: { type: 'success' | 'error'; text: string } | null) => void;

/** Valores iguais ao backend (MonsterType / SpellType / TrapType). */
const MONSTER_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Effect', label: 'Efeito' },
  { value: 'Ritual', label: 'Ritual' },
  { value: 'Fusion', label: 'Fusão' },
  { value: 'Synchro', label: 'Sincro' },
  { value: 'Xyz', label: 'Xyz' },
  { value: 'Pendulum', label: 'Pêndulo' },
  { value: 'Link', label: 'Link' },
] as const;

const SPELL_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Contínua' },
  { value: 'Equip', label: 'Equipamento' },
  { value: 'Field', label: 'Campo' },
  { value: 'Quick-Play', label: 'Rápida (Quick-Play)' },
  { value: 'Ritual', label: 'Ritual (magia)' },
] as const;

const TRAP_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Contínua' },
  { value: 'Counter', label: 'Contra (Counter)' },
] as const;

function initSubtypeState<T extends readonly { value: string }[]>(opts: T): Record<string, boolean> {
  return Object.fromEntries(opts.map((o) => [o.value, true]));
}

type BulkResult = {
  catalogSize?: number;
  totalRows?: number;
  skippedByTypeFilter?: number;
  skippedBySubtypeFilter?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  errorSamples?: { name?: string; idCarta?: string; message: string }[];
};

type Props = {
  onAfterRealImport?: () => void | Promise<void>;
  onNotify?: BulkImportNotify;
  defaultExpanded?: boolean;
};

export default function BulkYgoproDeckImportSection({
  onAfterRealImport,
  onNotify,
  defaultExpanded = false,
}: Props) {
  const [bulkOpen, setBulkOpen] = useState(defaultExpanded);
  const [bulkTypes, setBulkTypes] = useState({ Monster: true, Spell: true, Trap: true });
  const [bulkMonsterSub, setBulkMonsterSub] = useState<Record<string, boolean>>(() =>
    initSubtypeState(MONSTER_OPTIONS),
  );
  const [bulkSpellSub, setBulkSpellSub] = useState<Record<string, boolean>>(() => initSubtypeState(SPELL_OPTIONS));
  const [bulkTrapSub, setBulkTrapSub] = useState<Record<string, boolean>>(() => initSubtypeState(TRAP_OPTIONS));
  const [bulkImportInactive, setBulkImportInactive] = useState(true);
  const [bulkDryRun, setBulkDryRun] = useState(true);
  const [bulkLimit, setBulkLimit] = useState('');
  const [bulkOnConflict, setBulkOnConflict] = useState<'skip' | 'update'>('skip');
  const [bulkAlternateArts, setBulkAlternateArts] = useState(false);
  const [bulkTranslate, setBulkTranslate] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const buildBulkImportPayload = () => {
    const types: ('Monster' | 'Spell' | 'Trap')[] = [];
    if (bulkTypes.Monster) types.push('Monster');
    if (bulkTypes.Spell) types.push('Spell');
    if (bulkTypes.Trap) types.push('Trap');
    const payload: Record<string, unknown> = {
      dryRun: bulkDryRun,
      importAsInactive: bulkImportInactive,
      onConflict: bulkOnConflict,
      alternateArts: bulkAlternateArts,
      translate: bulkTranslate,
    };
    if (types.length > 0 && types.length < 3) {
      payload.cardTypes = types;
    }
    const lim = parseInt(bulkLimit.trim(), 10);
    if (!Number.isNaN(lim) && lim > 0) {
      payload.limit = lim;
    }

    const monsterVals = MONSTER_OPTIONS.map((o) => o.value);
    const spellVals = SPELL_OPTIONS.map((o) => o.value);
    const trapVals = TRAP_OPTIONS.map((o) => o.value);

    if (bulkTypes.Monster) {
      const sel = monsterVals.filter((v) => bulkMonsterSub[v]);
      if (sel.length > 0 && sel.length < monsterVals.length) {
        payload.monsterSubtypes = sel;
      }
    }
    if (bulkTypes.Spell) {
      const sel = spellVals.filter((v) => bulkSpellSub[v]);
      if (sel.length > 0 && sel.length < spellVals.length) {
        payload.spellSubtypes = sel;
      }
    }
    if (bulkTypes.Trap) {
      const sel = trapVals.filter((v) => bulkTrapSub[v]);
      if (sel.length > 0 && sel.length < trapVals.length) {
        payload.trapSubtypes = sel;
      }
    }

    return payload;
  };

  const runBulkImport = async () => {
    if (!bulkTypes.Monster && !bulkTypes.Spell && !bulkTypes.Trap) {
      onNotify?.({ type: 'error', text: 'Selecione pelo menos um tipo (Monstro, Magia ou Armadilha).' });
      return;
    }
    const monsterVals = MONSTER_OPTIONS.map((o) => o.value);
    const spellVals = SPELL_OPTIONS.map((o) => o.value);
    const trapVals = TRAP_OPTIONS.map((o) => o.value);

    if (bulkTypes.Monster && monsterVals.filter((v) => bulkMonsterSub[v]).length === 0) {
      onNotify?.({
        type: 'error',
        text: 'Marque ao menos um subtipo de monstro — ou desmarque “Monstros” no tipo principal.',
      });
      return;
    }
    if (bulkTypes.Spell && spellVals.filter((v) => bulkSpellSub[v]).length === 0) {
      onNotify?.({
        type: 'error',
        text: 'Marque ao menos um tipo de magia — ou desmarque “Magias”.',
      });
      return;
    }
    if (bulkTypes.Trap && trapVals.filter((v) => bulkTrapSub[v]).length === 0) {
      onNotify?.({
        type: 'error',
        text: 'Marque ao menos um tipo de armadilha — ou desmarque “Armadilhas”.',
      });
      return;
    }

    setBulkLoading(true);
    setBulkResult(null);
    onNotify?.(null);
    try {
      const { data } = await api.post('/cards/admin/bulk-import-ygoprodeck', buildBulkImportPayload(), {
        timeout: 600_000,
      });
      setBulkResult(data);
      onNotify?.({
        type: 'success',
        text: bulkDryRun
          ? '✅ Simulação concluída (nada foi gravado). Veja o resumo abaixo.'
          : '✅ Importação concluída. Cartas inativas aparecem com o filtro “Inativas”.',
      });
      if (!bulkDryRun) {
        await onAfterRealImport?.();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Erro ao importar. Verifique o servidor e o timeout da requisição.';
      onNotify?.({ type: 'error', text: `❌ ${msg}` });
    } finally {
      setBulkLoading(false);
    }
  };

  const subtypeBox = (
    title: string,
    hint: string,
    enabled: boolean,
    options: readonly { value: string; label: string }[],
    state: Record<string, boolean>,
    setState: Dispatch<SetStateAction<Record<string, boolean>>>,
  ) => (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        enabled ? 'border-amber-700/60 bg-gray-900/50' : 'border-gray-700/50 bg-gray-900/20 opacity-50'
      }`}
    >
      <p className="text-xs font-semibold text-amber-200/90">{title}</p>
      <p className="text-xs text-gray-500">{hint}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              disabled={!enabled}
              checked={!!state[o.value]}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  [o.value]: e.target.checked,
                }))
              }
              className="rounded border-gray-600"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div
      id="admin-bulk-ygopro-import"
      className="mb-8 rounded-lg border border-amber-600/50 bg-amber-950/30 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setBulkOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left font-bold text-amber-100 hover:bg-amber-900/40 transition-colors"
      >
        <span>📥 Cadastro em massa (YGOPRODeck)</span>
        <span className="text-amber-400">{bulkOpen ? '▲' : '▼'}</span>
      </button>
      {bulkOpen && (
        <div className="px-6 pb-6 pt-2 border-t border-amber-700/40 space-y-4 text-gray-200">
          <p className="text-sm text-gray-400">
            Baixa o catálogo da API pública YGOPRODeck. Cartas recebem <code className="text-amber-200">idCarta</code>{' '}
            no formato <code className="text-amber-200">YGOPRO_…</code>. Pode levar vários minutos.
          </p>
          <div>
            <p className="text-sm font-semibold text-amber-200 mb-2">Tipos principais</p>
            <div className="flex flex-wrap gap-4">
              {(['Monster', 'Spell', 'Trap'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkTypes[t]}
                    onChange={(e) => setBulkTypes((prev) => ({ ...prev, [t]: e.target.checked }))}
                    className="rounded border-gray-600"
                  />
                  <span>
                    {t === 'Monster' && 'Monstros'}
                    {t === 'Spell' && 'Magias'}
                    {t === 'Trap' && 'Armadilhas'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-amber-200">Subtipos (opcional)</p>
            <p className="text-xs text-gray-500 -mt-2">
              Com todos marcados, importa qualquer subtipo daquele grupo. Desmarque para limitar (ex.: só{' '}
              <strong>Fusão</strong> e <strong>Xyz</strong>).
            </p>
            {subtypeBox(
              'Monstros — categoria na API (Normal, Efeito, Fusão, Link, …)',
              'Tokens contam como monstro Normal.',
              bulkTypes.Monster,
              MONSTER_OPTIONS,
              bulkMonsterSub,
              setBulkMonsterSub,
            )}
            {subtypeBox(
              'Magias — velocidade / ícone (Normal, Contínua, Rápida, Campo, …)',
              'Inclui cartas Skill tratadas como magia.',
              bulkTypes.Spell,
              SPELL_OPTIONS,
              bulkSpellSub,
              setBulkSpellSub,
            )}
            {subtypeBox(
              'Armadilhas — Normal, Contínua ou Contra',
              '',
              bulkTypes.Trap,
              TRAP_OPTIONS,
              bulkTrapSub,
              setBulkTrapSub,
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bulkImportInactive}
              onChange={(e) => setBulkImportInactive(e.target.checked)}
              className="rounded border-gray-600"
            />
            <span>
              Importar como <strong>inativas</strong> (não aparecem no jogo até você ativar no painel)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bulkDryRun}
              onChange={(e) => setBulkDryRun(e.target.checked)}
              className="rounded border-gray-600"
            />
            <span>Apenas simular (dry run) — não grava no banco</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Limite (opcional)</label>
              <input
                type="number"
                min={1}
                placeholder="Ex.: 100 para teste"
                value={bulkLimit}
                onChange={(e) => setBulkLimit(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Se idCarta já existir</label>
              <select
                value={bulkOnConflict}
                onChange={(e) => setBulkOnConflict(e.target.value as 'skip' | 'update')}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                title="Mesmo em Ignorar, cartas inativas ou sem imagem são atualizadas"
              >
                <option value="skip">Ignorar ativas (inativas/sem imagem atualizam)</option>
                <option value="update">Atualizar dados da API</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bulkAlternateArts}
              onChange={(e) => setBulkAlternateArts(e.target.checked)}
              className="rounded border-gray-600"
            />
            <span>Incluir artes alternativas (uma linha por imagem)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bulkTranslate}
              onChange={(e) => setBulkTranslate(e.target.checked)}
              className="rounded border-gray-600"
            />
            <span>Traduzir descrições (lento em catálogo grande)</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={bulkLoading}
              onClick={runBulkImport}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-5 py-2 rounded-lg font-bold text-black"
            >
              {bulkLoading ? 'Aguarde…' : bulkDryRun ? 'Rodar simulação' : 'Iniciar importação'}
            </button>
            {!bulkDryRun && (
              <span className="text-xs text-red-300 self-center">
                Confirme as opções antes: importação real pode demorar muito.
              </span>
            )}
          </div>
          {bulkResult && (
            <div className="mt-4 p-4 rounded-lg bg-gray-900/80 border border-gray-700 text-sm space-y-1 font-mono">
              <p>Catálogo API: {bulkResult.catalogSize ?? '—'} cartas</p>
              <p>Linhas consideradas: {bulkResult.totalRows ?? '—'}</p>
              {(bulkResult.skippedByTypeFilter ?? 0) > 0 && (
                <p className="text-amber-300">Ignoradas (tipo principal): {bulkResult.skippedByTypeFilter}</p>
              )}
              {(bulkResult.skippedBySubtypeFilter ?? 0) > 0 && (
                <p className="text-amber-300">Ignoradas (subtipo): {bulkResult.skippedBySubtypeFilter}</p>
              )}
              <p>Inseridas: {bulkResult.inserted ?? 0} | Atualizadas: {bulkResult.updated ?? 0}</p>
              <p>Puladas (conflito): {bulkResult.skipped ?? 0} | Erros: {bulkResult.errors ?? 0}</p>
              {bulkResult.errorSamples?.length ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-300">Amostras de erro</summary>
                  <ul className="mt-2 list-disc pl-5 text-xs text-gray-400">
                    {bulkResult.errorSamples.map((s, i) => (
                      <li key={i}>
                        {s.name || s.idCarta || '?'}: {s.message}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
