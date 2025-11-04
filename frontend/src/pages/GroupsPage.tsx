import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface Group {
  id: string;
  name: string;
  tag: string;
  description: string;
  logo: string;
  totalScore: number;
  maxMembers: number;
  isPublic: boolean;
  memberCount?: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterPublic, setFilterPublic] = useState<boolean | undefined>(undefined);
  const { token } = useAuthStore();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    tag: '',
    description: '',
    isPublic: true,
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchGroups();
  }, [filterPublic]);

  const fetchGroups = async () => {
    try {
      const params = filterPublic !== undefined ? { public: filterPublic } : {};
      const response = await axios.get('http://localhost:3000/groups/all', {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups(response.data);
    } catch (error) {
      console.error('Erro ao buscar grupos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validações
    if (formData.name.length < 3) {
      setFormError('Nome deve ter pelo menos 3 caracteres');
      return;
    }
    if (formData.tag.length < 2 || formData.tag.length > 6) {
      setFormError('Tag deve ter entre 2 e 6 caracteres');
      return;
    }

    try {
      await axios.post(
        'http://localhost:3000/groups/create',
        {
          name: formData.name,
          tag: formData.tag.toUpperCase(),
          description: formData.description,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Resetar form e fechar modal
      setFormData({ name: '', tag: '', description: '', isPublic: true });
      setShowCreateModal(false);
      fetchGroups();
    } catch (error: any) {
      setFormError(error.response?.data?.message || 'Erro ao criar grupo');
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      await axios.post(
        `http://localhost:3000/groups/join/${groupId}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      alert('Você entrou no grupo!');
      fetchGroups();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao entrar no grupo');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="text-6xl">👥</span>
              Grupos
            </h1>
            <p className="text-slate-400 text-lg">
              Junte-se ou crie seu próprio clã de duelistas
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-purple-500/50"
          >
            ➕ Criar Grupo
          </button>
        </motion.div>

        {/* Filtros */}
        <div className="flex gap-4 mt-6">
          <button
            onClick={() => setFilterPublic(undefined)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              filterPublic === undefined
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterPublic(true)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              filterPublic === true
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🌍 Públicos
          </button>
          <button
            onClick={() => setFilterPublic(false)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              filterPublic === false
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🔒 Privados
          </button>
        </div>
      </div>

      {/* Lista de Grupos */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center text-white text-xl">Carregando...</div>
        ) : groups.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center bg-slate-800/50 rounded-2xl p-12 border border-slate-700"
          >
            <span className="text-6xl mb-4 block">🏜️</span>
            <h3 className="text-2xl font-bold text-white mb-2">Nenhum grupo encontrado</h3>
            <p className="text-slate-400">Seja o primeiro a criar um grupo!</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700 hover:border-purple-500/50 transition-all hover:scale-105 cursor-pointer shadow-lg"
              >
                {/* Header do Card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                      {group.tag}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{group.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-1 rounded ${
                          group.isPublic
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {group.isPublic ? '🌍 Público' : '🔒 Privado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Descrição */}
                <p className="text-slate-400 text-sm mb-4 line-clamp-2 min-h-[40px]">
                  {group.description || 'Sem descrição'}
                </p>

                {/* Estatísticas */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="text-slate-400 text-xs mb-1">Membros</div>
                    <div className="text-white font-bold text-lg">
                      {group.memberCount || 0}/{group.maxMembers}
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="text-slate-400 text-xs mb-1">Pontuação</div>
                    <div className="text-yellow-400 font-bold text-lg">
                      {group.totalScore.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex gap-3">
                  <Link
                    to={`/groups/${group.id}`}
                    className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition-colors text-center"
                  >
                    Ver Detalhes
                  </Link>
                  <button
                    onClick={() => handleJoinGroup(group.id)}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:scale-105 transition-transform"
                  >
                    Entrar
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Criar Grupo */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 max-w-md w-full border border-purple-500/50 shadow-2xl"
          >
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="text-4xl">✨</span>
              Criar Novo Grupo
            </h2>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              {/* Nome do Grupo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Dragões Supremos"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none"
                  required
                />
              </div>

              {/* Tag do Grupo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Tag (2-6 caracteres)
                </label>
                <input
                  type="text"
                  value={formData.tag}
                  onChange={(e) => setFormData({ ...formData, tag: e.target.value.toUpperCase() })}
                  placeholder="Ex: DRAG"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white uppercase focus:border-purple-500 focus:outline-none"
                  required
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Descrição (opcional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva seu grupo..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:outline-none resize-none"
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Tipo do Grupo
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isPublic: true })}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      formData.isPublic
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-900 text-slate-400 border border-slate-700'
                    }`}
                  >
                    🌍 Público
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isPublic: false })}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      !formData.isPublic
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-900 text-slate-400 border border-slate-700'
                    }`}
                  >
                    🔒 Privado
                  </button>
                </div>
              </div>

              {/* Erro */}
              {formError && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormError('');
                    setFormData({ name: '', tag: '', description: '', isPublic: true });
                  }}
                  className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:scale-105 transition-transform"
                >
                  Criar Grupo
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
