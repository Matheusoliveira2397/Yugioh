import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ModerationFeedbackPanel from '../components/ModerationFeedbackPanel';

interface HelpSection {
  id: string;
  title: string;
  icon: string;
  content: string;
  items?: string[];
}

const helpSections: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Como Começar',
    icon: '🚀',
    content: 'Bem-vindo ao jogo! Aqui está um guia rápido para começar:',
    items: [
      'Crie sua conta e faça login',
      'Complete o tutorial para aprender o básico',
      'Construa seu primeiro deck com as cartas iniciais',
      'Participe de duelos para ganhar experiência e cartas',
      'Explore a loja para comprar novas cartas',
    ],
  },
  {
    id: 'duels',
    title: 'Sistema de Duelos',
    icon: '⚔️',
    content: 'Aprenda como funcionam os duelos no jogo:',
    items: [
      'Duelo Aleatório: Encontre oponentes aleatórios para duelar',
      'Arena de Desafios: Participe de arenas com horários específicos',
      'Torneios: Compita em torneios para ganhar prêmios',
      'Desafios: Desafie outros jogadores diretamente',
      'Cada vitória concede score e experiência',
    ],
  },
  {
    id: 'deck-building',
    title: 'Construção de Decks',
    icon: '🃏',
    content: 'Dicas para construir decks poderosos:',
    items: [
      'Um deck deve ter entre 40 e 60 cartas',
      'Balanceie entre monstros, magias e armadilhas',
      'Considere a sinergia entre suas cartas',
      'Teste diferentes estratégias',
      'Ajuste seu deck baseado nas partidas',
    ],
  },
  {
    id: 'economy',
    title: 'Sistema Econômico',
    icon: '💰',
    content: 'Entenda as moedas do jogo:',
    items: [
      'Créditos: Moeda gratuita obtida jogando',
      'Cash: Moeda premium comprada com dinheiro real',
      'Você pode comprar créditos na página de Créditos',
      'Use créditos ou cash para comprar cartas na loja',
      'Ganhe créditos participando de duelos e completando missões',
    ],
  },
  {
    id: 'ranking',
    title: 'Sistema de Ranking',
    icon: '🏆',
    content: 'Como funciona o sistema de ranking:',
    items: [
      'Ganhe score vencendo duelos',
      'Suba de nível conforme ganha experiência',
      'Alcance divisões mais altas (Bronze, Silver, Gold, etc.)',
      'Participe de seasons para competir por prêmios',
      'Veja seu ranking na página de Rankings',
    ],
  },
  {
    id: 'clans',
    title: 'Sistema de Clãs',
    icon: '⚔️',
    content: 'Junte-se a um clã e jogue em equipe:',
    items: [
      'Crie ou entre em um clã',
      'Contribua com score para o clã',
      'Participe de competições entre clãs',
      'Ganhe recompensas exclusivas',
      'Interaja com outros membros do clã',
    ],
  },
  {
    id: 'missions',
    title: 'Missões e Recompensas',
    icon: '📋',
    content: 'Complete missões para ganhar recompensas:',
    items: [
      'Missões diárias renovam todos os dias',
      'Missões semanais oferecem recompensas maiores',
      'Complete missões para ganhar créditos e experiência',
      'Algumas missões oferecem cartas raras',
      'Verifique suas missões na página de Missões',
    ],
  },
  {
    id: 'tips',
    title: 'Dicas e Truques',
    icon: '💡',
    content: 'Dicas para melhorar seu jogo:',
    items: [
      'Leia os efeitos das cartas cuidadosamente',
      'Aprenda a timing correto para usar magias e armadilhas',
      'Estude os decks dos oponentes para aprender novas estratégias',
      'Participe de arenas e torneios para ganhar recompensas',
      'Mantenha seu deck atualizado com novas cartas',
    ],
  },
];

export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [mainTab, setMainTab] = useState<'guide' | 'moderation'>(() =>
    tabParam === 'moderation' ? 'moderation' : 'guide'
  );
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam === 'moderation') setMainTab('moderation');
  }, [tabParam]);

  const setTab = (next: 'guide' | 'moderation') => {
    setMainTab(next);
    if (next === 'moderation') {
      setSearchParams({ tab: 'moderation' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            ❓ Central de Ajuda
          </h1>
          <p className="text-gray-400 text-lg">
            Guia do jogo e canal direto com a moderação
          </p>
        </div>

        {/* Abas: guia vs moderação */}
        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 max-w-xl mx-auto">
          <button
            type="button"
            onClick={() => setTab('guide')}
            className={`px-5 py-3 rounded-xl font-bold text-sm sm:text-base transition-all ${
              mainTab === 'guide'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg ring-2 ring-white/20'
                : 'bg-slate-800/60 text-slate-300 border border-slate-600/50 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            📚 Guia e dúvidas frequentes
          </button>
          <button
            type="button"
            onClick={() => setTab('moderation')}
            className={`px-5 py-3 rounded-xl font-bold text-sm sm:text-base transition-all ${
              mainTab === 'moderation'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg ring-2 ring-white/20'
                : 'bg-slate-800/60 text-slate-300 border border-slate-600/50 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            📬 Mensagem à moderação
          </button>
        </div>

        {mainTab === 'moderation' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto"
          >
            <p className="text-slate-400 text-center mb-6 text-sm sm:text-base">
              Envie dúvidas, denúncias ou sugestões. Apenas a equipe (Master/Admin) visualiza estas mensagens.
            </p>
            <ModerationFeedbackPanel />
          </motion.div>
        )}

        {mainTab === 'guide' && (
        <>
        {/* Seções de Ajuda */}
        <div className="space-y-4">
          {helpSections.map((section, index) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full p-6 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{section.icon}</span>
                  <div className="text-left">
                    <h3 className="text-xl font-bold text-white">{section.title}</h3>
                    <p className="text-gray-400 text-sm">{section.content}</p>
                  </div>
                </div>
                <span className="text-2xl text-gray-400">
                  {expandedSection === section.id ? '▲' : '▼'}
                </span>
              </button>

              {expandedSection === section.id && section.items && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-6"
                >
                  <ul className="space-y-2 mt-4">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="text-gray-300 flex items-start gap-2">
                        <span className="text-yellow-400 mt-1">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Contato */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl p-6 border border-blue-500/30 text-center"
        >
          <h2 className="text-2xl font-bold text-white mb-4">📧 Precisa de Mais Ajuda?</h2>
          <p className="text-gray-300 mb-4">
            Se você não encontrou a resposta que procurava, use a aba <strong className="text-white">Mensagem à moderação</strong> acima.
          </p>
          <button
            type="button"
            onClick={() => setTab('moderation')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors"
          >
            📬 Abrir painel da moderação
          </button>
          <p className="text-gray-400 text-sm mt-4">
            Você também pode entrar em contato pelas redes sociais ou pelo chat do jogo.
          </p>
        </motion.div>
        </>
        )}
      </motion.div>
    </div>
  );
}

