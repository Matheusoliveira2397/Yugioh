import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface DuelLog {
  id: string;
  username?: string;
  actionType: string;
  message: string;
  createdAt: Date | string;
  /** Para ações privadas: mensagem genérica para o oponente (ex.: "Oponente comprou 1 carta") */
  genericMessage?: string;
  /** userId de quem fez a ação; se for !== currentUserId, mostrar genericMessage */
  forUserId?: number;
}

interface DuelLogsProps {
  logs: DuelLog[];
  hideHeader?: boolean;
  /** ID do usuário atual: usado para mostrar mensagem completa só para quem fez a ação */
  currentUserId?: number | null;
}

const DuelLogs: React.FC<DuelLogsProps> = ({ logs, hideHeader, currentUserId }) => {
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const el = logsContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'DRAW_CARD':
        return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', icon: '🎴' };
      case 'SUMMON_MONSTER':
        return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', icon: '👹' };
      case 'SET_MONSTER':
        return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', icon: '🛡️' };
      case 'ATTACK':
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-300', icon: '⚔️' };
      case 'ACTIVATE_SPELL':
        return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-300', icon: '✨' };
      case 'ACTIVATE_TRAP':
        return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', icon: '🕳️' };
      case 'END_TURN':
        return { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-300', icon: '⏭️' };
      case 'LIFE_CHANGE':
        return { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-300', icon: '❤️' };
      case 'DUEL_START':
        return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-300', icon: '🎮' };
      case 'DUEL_END':
        return { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', icon: '🏁' };
      case 'PHASE_CHANGE':
        return { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-300', icon: '🔄' };
      default:
        return { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-300', icon: '📝' };
    }
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 backdrop-blur-md rounded-xl border border-slate-700/30 shadow-2xl overflow-hidden flex flex-col"
      style={{ height: '400px' }}
    >
      {!hideHeader && (
        <div className="bg-gradient-to-r from-slate-700/20 to-slate-800/20 px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <h3 className="text-sm font-bold text-white tracking-wide">Log de Ações</h3>
            {logs.length > 0 && (
              <span className="bg-purple-500/10 text-purple-300 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                {logs.length}
              </span>
            )}
          </div>
        </div>
      )}

      <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                <p>Nenhuma ação registrada</p>
                <p className="text-[10px] mt-1">As ações do duelo aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const isPrivateForOther = log.forUserId != null && log.genericMessage && currentUserId != null && Number(log.forUserId) !== Number(currentUserId);
                  const displayMessage = isPrivateForOther ? log.genericMessage! : log.message;
                  const displayUsername = isPrivateForOther ? 'Oponente' : log.username;
                  const colors = getActionColor(log.actionType);
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className={`${colors.bg} rounded-lg border-l-4 ${colors.border} pl-3 pr-2 py-2 hover:opacity-80 transition-all group`}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm">{colors.icon}</span>
                        <span className={`${colors.text} text-[10px] font-bold uppercase tracking-wide`}>
                          {formatActionType(log.actionType)}
                        </span>
                        {displayUsername && (
                          <span className="text-slate-300 text-[10px] font-semibold">
                            • {displayUsername}
                          </span>
                        )}
                        <span className="text-slate-500 text-[9px] ml-auto">
                          {log.createdAt ? new Date(log.createdAt).toLocaleTimeString('pt-BR', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            second: '2-digit'
                          }) : '--:--:--'}
                        </span>
                      </div>
                      <div className="text-slate-200 text-xs leading-relaxed break-words">
                        {displayMessage}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
      </div>
    </motion.div>
  );
};

export default DuelLogs;
