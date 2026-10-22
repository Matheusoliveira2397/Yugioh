import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import CardImage from '../components/CardImage';

const MAX_PARTICIPANTS_OPTIONS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
/** Para pontos corridos: vagas de 2 a 128 (qualquer número) */
const MAX_PARTICIPANTS_ROUND_ROBIN = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 64, 128];
const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'single_elimination', label: 'Mata-mata (eliminação simples)' },
  { value: 'round_robin', label: 'Pontos corridos (todos contra todos)' },
];

interface Tournament {
  id: string;
  name: string;
  description?: string;
  format: string;
  maxParticipants: number;
  currentParticipants: number;
  minLevel?: number;
  maxLevel?: number | null;
  status: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
  prizeDetails?: Record<number, { credit?: number; cash?: number; cardIds?: string[]; trophyTitle?: string; trophyIcon?: string; stars?: number }> | null;
  entryFee: number;
  entryFeeType?: 'credit' | 'cash';
  tournamentTypeId?: string | null;
  banlist?: string[];
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PRIZE_DETAILS = (): Record<number, { credit: number; cash: number; trophyTitle: string; trophyIcon: string; cardIds: string[]; stars: number }> => ({
  1: { credit: 0, cash: 0, trophyTitle: '', trophyIcon: '', cardIds: [], stars: 0 },
  2: { credit: 0, cash: 0, trophyTitle: '', trophyIcon: '', cardIds: [], stars: 0 },
  3: { credit: 0, cash: 0, trophyTitle: '', trophyIcon: '', cardIds: [], stars: 0 },
  4: { credit: 0, cash: 0, trophyTitle: '', trophyIcon: '', cardIds: [], stars: 0 },
});

interface Card {
  id: string;
  isActive?: boolean;
  idCarta: string;
  name: string;
  type: string;
  cardImage?: string;
}

interface TournamentType {
  id: string;
  name: string;
  description?: string | null;
  defaultBanlist?: string[] | null;
  defaultEntryFee: number;
  defaultEntryFeeType: 'credit' | 'cash';
  defaultMaxParticipants: number;
  defaultMinLevel: number;
  defaultMaxLevel?: number | null;
  defaultPrizeDetails?: Record<number, { credit?: number; cash?: number; cardIds?: string[]; trophyTitle?: string; trophyIcon?: string }> | null;
}

export default function AdminTournamentsPanel() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [banlistSearch, setBanlistSearch] = useState('');
  const [prizeCardSearch, setPrizeCardSearch] = useState<Record<number, string>>({ 1: '', 2: '', 3: '', 4: '' });
  const [uploadingTrophyPlace, setUploadingTrophyPlace] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<'tournaments' | 'types'>('tournaments');
  const [tournamentTypes, setTournamentTypes] = useState<TournamentType[]>([]);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<TournamentType | null>(null);
  const [typeFormData, setTypeFormData] = useState<Partial<TournamentType> & { name: string }>({
    name: '',
    description: '',
    defaultBanlist: [],
    defaultEntryFee: 0,
    defaultEntryFeeType: 'credit',
    defaultMaxParticipants: 16,
    defaultMinLevel: 1,
    defaultMaxLevel: null,
    defaultPrizeDetails: DEFAULT_PRIZE_DETAILS(),
  });
  const [selectedTournamentTypeId, setSelectedTournamentTypeId] = useState<string | null>(null);
  const [typeBanlistSearch, setTypeBanlistSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format: 'single_elimination',
    maxParticipants: 16,
    minLevel: 1,
    maxLevel: null as number | null,
    registrationOpenAt: '',
    registrationCloseAt: '',
    startAt: '',
    prizeFirst: 0,
    prizeSecond: 0,
    prizeThird: 0,
    prizeDetails: DEFAULT_PRIZE_DETAILS(),
    entryFee: 0,
    entryFeeType: 'credit' as 'credit' | 'cash',
    banlist: [] as string[],
  });

  useEffect(() => {
    loadTournaments();
    loadAllCards();
    loadTournamentTypes();
  }, []);

  const loadTournamentTypes = async () => {
    try {
      const res = await api.get<TournamentType[]>('/tournament-types');
      setTournamentTypes(res.data);
    } catch (e) {
      console.error('Erro ao carregar tipos de torneio:', e);
    }
  };

  const applyTournamentTypeDefaults = async (typeId: string) => {
    setSelectedTournamentTypeId(typeId);
    try {
      const [typeRes, seqRes] = await Promise.all([
        api.get<TournamentType>(`/tournament-types/${typeId}`),
        api.get<{ nextName: string; nextNumber: number }>(`/tournament-types/${typeId}/next-sequence`),
      ]);
      const type = typeRes.data;
      const def = type.defaultPrizeDetails || {};
      const prizeDetails = {
        1: { ...DEFAULT_PRIZE_DETAILS()[1], ...def[1] },
        2: { ...DEFAULT_PRIZE_DETAILS()[2], ...def[2] },
        3: { ...DEFAULT_PRIZE_DETAILS()[3], ...def[3] },
        4: { ...DEFAULT_PRIZE_DETAILS()[4], ...def[4] },
      };
      setFormData({
        ...formData,
        name: seqRes.data.nextName,
        description: type.description || '',
        maxParticipants: type.defaultMaxParticipants ?? 16,
        minLevel: type.defaultMinLevel ?? 1,
        maxLevel: type.defaultMaxLevel ?? null,
        entryFee: type.defaultEntryFee ?? 0,
        entryFeeType: (type.defaultEntryFeeType === 'cash' ? 'cash' : 'credit') as 'credit' | 'cash',
        banlist: Array.isArray(type.defaultBanlist) ? [...type.defaultBanlist] : [],
        prizeDetails,
      });
    } catch (e) {
      setMessage({ type: 'error', text: 'Erro ao carregar padrões do tipo' });
    }
  };

  const handleTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeFormData.name?.trim()) {
      setMessage({ type: 'error', text: 'Nome do tipo é obrigatório' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        name: typeFormData.name.trim(),
        description: typeFormData.description?.trim() || null,
        defaultBanlist: typeFormData.defaultBanlist?.length ? typeFormData.defaultBanlist : null,
        defaultEntryFee: typeFormData.defaultEntryFee ?? 0,
        defaultEntryFeeType: typeFormData.defaultEntryFeeType === 'cash' ? 'cash' : 'credit',
        defaultMaxParticipants: typeFormData.defaultMaxParticipants ?? 16,
        defaultMinLevel: typeFormData.defaultMinLevel ?? 1,
        defaultMaxLevel: typeFormData.defaultMaxLevel ?? null,
        defaultPrizeDetails: typeFormData.defaultPrizeDetails && Object.keys(typeFormData.defaultPrizeDetails).length ? typeFormData.defaultPrizeDetails : null,
      };
      if (editingType) {
        await api.put(`/tournament-types/${editingType.id}`, payload);
        setMessage({ type: 'success', text: 'Tipo atualizado!' });
      } else {
        await api.post('/tournament-types', payload);
        setMessage({ type: 'success', text: 'Tipo criado!' });
      }
      setShowTypeForm(false);
      setEditingType(null);
      setTypeFormData({ name: '', description: '', defaultBanlist: [], defaultEntryFee: 0, defaultEntryFeeType: 'credit', defaultMaxParticipants: 16, defaultMinLevel: 1, defaultMaxLevel: null, defaultPrizeDetails: DEFAULT_PRIZE_DETAILS() });
      loadTournamentTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao salvar tipo' });
    } finally {
      setLoading(false);
    }
  };

  const handleEditType = (t: TournamentType) => {
    setEditingType(t);
    setTypeFormData({
      name: t.name,
      description: t.description ?? '',
      defaultBanlist: t.defaultBanlist ? [...t.defaultBanlist] : [],
      defaultEntryFee: t.defaultEntryFee ?? 0,
      defaultEntryFeeType: (t.defaultEntryFeeType === 'cash' ? 'cash' : 'credit') as 'credit' | 'cash',
      defaultMaxParticipants: t.defaultMaxParticipants ?? 16,
      defaultMinLevel: t.defaultMinLevel ?? 1,
      defaultMaxLevel: t.defaultMaxLevel ?? null,
      defaultPrizeDetails: t.defaultPrizeDetails ? { 1: { ...DEFAULT_PRIZE_DETAILS()[1], ...t.defaultPrizeDetails[1] }, 2: { ...DEFAULT_PRIZE_DETAILS()[2], ...t.defaultPrizeDetails[2] }, 3: { ...DEFAULT_PRIZE_DETAILS()[3], ...t.defaultPrizeDetails[3] }, 4: { ...DEFAULT_PRIZE_DETAILS()[4], ...t.defaultPrizeDetails[4] } } : DEFAULT_PRIZE_DETAILS(),
    });
    setShowTypeForm(true);
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('Excluir este tipo? Torneios que usam ele não serão excluídos.')) return;
    try {
      await api.delete(`/tournament-types/${id}`);
      setMessage({ type: 'success', text: 'Tipo excluído' });
      loadTournamentTypes();
      if (editingType?.id === id) { setShowTypeForm(false); setEditingType(null); }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.response?.data?.message || 'Erro ao excluir' });
    }
  };

  useEffect(() => {
    if (message?.type === 'error') {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const loadTournaments = async () => {
    try {
      const response = await api.get('/tournaments');
      setTournaments(response.data);
    } catch (error) {
      console.error('Erro ao carregar torneios:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar torneios' });
    } finally {
      setLoading(false);
    }
  };

  const loadAllCards = async () => {
    try {
      const response = await api.get('/cards/admin/all');
      setAllCards(response.data.filter((card: Card) => card.isActive));
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Nome do torneio é obrigatório' });
      setLoading(false);
      return;
    }

    if (!formData.registrationOpenAt || !formData.registrationCloseAt || !formData.startAt) {
      setMessage({ type: 'error', text: 'Todos os horários são obrigatórios' });
      setLoading(false);
      return;
    }

    if (new Date(formData.registrationOpenAt) >= new Date(formData.registrationCloseAt)) {
      setMessage({ type: 'error', text: 'Horário de fechamento deve ser após o de abertura' });
      setLoading(false);
      return;
    }

    if (new Date(formData.registrationCloseAt) > new Date(formData.startAt)) {
      setMessage({ type: 'error', text: 'Início do torneio deve ser no mesmo horário ou depois do fechamento das inscrições (cronograma: 1 → 2 → 3).' });
      setLoading(false);
      return;
    }

    const isRoundRobin = formData.format === 'round_robin';
    if (isRoundRobin) {
      if (formData.maxParticipants < 2 || formData.maxParticipants > 128) {
        setMessage({ type: 'error', text: 'Para pontos corridos, vagas devem ser entre 2 e 128.' });
        setLoading(false);
        return;
      }
    } else if (!MAX_PARTICIPANTS_OPTIONS.includes(formData.maxParticipants)) {
      setMessage({ type: 'error', text: 'Para mata-mata, vagas devem ser potência de 2: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024 ou 2048' });
      setLoading(false);
      return;
    }

    try {
      const prizeDetailsClean = formData.prizeDetails
        ? (() => {
            const out: Record<number, { credit?: number; cash?: number; trophyTitle?: string; trophyIcon?: string; cardIds?: string[]; stars?: number }> = {};
            ([1, 2, 3, 4] as const).forEach((place) => {
              const v = formData.prizeDetails![place];
              if (!v) return;
              const entry: typeof out[1] = {};
              if (v.credit != null && v.credit >= 0) entry.credit = v.credit;
              if (v.cash != null && v.cash >= 0) entry.cash = v.cash;
              if (v.trophyTitle?.trim()) entry.trophyTitle = v.trophyTitle.trim();
              if (v.trophyIcon?.trim()) entry.trophyIcon = v.trophyIcon.trim();
              if (v.cardIds?.length) entry.cardIds = v.cardIds;
              if (v.stars != null && v.stars > 0) entry.stars = v.stars;
              if (Object.keys(entry).length > 0) out[place] = entry;
            });
            return Object.keys(out).length > 0 ? out : null;
          })()
        : null;
      const tournamentData = {
        ...formData,
        format: formData.format,
        minLevel: formData.minLevel ?? 1,
        maxLevel: formData.maxLevel ?? null,
        prizeDetails: prizeDetailsClean && Object.keys(prizeDetailsClean).length > 0 ? prizeDetailsClean : null,
        registrationOpenAt: new Date(formData.registrationOpenAt).toISOString(),
        registrationCloseAt: new Date(formData.registrationCloseAt).toISOString(),
        startAt: new Date(formData.startAt).toISOString(),
        entryFeeType: formData.entryFeeType === 'cash' ? 'cash' : 'credit',
        tournamentTypeId: selectedTournamentTypeId || null,
        banlist: formData.banlist.length > 0 ? formData.banlist : null,
      };

      if (editingTournament) {
        await api.put(`/tournaments/${editingTournament.id}`, tournamentData);
        setMessage({ type: 'success', text: 'Torneio atualizado com sucesso!' });
      } else {
        await api.post('/tournaments', tournamentData);
        setMessage({ type: 'success', text: 'Torneio criado com sucesso!' });
      }

      setShowForm(false);
      setEditingTournament(null);
      resetForm();
      loadTournaments();
    } catch (error: any) {
      console.error('Erro ao salvar torneio:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao salvar torneio',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      format: 'single_elimination',
      maxParticipants: 16,
      minLevel: 1,
      maxLevel: null,
      registrationOpenAt: '',
      registrationCloseAt: '',
      startAt: '',
      prizeFirst: 0,
      prizeSecond: 0,
      prizeThird: 0,
      prizeDetails: DEFAULT_PRIZE_DETAILS(),
      entryFee: 0,
      entryFeeType: 'credit',
      banlist: [],
    });
  };

  /** Converte data ISO para o formato do input datetime-local (horário local) */
  const toDatetimeLocal = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  const handleEdit = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setFormData({
      name: tournament.name,
      description: tournament.description || '',
      format: tournament.format,
      maxParticipants: tournament.maxParticipants,
      minLevel: tournament.minLevel ?? 1,
      maxLevel: tournament.maxLevel ?? null,
      registrationOpenAt: toDatetimeLocal(tournament.registrationOpenAt),
      registrationCloseAt: toDatetimeLocal(tournament.registrationCloseAt),
      startAt: toDatetimeLocal(tournament.startAt),
      prizeFirst: tournament.prizeFirst,
      prizeSecond: tournament.prizeSecond,
      prizeThird: tournament.prizeThird,
      prizeDetails: (() => {
        const def = DEFAULT_PRIZE_DETAILS();
        if (!tournament.prizeDetails) return def;
        return { 1: { ...def[1], ...tournament.prizeDetails[1] }, 2: { ...def[2], ...tournament.prizeDetails[2] }, 3: { ...def[3], ...tournament.prizeDetails[3] }, 4: { ...def[4], ...tournament.prizeDetails[4] } };
      })(),
      entryFee: tournament.entryFee,
      entryFeeType: (tournament.entryFeeType === 'cash' ? 'cash' : 'credit') as 'credit' | 'cash',
      banlist: tournament.banlist || [],
    });
    setSelectedTournamentTypeId(tournament.tournamentTypeId ?? null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este torneio?')) return;

    try {
      await api.delete(`/tournaments/${id}`);
      setMessage({ type: 'success', text: 'Torneio excluído com sucesso!' });
      loadTournaments();
    } catch (error) {
      console.error('Erro ao excluir torneio:', error);
      setMessage({ type: 'error', text: 'Erro ao excluir torneio' });
    }
  };

  const addToBanlist = (cardId: string) => {
    if (!formData.banlist.includes(cardId)) {
      setFormData({ ...formData, banlist: [...formData.banlist, cardId] });
    }
  };

  const removeFromBanlist = (cardId: string) => {
    setFormData({ ...formData, banlist: formData.banlist.filter(id => id !== cardId) });
  };

  const addPrizeCard = (place: number, cardId: string) => {
    const pd = formData.prizeDetails?.[place as 1|2|3|4] ?? DEFAULT_PRIZE_DETAILS()[place as 1|2|3|4];
    const ids = pd.cardIds ?? [];
    if (ids.includes(cardId)) return;
    setFormData({
      ...formData,
      prizeDetails: {
        ...formData.prizeDetails,
        [place]: { ...pd, cardIds: [...ids, cardId] },
      },
    });
  };

  const removePrizeCard = (place: number, cardId: string) => {
    const pd = formData.prizeDetails?.[place as 1|2|3|4] ?? DEFAULT_PRIZE_DETAILS()[place as 1|2|3|4];
    setFormData({
      ...formData,
      prizeDetails: {
        ...formData.prizeDetails,
        [place]: { ...pd, cardIds: (pd.cardIds ?? []).filter(id => id !== cardId) },
      },
    });
  };

  const handleTrophyUpload = async (place: number, file: File, title: string) => {
    setUploadingTrophyPlace(place);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('title', title || `trofeu_${place}`);
      const { data } = await api.post<{ imageUrl: string }>('/cosmetics/admin/upload-trophy', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const pd = formData.prizeDetails?.[place as 1|2|3|4] ?? DEFAULT_PRIZE_DETAILS()[place as 1|2|3|4];
      setFormData({
        ...formData,
        prizeDetails: {
          ...formData.prizeDetails,
          [place]: { ...pd, trophyIcon: data.imageUrl },
        },
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao enviar ícone do troféu' });
    } finally {
      setUploadingTrophyPlace(null);
    }
  };

  const filteredCards = allCards.filter(card =>
    card.name.toLowerCase().includes(banlistSearch.toLowerCase()) ||
    card.idCarta?.toLowerCase().includes(banlistSearch.toLowerCase())
  );

  const filteredTournaments = tournaments.filter(tournament =>
    tournament.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-gray-500';
      case 'registration_open': return 'bg-green-500';
      case 'registration_closed': return 'bg-yellow-500';
      case 'in_progress': return 'bg-blue-500';
      case 'finished': return 'bg-purple-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading && tournaments.length === 0) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Gerenciar Torneios</h1>
            <p className="text-gray-400">Criar e gerenciar torneios e tipos (padrões)</p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'tournaments' && (
              <button
                onClick={() => {
                  resetForm();
                  setEditingTournament(null);
                  setSelectedTournamentTypeId(null);
                  setShowForm(true);
                }}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-bold rounded-lg hover:from-purple-700 hover:to-purple-900 transition-all"
              >
                + Criar Torneio
              </button>
            )}
            {activeTab === 'types' && (
              <button
                onClick={() => {
                  setEditingType(null);
                  setTypeFormData({ name: '', description: '', defaultBanlist: [], defaultEntryFee: 0, defaultEntryFeeType: 'credit', defaultMaxParticipants: 16, defaultMinLevel: 1, defaultMaxLevel: null, defaultPrizeDetails: DEFAULT_PRIZE_DETAILS() });
                  setShowTypeForm(true);
                }}
                className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold rounded-lg hover:from-amber-700 hover:to-amber-900 transition-all"
              >
                + Criar Tipo
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('tournaments')}
            className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'tournaments' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}`}
          >
            Torneios
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'types' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}`}
          >
            Tipos de Torneio
          </button>
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 border border-green-500' : 'bg-red-500/20 border border-red-500'
            }`}
          >
            <p className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>
              {message.text}
            </p>
          </motion.div>
        )}

        {activeTab === 'tournaments' && (
          <>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-slate-800 rounded-xl p-6 mb-8 border-2 border-purple-500"
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingTournament ? 'Editar Torneio' : 'Criar Novo Torneio'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="mb-4 p-3 rounded-lg bg-slate-800/50 border border-slate-600">
                <label className="block text-white mb-2">Tipo de torneio (opcional)</label>
                <select
                  value={selectedTournamentTypeId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) applyTournamentTypeDefaults(v);
                    else { setSelectedTournamentTypeId(null); }
                  }}
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                >
                  <option value="">— Nenhum (criar do zero) —</option>
                  {tournamentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-slate-400 text-xs mt-1">Escolha um tipo para preencher nome, banlist, taxa e premiação. O nome será sequencial (ex.: Torneio Season 2).</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white mb-2">Nome do Torneio *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Formato *</label>
                  <select
                    value={formData.format}
                    onChange={(e) => {
                      const format = e.target.value as 'single_elimination' | 'round_robin';
                      const max = format === 'round_robin' && formData.maxParticipants > 128
                        ? 128
                        : formData.maxParticipants;
                      setFormData({ ...formData, format, maxParticipants: max });
                    }}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  >
                    {FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-slate-400 text-xs mt-1">
                    {formData.format === 'round_robin' ? 'Todos jogam contra todos; ranking por vitórias.' : 'Perdeu está fora; quem ganha passa de fase.'}
                  </p>
                </div>

                <div>
                  <label className="block text-white mb-2">
                    {formData.format === 'round_robin' ? 'Vagas (2 a 128) *' : 'Vagas (potência de 2) *'}
                  </label>
                  <select
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData({ ...formData, maxParticipants: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    required
                  >
                    {(formData.format === 'round_robin' ? MAX_PARTICIPANTS_ROUND_ROBIN : MAX_PARTICIPANTS_OPTIONS).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Nível Mínimo</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.minLevel}
                    onChange={(e) => setFormData({ ...formData, minLevel: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-white mb-2">Nível Máximo</label>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.maxLevel === null}
                      onChange={(e) => setFormData({ ...formData, maxLevel: e.target.checked ? null : (formData.maxLevel ?? 99) })}
                      className="rounded bg-slate-700"
                    />
                    <span className="text-gray-300 text-sm">Sem limite (todos os níveis)</span>
                  </label>
                  {formData.maxLevel !== null && (
                    <input
                      type="number"
                      min={formData.minLevel}
                      value={formData.maxLevel ?? ''}
                      onChange={(e) => setFormData({ ...formData, maxLevel: e.target.value === '' ? null : Math.max(formData.minLevel, parseInt(e.target.value, 10) || formData.minLevel) })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-white mb-2">Taxa de Inscrição</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.entryFeeType ?? 'credit'}
                      onChange={(e) => setFormData({ ...formData, entryFeeType: e.target.value as 'credit' | 'cash' })}
                      className="px-4 py-2 bg-slate-700 text-white rounded-lg"
                    >
                      <option value="credit">Créditos</option>
                      <option value="cash">Cash</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={formData.entryFee}
                      onChange={(e) => setFormData({ ...formData, entryFee: parseInt(e.target.value) || 0 })}
                      className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg"
                      placeholder="0"
                    />
                  </div>
                  <p className="text-slate-400 text-xs mt-1">Valor cobrado na inscrição (créditos ou cash).</p>
                </div>

              </div>

              {/* Cronograma: ordem clara (1 → 2 → 3) */}
              <div className="border-t border-slate-600 pt-6 mt-6">
                <h3 className="text-lg font-bold text-white mb-1">Cronograma</h3>
                <p className="text-slate-400 text-sm mb-4">Defina a ordem: inscrições abrem → fecham → torneio inicia (chave divulgada e primeira rodada).</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-600">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-600/80 text-white text-sm font-bold mb-2">1</span>
                    <label className="block text-white font-medium mb-1">Abertura das inscrições *</label>
                    <p className="text-slate-400 text-xs mb-2">A partir de quando os jogadores podem se inscrever.</p>
                    <input
                      type="datetime-local"
                      value={formData.registrationOpenAt}
                      onChange={(e) => setFormData({ ...formData, registrationOpenAt: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-green-500"
                      required
                    />
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-600">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-600/80 text-white text-sm font-bold mb-2">2</span>
                    <label className="block text-white font-medium mb-1">Fechamento das inscrições *</label>
                    <p className="text-slate-400 text-xs mb-2">Depois desse horário ninguém mais se inscreve.</p>
                    <input
                      type="datetime-local"
                      value={formData.registrationCloseAt}
                      onChange={(e) => setFormData({ ...formData, registrationCloseAt: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-yellow-500"
                      required
                    />
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-600">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-600/80 text-white text-sm font-bold mb-2">3</span>
                    <label className="block text-white font-medium mb-1">Início do torneio *</label>
                    <p className="text-slate-400 text-xs mb-2">Chave divulgada e primeira rodada começa.</p>
                    <input
                      type="datetime-local"
                      value={formData.startAt}
                      onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-amber-500"
                      required
                    />
                  </div>
                </div>
                {/* Resumo ao vivo */}
                {formData.registrationOpenAt && formData.registrationCloseAt && formData.startAt && (
                  <div className="mt-4 p-3 rounded-lg bg-slate-900/80 border border-slate-600 text-sm">
                    <p className="text-slate-400 mb-1">Resumo (horário local):</p>
                    <p className="text-white">
                      1º Inscrições: <span className="text-green-400">{new Date(formData.registrationOpenAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      {' → '}
                      2º Fechamento: <span className="text-yellow-400">{new Date(formData.registrationCloseAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      {' → '}
                      3º Início do torneio: <span className="text-amber-400">{new Date(formData.startAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-white mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  rows={3}
                />
              </div>

              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-lg font-bold text-white mb-3">Premiação por lugar (opcional: cash, crédito, carta, troféu, estrelas)</h3>
                <p className="text-slate-400 text-sm mb-4">Troféu vai para o perfil de conquistas. Estrelas são premiação de torneio (ex.: 1º = 3, 2º = 2, 3º = 1).</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {([1, 2, 3, 4] as const).map((place) => {
                    const pd = formData.prizeDetails?.[place] ?? DEFAULT_PRIZE_DETAILS()[place];
                    const search = prizeCardSearch[place] ?? '';
                    const filteredPrizeCards = search.trim()
                      ? allCards.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.idCarta || '').toLowerCase().includes(search.toLowerCase()))
                      : [];
                    return (
                      <div key={place} className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                        <h4 className="text-amber-400 font-semibold mb-3">{place}º lugar</h4>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-400 text-xs">Créditos</label>
                              <input type="number" min={0} value={pd.credit ?? 0} onChange={(e) => setFormData({ ...formData, prizeDetails: { ...formData.prizeDetails, [place]: { ...pd, credit: parseInt(e.target.value) || 0 } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded text-sm" />
                            </div>
                            <div>
                              <label className="block text-gray-400 text-xs">Cash</label>
                              <input type="number" min={0} value={pd.cash ?? 0} onChange={(e) => setFormData({ ...formData, prizeDetails: { ...formData.prizeDetails, [place]: { ...pd, cash: parseInt(e.target.value) || 0 } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded text-sm" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-400 text-xs">⭐ Estrelas (premiação)</label>
                            <input type="number" min={0} value={pd.stars ?? 0} onChange={(e) => setFormData({ ...formData, prizeDetails: { ...formData.prizeDetails, [place]: { ...pd, stars: Math.max(0, parseInt(e.target.value) || 0) } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded text-sm" placeholder="0" />
                          </div>
                          <div>
                            <label className="block text-gray-400 text-xs">Troféu (título na conquista)</label>
                            <input type="text" placeholder="Ex: Campeão do Torneio" value={pd.trophyTitle ?? ''} onChange={(e) => setFormData({ ...formData, prizeDetails: { ...formData.prizeDetails, [place]: { ...pd, trophyTitle: e.target.value } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded text-sm" />
                          </div>
                          <div>
                            <label className="block text-gray-400 text-xs">Ícone do troféu</label>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/jpg"
                                className="hidden"
                                id={`trophy-upload-${place}`}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleTrophyUpload(place, file, pd.trophyTitle ?? `trofeu_${place}`);
                                  e.target.value = '';
                                }}
                              />
                              <label htmlFor={`trophy-upload-${place}`} className={`px-2 py-1.5 rounded text-sm font-medium text-white ${uploadingTrophyPlace === place ? 'bg-slate-500 cursor-wait pointer-events-none' : 'cursor-pointer bg-amber-600 hover:bg-amber-700'}`}>
                                {uploadingTrophyPlace === place ? 'Enviando...' : 'Enviar imagem'}
                              </label>
                              {(pd.trophyIcon ?? '') && (
                                <>
                                  <img src={pd.trophyIcon} alt="" className="w-8 h-8 rounded object-cover border border-slate-600" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <button type="button" onClick={() => setFormData({ ...formData, prizeDetails: { ...formData.prizeDetails, [place]: { ...pd, trophyIcon: '' } } })} className="text-red-400 hover:text-red-300 text-xs">Remover</button>
                                </>
                              )}
                            </div>
                            <input type="text" placeholder="Ou cole URL do ícone" value={pd.trophyIcon ?? ''} onChange={(e) => setFormData({ ...formData, prizeDetails: { ...formData.prizeDetails, [place]: { ...pd, trophyIcon: e.target.value } } })} className="w-full mt-1 px-2 py-1 bg-slate-700 text-white rounded text-sm" />
                          </div>
                          <div>
                            <label className="block text-gray-400 text-xs">Cartas (pesquise por nome)</label>
                            <input
                              type="text"
                              placeholder="Pesquisar carta por nome..."
                              value={search}
                              onChange={(e) => setPrizeCardSearch({ ...prizeCardSearch, [place]: e.target.value })}
                              className="w-full px-2 py-1 bg-slate-700 text-white rounded text-sm mb-1"
                            />
                            {search.trim() && (
                              <div className="max-h-32 overflow-y-auto bg-slate-900 rounded p-2 mb-2 grid grid-cols-3 gap-1">
                                {filteredPrizeCards.slice(0, 12).map((card) => (
                                  <div
                                    key={card.id}
                                    onClick={() => addPrizeCard(place, card.idCarta || card.id)}
                                    className="cursor-pointer p-1 rounded border border-slate-600 hover:border-amber-500 flex items-center gap-1"
                                  >
                                    <CardImage card={card} className="w-8 h-11 object-cover rounded flex-shrink-0" fallback="/images/fundoCarta.webp" />
                                    <span className="text-xs text-white truncate">{card.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(pd.cardIds ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {(pd.cardIds ?? []).map((cardId) => {
                                  const card = allCards.find(c => (c.idCarta || c.id) === cardId);
                                  return (
                                    <div key={cardId} className="flex items-center gap-1 bg-slate-700 rounded px-2 py-1">
                                      {card && <CardImage card={card} className="w-6 h-8 object-cover rounded" fallback="/images/fundoCarta.webp" />}
                                      <span className="text-xs text-white max-w-[80px] truncate">{card?.name ?? cardId}</span>
                                      <button type="button" onClick={() => removePrizeCard(place, cardId)} className="text-red-400 hover:text-red-300 text-xs">×</button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Banlist */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-xl font-bold text-white mb-4">Banlist</h3>
                
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Buscar carta para banir..."
                    value={banlistSearch}
                    onChange={(e) => setBanlistSearch(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg"
                  />
                </div>

                {banlistSearch && (
                  <div className="max-h-60 overflow-y-auto bg-slate-900 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {filteredCards.slice(0, 20).map((card) => (
                        <div
                          key={card.id}
                          onClick={() => addToBanlist(card.idCarta || card.id)}
                          className={`cursor-pointer p-2 rounded-lg border-2 ${
                            formData.banlist.includes(card.idCarta || card.id)
                              ? 'border-red-500 bg-red-500/20'
                              : 'border-slate-700 hover:border-purple-500'
                          }`}
                        >
                          <CardImage
                            card={card}
                            className="w-full aspect-[2/3] object-cover rounded"
                            fallback="/images/fundoCarta.webp"
                          />
                          <p className="text-xs text-white mt-2 truncate">{card.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {formData.banlist.length > 0 && (
                  <div>
                    <p className="text-white mb-2">Cartas Banidas ({formData.banlist.length}):</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.banlist.map((cardId) => {
                        const card = allCards.find(c => (c.idCarta || c.id) === cardId);
                        return (
                          <div
                            key={cardId}
                            className="flex items-center gap-2 bg-red-500/20 border border-red-500 rounded-lg p-2"
                          >
                            {card && (
                              <>
                                <CardImage
                                  card={card}
                                  className="w-12 h-16 object-cover rounded"
                                  fallback="/images/fundoCarta.webp"
                                />
                                <span className="text-white text-sm">{card.name}</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFromBanlist(cardId)}
                              className="text-red-400 hover:text-red-300"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-bold rounded-lg hover:from-purple-700 hover:to-purple-900 transition-all disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : editingTournament ? 'Atualizar' : 'Criar Torneio'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTournament(null);
                    resetForm();
                  }}
                  className="px-6 py-3 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar torneios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800 rounded-xl p-6 border-2 border-purple-500"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{tournament.name}</h3>
                <span className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(tournament.status)}`}>
                  {tournament.status}
                </span>
              </div>

              <div className="space-y-2 text-gray-300 mb-4 text-sm">
                <p>👥 {tournament.currentParticipants}/{tournament.maxParticipants} participantes</p>
                <p>📅 Início: {new Date(tournament.startAt).toLocaleString('pt-BR')}</p>
                <p>💰 Taxa: {tournament.entryFee} {tournament.entryFeeType === 'cash' ? 'cash' : 'créditos'}</p>
                {tournament.banlist && tournament.banlist.length > 0 && (
                  <p>🚫 {tournament.banlist.length} cartas banidas</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(tournament)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(tournament.id)}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          ))}
        </div>
          </>
        )}

        {activeTab === 'types' && (
          <>
            {showTypeForm && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-800 rounded-xl p-6 mb-8 border-2 border-amber-500">
                <h2 className="text-2xl font-bold text-white mb-6">{editingType ? 'Editar Tipo' : 'Criar Tipo de Torneio'}</h2>
                <form onSubmit={handleTypeSubmit} className="space-y-4">
                  <div>
                    <label className="block text-white mb-2">Nome do tipo (ex.: Torneio Season, Torneio Semanal) *</label>
                    <input type="text" value={typeFormData.name} onChange={(e) => setTypeFormData({ ...typeFormData, name: e.target.value })} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Descrição</label>
                    <textarea value={typeFormData.description ?? ''} onChange={(e) => setTypeFormData({ ...typeFormData, description: e.target.value })} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg" rows={2} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white mb-2">Taxa padrão</label>
                      <div className="flex gap-2">
                        <select value={typeFormData.defaultEntryFeeType ?? 'credit'} onChange={(e) => setTypeFormData({ ...typeFormData, defaultEntryFeeType: e.target.value as 'credit' | 'cash' })} className="px-4 py-2 bg-slate-700 text-white rounded-lg">
                          <option value="credit">Créditos</option>
                          <option value="cash">Cash</option>
                        </select>
                        <input type="number" min={0} value={typeFormData.defaultEntryFee ?? 0} onChange={(e) => setTypeFormData({ ...typeFormData, defaultEntryFee: parseInt(e.target.value) || 0 })} className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-white mb-2">Vagas padrão</label>
                      <select value={typeFormData.defaultMaxParticipants ?? 16} onChange={(e) => setTypeFormData({ ...typeFormData, defaultMaxParticipants: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg">
                        {MAX_PARTICIPANTS_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-white mb-2">Nível mínimo padrão</label>
                      <input type="number" min={1} value={typeFormData.defaultMinLevel ?? 1} onChange={(e) => setTypeFormData({ ...typeFormData, defaultMinLevel: parseInt(e.target.value) || 1 })} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-white mb-2">Nível máximo padrão</label>
                      <input type="number" min={1} value={typeFormData.defaultMaxLevel ?? ''} placeholder="Vazio = sem limite" onChange={(e) => setTypeFormData({ ...typeFormData, defaultMaxLevel: e.target.value === '' ? null : parseInt(e.target.value) || null })} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-white mb-2">Banlist padrão (pesquise e clique para adicionar)</label>
                    <input type="text" placeholder="Pesquisar carta..." value={typeBanlistSearch} onChange={(e) => setTypeBanlistSearch(e.target.value)} className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg mb-2" />
                    {typeBanlistSearch.trim() && (
                      <div className="max-h-40 overflow-y-auto bg-slate-900 rounded-lg p-2 mb-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                        {allCards.filter(c => (c.name || '').toLowerCase().includes(typeBanlistSearch.toLowerCase()) || (c.idCarta || '').toLowerCase().includes(typeBanlistSearch.toLowerCase())).slice(0, 16).map((card) => (
                          <div key={card.id} onClick={() => {
                              const id = card.idCarta || card.id;
                              const list = typeFormData.defaultBanlist || [];
                              if (list.includes(id)) return;
                              setTypeFormData({ ...typeFormData, defaultBanlist: [...list, id] });
                            }} className="cursor-pointer p-2 rounded border border-slate-600 hover:border-amber-500 flex items-center gap-2">
                            <CardImage card={card} className="w-10 h-14 object-cover rounded" fallback="/images/fundoCarta.webp" />
                            <span className="text-xs text-white truncate">{card.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(typeFormData.defaultBanlist?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {typeFormData.defaultBanlist!.map((cardId) => {
                          const card = allCards.find(c => (c.idCarta || c.id) === cardId);
                          return (
                            <div key={cardId} className="flex items-center gap-1 bg-red-500/20 border border-red-500 rounded px-2 py-1 text-sm">
                              {card && <span className="text-white">{card.name}</span>}
                              <button type="button" onClick={() => setTypeFormData({ ...typeFormData, defaultBanlist: typeFormData.defaultBanlist!.filter(id => id !== cardId) })} className="text-red-400">×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-600 pt-4">
                    <h3 className="text-lg font-bold text-white mb-2">Premiação padrão por lugar (opcional)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {([1, 2, 3, 4] as const).map((place) => {
                        const pd = typeFormData.defaultPrizeDetails?.[place] ?? DEFAULT_PRIZE_DETAILS()[place];
                        return (
                          <div key={place} className="bg-slate-800/50 rounded p-3 border border-slate-600">
                            <h4 className="text-amber-400 font-semibold text-sm mb-2">{place}º lugar</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <label className="text-gray-400 text-xs">Créditos</label>
                                <input type="number" min={0} value={pd?.credit ?? 0} onChange={(e) => setTypeFormData({ ...typeFormData, defaultPrizeDetails: { ...typeFormData.defaultPrizeDetails, [place]: { ...pd, credit: parseInt(e.target.value) || 0 } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded" />
                              </div>
                              <div>
                                <label className="text-gray-400 text-xs">Cash</label>
                                <input type="number" min={0} value={pd?.cash ?? 0} onChange={(e) => setTypeFormData({ ...typeFormData, defaultPrizeDetails: { ...typeFormData.defaultPrizeDetails, [place]: { ...pd, cash: parseInt(e.target.value) || 0 } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded" />
                              </div>
                              <div className="col-span-2">
                                <label className="text-gray-400 text-xs">Troféu (título)</label>
                                <input type="text" value={pd?.trophyTitle ?? ''} onChange={(e) => setTypeFormData({ ...typeFormData, defaultPrizeDetails: { ...typeFormData.defaultPrizeDetails, [place]: { ...pd, trophyTitle: e.target.value } } })} className="w-full px-2 py-1 bg-slate-700 text-white rounded" placeholder="Ex: Campeão" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button type="submit" disabled={loading} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg disabled:opacity-50">
                      {loading ? 'Salvando...' : editingType ? 'Atualizar' : 'Criar Tipo'}
                    </button>
                    <button type="button" onClick={() => { setShowTypeForm(false); setEditingType(null); }} className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
                      Cancelar
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournamentTypes.map((t) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-800 rounded-xl p-6 border-2 border-amber-500">
                  <h3 className="text-xl font-bold text-white mb-2">{t.name}</h3>
                  {t.description && <p className="text-gray-400 text-sm mb-3">{t.description}</p>}
                  <p className="text-gray-300 text-sm">Taxa: {t.defaultEntryFee} {t.defaultEntryFeeType === 'cash' ? 'cash' : 'créditos'} · Vagas: {t.defaultMaxParticipants}</p>
                  {t.defaultBanlist && t.defaultBanlist.length > 0 && <p className="text-gray-400 text-xs mt-1">🚫 {t.defaultBanlist.length} cartas na banlist</p>}
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => handleEditType(t)} className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm">Editar</button>
                    <button onClick={() => handleDeleteType(t.id)} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Excluir</button>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

