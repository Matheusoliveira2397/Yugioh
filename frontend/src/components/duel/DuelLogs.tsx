import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface DuelLog {
  id: string;
  username: string;
  actionType: string;
  message: string;
  createdAt: Date;
}

interface DuelLogsProps {
  logs: DuelLog[];
}

const DuelLogs: React.FC<DuelLogsProps> = ({ logs }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'DRAW_CARD':
        return 'text-blue-400';
      case 'SUMMON_MONSTER':
        return 'text-red-400';
      case 'ATTACK':
        return 'text-orange-400';
      case 'ACTIVATE_SPELL':
        return 'text-green-400';
      case 'END_TURN':
        return 'text-purple-400';
      case 'LIFE_CHANGE':
        return 'text-yellow-400';
      case 'DUEL_START':
        return 'text-cyan-400';
      case 'DUEL_END':
        return 'text-pink-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl border-2 border-purple-500/40 shadow-lg shadow-purple-500/10 p-3 h-[320px] flex flex-col">
      <h3 className="text-sm font-bold text-purple-400 mb-2 pb-2 border-b border-purple-500/30 tracking-wide">
        LOG DE AÇÕES
      </h3>
      
      <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-slate-800">
        {logs.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-800/50 rounded border border-slate-700/50 border-l-2 border-l-purple-500 p-2"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold ${getActionColor(log.actionType)}`}>
                {log.actionType.replace('_', ' ')}
              </span>
              <span className="text-slate-500 text-[9px]">
                {new Date(log.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-slate-200 text-xs">{log.message}</div>
          </motion.div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default DuelLogs;
