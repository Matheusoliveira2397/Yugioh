import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type PatchNoteCategory = 'bugfix' | 'cards' | 'features' | 'balance' | 'other';

interface PatchNote {
  id: string;
  title: string;
  content: string;
  version?: string | null;
  category: PatchNoteCategory;
  isPinned: boolean;
  createdAt: string;
  author?: {
    nickname: string;
    username: string;
    clanTag?: string;
  };
}

const CATEGORIES: Record<
  PatchNoteCategory | 'all',
  { label: string; icon: string; color: string }
> = {
  all: { label: 'Todos', icon: '📋', color: 'border-champion-gold/40 bg-champion-gold/10' },
  bugfix: { label: 'Correções', icon: '🐛', color: 'border-rose-400/40 bg-rose-500/10' },
  cards: { label: 'Cartas', icon: '🎴', color: 'border-violet-400/40 bg-violet-500/10' },
  features: { label: 'Novidades', icon: '✨', color: 'border-emerald-400/40 bg-emerald-500/10' },
  balance: { label: 'Balanceamento', icon: '⚖️', color: 'border-amber-400/40 bg-amber-500/10' },
  other: { label: 'Outros', icon: '📌', color: 'border-sky-400/40 bg-sky-500/10' },
};

export default function PatchNotesPage() {
  const [notes, setNotes] = useState<PatchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PatchNoteCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await axios.get(`${API_URL}/patch-notes`, { timeout: 12000 });
        const list: PatchNote[] = Array.isArray(response.data) ? response.data : [];
        setNotes(list);
        if (list.length > 0) {
          setExpandedId(list[0].id);
        }
      } catch (error) {
        console.error('Erro ao carregar patch notes:', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return notes;
    return notes.filter((n) => n.category === filter);
  }, [notes, filter]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
          Patch Notes
        </h1>
        <p className="text-arena-mist text-sm md:text-base">
          Correções de bugs, cadastro de cartas e demais atualizações do jogo.
        </p>
      </motion.div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(Object.keys(CATEGORIES) as Array<PatchNoteCategory | 'all'>).map((key) => {
          const meta = CATEGORIES[key];
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                active
                  ? `${meta.color} text-white`
                  : 'border-white/10 bg-black/20 text-white/70 hover:border-white/25'
              }`}
            >
              {meta.icon} {meta.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 rounded-full border-2 border-champion-gold/25 border-t-champion-gold animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-white/10 bg-black/20">
          <p className="text-5xl mb-3">📋</p>
          <p className="text-xl text-white/80">Nenhuma atualização por aqui ainda</p>
          <p className="text-sm text-white/50 mt-1">Volte em breve para ver as novidades</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note, index) => {
            const meta = CATEGORIES[note.category] || CATEGORIES.other;
            const open = expandedId === note.id;
            return (
              <motion.article
                key={note.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
                className={`rounded-xl border overflow-hidden ${
                  note.isPinned
                    ? 'border-champion-gold/35 bg-champion-gold/5'
                    : 'border-white/10 bg-black/25'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : note.id)}
                  className="w-full text-left px-4 md:px-5 py-4 flex items-start gap-3 hover:bg-white/5 transition-colors"
                >
                  <span className="text-xl mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {note.isPinned && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-champion-gold/20 text-champion-gold">
                          Fixado
                        </span>
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      {note.version && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80">
                          v{note.version}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-white truncate">
                      {note.title}
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                      {new Date(note.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className="text-white/50 text-sm mt-1">{open ? '▲' : '▼'}</span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 md:px-5 pb-5 pt-0 border-t border-white/10">
                        <pre className="mt-4 text-sm md:text-base text-white/85 whitespace-pre-wrap font-sans leading-relaxed">
                          {note.content}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}
