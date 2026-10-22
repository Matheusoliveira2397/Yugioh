import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import DuelChat from '../components/duel/DuelChat';
import DuelLogs from '../components/duel/DuelLogs';
import DuelField from '../components/duel/DuelField';
import {
  DUEL_HAND_CARD_WIDTH_MULTIPLIER,
  DUEL_FIELD_MOBILE_CARD_VISUAL_MULT,
  DUEL_FIELD_DESKTOP_CARD_VISUAL_MULT,
} from '../constants/duelLayout';
import CardImage from '../components/CardImage';
import { getAllCardImagePaths, CARD_IMAGE_GRID_PROPS } from '../utils/cardImage';
import { getCardDescription } from '../utils/cardDescription';
import {
  getProfileImageUrl,
  DEFAULT_PROFILE_IMAGE_PATH,
  getCosmeticImageUrl,
  getDefaultSkinCardImageUrl,
  getCardImageDisplayUrl,
} from '../utils/imageUrl';
import TributeSelectionModal from '../components/duel/TributeSelectionModal';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';
import { getSpellActivationLpCost } from '../utils/spellActivationLpCost';
import { countMonstersEligibleForEquipSpell, isSpellEquipCard } from '../utils/equipSpell';
import { requestActiveDuelRefresh } from '../utils/activeDuelRefresh';

/** IDs no duelo podem ser UUID (string) ou número — nunca usar parseInt em UUID. */
function duelIdsEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  return String(a).trim() === String(b).trim();
}

/** Fase do duelo vinda do servidor pode variar em casing — necessário para EP vs botão Finalizar turno. */
function normalizeDuelPhase(phase: string | undefined | null): string {
  return String(phase ?? '')
    .trim()
    .toUpperCase();
}

/** Normaliza fim de duelo: winnerId pode faltar no WebSocket mas result traz PLAYER1_WIN / PLAYER2_WIN. */
function buildDuelEndedScreenState(data: any): {
  status: string;
  result?: string;
  winnerId: number | null;
  message: string;
  player1LifePoints?: number;
  player2LifePoints?: number;
  player1?: any;
  player2?: any;
  player1Id?: number;
  player2Id?: number;
  turnCounter?: number;
  currentTurn?: number;
  duelTime?: number;
} | null {
  if (!data || data.status !== 'FINISHED') return null;

  const p1 =
    data.player1Id != null && data.player1Id !== ''
      ? Number(data.player1Id)
      : null;
  const p2 =
    data.player2Id != null && data.player2Id !== ''
      ? Number(data.player2Id)
      : null;
  const badId = (n: number | null) => n == null || Number.isNaN(n);

  let winnerId: number | null =
    data.winnerId != null && data.winnerId !== ''
      ? Number(data.winnerId)
      : null;
  if (Number.isNaN(winnerId as number)) winnerId = null;

  const r = data.result as string | undefined;
  if (r === 'PLAYER1_WIN' && !badId(p1)) winnerId = p1 as number;
  if (r === 'PLAYER2_WIN' && !badId(p2)) winnerId = p2 as number;

  let result = r;
  if (!result && winnerId != null && !badId(p1) && !badId(p2)) {
    if (winnerId === p1) result = 'PLAYER1_WIN';
    else if (winnerId === p2) result = 'PLAYER2_WIN';
  }

  if (result === 'DRAW' || result === 'CANCELLED') {
    return {
      status: 'FINISHED',
      result,
      winnerId: winnerId ?? null,
      message:
        result === 'DRAW'
          ? 'Duelo encerrado em empate!'
          : (typeof data.message === 'string' && data.message.trim()) || 'Duelo encerrado.',
      player1LifePoints: data.player1LifePoints,
      player2LifePoints: data.player2LifePoints,
      player1: data.player1,
      player2: data.player2,
      player1Id: p1 ?? undefined,
      player2Id: p2 ?? undefined,
      turnCounter: data.turnCounter || 0,
      currentTurn: data.currentTurn,
      duelTime: data.duelTime || 0,
    };
  }

  if (winnerId != null && !badId(p1) && !badId(p2)) {
    const winnerName =
      winnerId === p1
        ? data.player1?.nickname || 'Jogador 1'
        : data.player2?.nickname || 'Jogador 2';
    return {
      status: 'FINISHED',
      result: result || (winnerId === p1 ? 'PLAYER1_WIN' : 'PLAYER2_WIN'),
      winnerId,
      message:
        data.message && String(data.message).trim()
          ? data.message
          : `Duelo encerrado! ${winnerName} venceu!`,
      player1LifePoints: data.player1LifePoints,
      player2LifePoints: data.player2LifePoints,
      player1: data.player1,
      player2: data.player2,
      player1Id: p1 ?? undefined,
      player2Id: p2 ?? undefined,
      turnCounter: data.turnCounter || 0,
      currentTurn: data.currentTurn,
      duelTime: data.duelTime || 0,
    };
  }

  return null;
}

type DuelEndedOverlayPayload = {
  status: string;
  result?: string;
  winnerId?: number | null;
  message: string;
  player1LifePoints?: number;
  player2LifePoints?: number;
  player1?: any;
  player2?: any;
  player1Id?: number;
  player2Id?: number;
  turnCounter?: number;
  currentTurn?: number;
  duelTime?: number;
};

function DuelEndedOverlay({
  duelEndedData,
  user,
}: {
  duelEndedData: DuelEndedOverlayPayload;
  user: { id: string | number; clanTag?: string };
}) {
  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  let winnerId =
    duelEndedData.winnerId !== null && duelEndedData.winnerId !== undefined
      ? typeof duelEndedData.winnerId === 'string'
        ? parseInt(duelEndedData.winnerId, 10)
        : Number(duelEndedData.winnerId)
      : null;
  if (Number.isNaN(winnerId as number)) winnerId = null;
  const player1Id =
    duelEndedData.player1Id !== null && duelEndedData.player1Id !== undefined
      ? typeof duelEndedData.player1Id === 'string'
        ? parseInt(duelEndedData.player1Id, 10)
        : Number(duelEndedData.player1Id)
      : null;
  const player2Id =
    duelEndedData.player2Id !== null && duelEndedData.player2Id !== undefined
      ? typeof duelEndedData.player2Id === 'string'
        ? parseInt(duelEndedData.player2Id, 10)
        : Number(duelEndedData.player2Id)
      : null;

  if (winnerId == null && duelEndedData.result === 'PLAYER1_WIN' && player1Id != null && !Number.isNaN(player1Id)) {
    winnerId = player1Id;
  }
  if (winnerId == null && duelEndedData.result === 'PLAYER2_WIN' && player2Id != null && !Number.isNaN(player2Id)) {
    winnerId = player2Id;
  }

  const isPlayer1 = player1Id !== null && player1Id === userId;
  const isDraw = duelEndedData.result === 'DRAW';
  const isWinner = winnerId !== null && !Number.isNaN(winnerId) && winnerId === userId;

  const myPlayer = isPlayer1 ? duelEndedData.player1 : duelEndedData.player2;
  const opponentPlayer = isPlayer1 ? duelEndedData.player2 : duelEndedData.player1;

  const myLifePoints = isPlayer1 ? duelEndedData.player1LifePoints || 0 : duelEndedData.player2LifePoints || 0;
  const opponentLifePoints = isPlayer1 ? duelEndedData.player2LifePoints || 0 : duelEndedData.player1LifePoints || 0;

  const winnerLifePoints =
    winnerId === player1Id ? duelEndedData.player1LifePoints || 0 : duelEndedData.player2LifePoints || 0;
  const isPerfect = isWinner && winnerLifePoints >= 8000;

  const totalTurns = duelEndedData.turnCounter || 0;
  const duelDuration = duelEndedData.duelTime || 0;
  const minutes = Math.floor(duelDuration / 60);
  const seconds = duelDuration % 60;

  const getWinReason = () => {
    if (isDraw) return 'Empate';
    if (isWinner) {
      if (opponentLifePoints <= 0) return 'LP do oponente zeraram';
      return 'Vitória';
    }
    if (myLifePoints <= 0) return 'LP chegaram a 0';
    if (myLifePoints > 0 && opponentLifePoints > 0) return 'Sem cartas no deck';
    return 'Derrota';
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-auto overflow-hidden p-2 sm:p-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Desfoca o campo do duelo atrás; mantém leitura do modal */}
      <div
        className="absolute inset-0 duel-modal-scrim"
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className={`relative z-10 w-full max-w-[min(100%,22rem)] sm:max-w-md rounded-2xl border-2 sm:border-[3px] shadow-2xl px-4 py-3 sm:px-5 sm:py-4 pointer-events-auto max-h-[min(100dvh-1rem,100svh-1rem)] overflow-hidden flex flex-col ${
          isWinner
            ? 'bg-gradient-to-br from-yellow-900/92 via-yellow-950/88 to-yellow-900/92 border-yellow-400/90'
            : isDraw
              ? 'bg-gradient-to-br from-gray-900/92 via-slate-950/88 to-gray-900/92 border-gray-400/90'
              : 'bg-gradient-to-br from-red-900/92 via-red-950/88 to-red-900/92 border-red-400/90'
        }`}
      >
        <div className="text-center flex flex-col min-h-0 min-w-0">
          <h2
            className={`text-xl sm:text-2xl font-display font-bold mb-2 shrink-0 ${
              isWinner ? 'text-champion-gold' : isDraw ? 'text-gray-300' : 'text-champion-crimson'
            }`}
          >
            {isWinner ? '🏆 WINNER' : isDraw ? '🤝 EMPATE' : '❌ DERROTA'}
          </h2>

          <div className="mb-2 shrink-0">
            <div className="relative inline-block">
              <div
                className={`absolute inset-0 rounded-full blur-lg opacity-40 scale-110 ${
                  isWinner ? 'bg-yellow-500' : isDraw ? 'bg-gray-500' : 'bg-red-500'
                }`}
              />
              <img
                src={getProfileImageUrl(myPlayer?.profileImage)}
                alt={myPlayer?.nickname}
                className="relative w-[4.5rem] h-[4.5rem] sm:w-24 sm:h-24 rounded-full border-[3px] border-white shadow-lg object-cover mx-auto"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                }}
              />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white mt-1.5 mb-0 line-clamp-2 px-1">
              {myPlayer?.clanTag ? `|${myPlayer.clanTag}| ` : ''}
              {myPlayer?.nickname || 'Jogador'}
            </h3>
            <p
              className={`text-sm sm:text-base font-bold ${
                isWinner ? 'text-yellow-400' : isDraw ? 'text-gray-400' : 'text-red-400'
              }`}
            >
              {isWinner ? 'VITÓRIA' : isDraw ? 'EMPATE' : 'DERROTA'}
            </p>
            {isPerfect && (
              <p className="text-sm sm:text-base font-bold text-yellow-300 mt-0.5 animate-pulse">✨ PERFECT ✨</p>
            )}
          </div>

          <div className="mb-2 shrink-0">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">vs</p>
            <div className="flex flex-col items-center gap-0.5">
              <img
                src={getProfileImageUrl(opponentPlayer?.profileImage)}
                alt={opponentPlayer?.nickname || 'Oponente'}
                className="w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full border-2 border-white/40 shadow-md object-cover"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                }}
              />
              <p className="text-xs sm:text-sm font-bold text-white line-clamp-2 px-1 max-w-full">
                {opponentPlayer?.clanTag ? `|${opponentPlayer.clanTag}| ` : ''}
                {opponentPlayer?.nickname || 'Oponente'}
              </p>
            </div>
          </div>

          <div className="bg-black/35 rounded-lg p-2.5 sm:p-3 mb-2 space-y-1.5 text-left shrink-0">
            <div className="flex justify-between items-center gap-2 text-[11px] sm:text-xs">
              <span className="text-gray-400 shrink-0">Turnos</span>
              <span className="text-white font-bold tabular-nums">{totalTurns}</span>
            </div>
            <div className="flex justify-between items-center gap-2 text-[11px] sm:text-xs">
              <span className="text-gray-400 shrink-0">Duração</span>
              <span className="text-white font-bold tabular-nums">
                {minutes > 0 ? `${minutes}m ` : ''}
                {seconds}s
              </span>
            </div>
            <div className="flex justify-between items-start gap-2 text-[11px] sm:text-xs">
              <span className="text-gray-400 shrink-0 pt-0.5">Motivo</span>
              <span className="text-white font-semibold text-right leading-snug">{getWinReason()}</span>
            </div>
            {isWinner && (
              <div className="flex justify-between items-center gap-2 pt-1.5 border-t border-white/10 text-[11px] sm:text-xs">
                <span className="text-gray-400 shrink-0">Recompensa</span>
                <span className="text-yellow-400 font-bold text-right">+300 Gold · +1.7 Score</span>
              </div>
            )}
          </div>

          <p className="text-[9px] sm:text-[10px] text-gray-500 mb-2 shrink-0 leading-tight px-0.5">
            {new Date().toLocaleString('pt-BR')}
          </p>

          <div className="flex gap-2 justify-center flex-wrap shrink-0 mt-auto">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/random-duel';
              }}
              className="btn-champion px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-bold"
            >
              🎮 Novamente
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="btn-secondary px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-bold"
            >
              Sair
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface DuelData {
  id: string;
  player1: any;
  player2: any;
  player1Id?: number | null;
  player2Id?: number | null;
  turnCounter?: number;
  duelTime?: number;
  createdAt?: string | Date;
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  currentPhase?: string;
  status: string;
  turnTime?: number; // Tempo do turno em segundos (limite)
  turnTimeRemaining?: number; // Tempo restante calculado pelo backend
  turnStartedAt?: string | Date; // Timestamp de quando o turno começou
  player1Field?: {
    deck: any[];
    hand: any[];
    graveyard: any[];
    monsters?: any[];
    electromagneticTurtleUsedThisDuel?: boolean;
  };
  player2Field?: {
    deck: any[];
    hand: any[];
    graveyard: any[];
    monsters?: any[];
    electromagneticTurtleUsedThisDuel?: boolean;
  };
}

/**
 * Antes a arena persistia escala/tamanho em sessionStorage (chave global ao origin).
 * Isso fazia uma conta abrir “pequena” e outra “grande” no mesmo monitor: o último zoom
 * salvo (outro login, janela menor, sidebar) era reidratado. Sempre começar em escala 1
 * e deixar o ResizeObserver calcular o máximo que cabe no viewport.
 */
function loadPersistedArenaLayout(): {
  scale: number;
  size: { w: number; h: number } | null;
} {
  if (typeof window === 'undefined') return { scale: 1, size: null };
  return { scale: 1, size: null };
}

const DuelArena: React.FC = () => {
  const { duelId } = useParams();
  const { user } = useAuthStore();
  const { duelFound, chatMessages, duelLogs, currentTurn, duelUpdate, sendChatMessage, joinDuelRoom, performAction, getSocket, isConnected } = useSocket();
  const joinDuelRoomRef = useRef(joinDuelRoom);
  joinDuelRoomRef.current = joinDuelRoom;
  
  // Log inicial removido para evitar spam no console
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** WebSocket caiu: overlay “Carregando duelo” sobre a arena (não usa `loading` para não desmontar o layout). */
  const [wsDisconnectedUi, setWsDisconnectedUi] = useState(false);

  // Se o handler `connect` do socket não disparar join (ref nulo, etc.), o hook ainda marca isConnected — força novo join.
  useEffect(() => {
    if (!wsDisconnectedUi || !isConnected || !duelId || !user?.id) return;
    const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
    const numericUserId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    joinDuelRoomRef.current(duelIdStr, numericUserId);
    const t = window.setTimeout(() => joinDuelRoomRef.current(duelIdStr, numericUserId), 450);
    return () => clearTimeout(t);
  }, [wsDisconnectedUi, isConnected, duelId, user?.id]);
  
  const [myLifePoints, setMyLifePoints] = useState(8000);
  const [opponentLifePoints, setOpponentLifePoints] = useState(8000);
  
  // Estados para animação de dano
  const [, setMyDamage] = useState<number | null>(null);
  const [, setOpponentDamage] = useState<number | null>(null);
  const previousMyLifePoints = useRef(8000);
  const previousOpponentLifePoints = useRef(8000);
  
  // Estados para animação de ataque
  const [attackAnimation, setAttackAnimation] = useState<{
    attackerCard: any;
    targetCard: any | null; // null se for ataque direto
    damage: number;
    isDirectAttack: boolean;
    isMyAttack: boolean; // true se eu estou atacando, false se estou recebendo
    targetProfileImage?: string; // Imagem de perfil do duelista alvo (para ataque direto)
  } | null>(null);

  // Estado para animação de carta saindo da mão para o campo
  const [cardPlacementAnimation, setCardPlacementAnimation] = useState<{
    card: any;
    fromPosition: { x: number; y: number; width: number; height: number };
    toPosition: { x: number; y: number; width: number; height: number };
  } | null>(null);
  
  // Refs para rastrear cartas antes do ataque
  const previousOpponentMonstersRef = useRef<any[]>(Array(5).fill(null));
  
  // Ref para o container do campo de duelo (para centralizar a animação)
  const duelFieldContainerRef = useRef<HTMLDivElement>(null);
  /** Playmats + barra de fases + mão — tudo no mesmo bloco com transform scale para caber na tela */
  const arenaContentRef = useRef<HTMLDivElement>(null);
  /** Só playmats (sem mão): a mão tem overflow-x-auto e inflava scrollWidth do bloco inteiro → escala caía após F5 */
  const arenaScaleWidthMeasureRef = useRef<HTMLDivElement>(null);
  /** Viewport que centraliza o bloco escalado (altura = coluna central do duelo) */
  const arenaPlaymatViewportRef = useRef<HTMLDivElement>(null);
  /** Linha principal: sidebars + coluna da arena (ResizeObserver garante recalcular em qualquer viewport) */
  const duelLayoutRowRef = useRef<HTMLDivElement>(null);
  /** Raiz da página do duelo (100dvh): observar aqui garante reescala quando só o viewport/dvh muda e filhos não disparam RO */
  const duelArenaRootRef = useRef<HTMLDivElement>(null);
  const duelBottomChromeRef = useRef<HTMLDivElement>(null);
  /** Maior scrollWidth/scrollHeight já visto neste duelo — evita escala “pular” quando a mão/campo encolhem */
  const arenaMaxContentDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const initialArenaPersist = useMemo(() => loadPersistedArenaLayout(), []);
  const [arenaScale, setArenaScale] = useState(initialArenaPersist.scale);
  const [arenaContentSize, setArenaContentSize] = useState<{ w: number; h: number } | null>(
    initialArenaPersist.size,
  );

  /** < lg: campo em tamanho real + scroll (responsivo). Desktop: scale só se precisar caber na coluna. */
  const [useScrollArenaLayout, setUseScrollArenaLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setUseScrollArenaLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /** Chave estável por duelo: quando o DOM da arena monta, o efeito de escala roda (evita `[]` com ref null no loading) */
  const arenaScaleMountKey = useMemo(() => {
    if (loading || !duelId || !duelData?.player1) return '';
    return `arena-scale-${duelId}-${String(duelData.player1.id ?? '')}`;
  }, [loading, duelId, duelData?.player1?.id]);

  // Arena: em telas estreitas não usar scale — scroll vertical/horizontal natural. Em lg+ encaixa com scale leve.
  useEffect(() => {
    if (!arenaScaleMountKey) return;
    arenaMaxContentDimsRef.current = { w: 0, h: 0 };
    if (useScrollArenaLayout) {
      setArenaScale(1);
      setArenaContentSize(null);
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let attachRaf = 0;
    let cancelled = false;
    let attachAttempts = 0;
    const MAX_ATTACH_FRAMES = 180;

    const updateScale = () => {
      const runMeasure = () => {
        const containerLive = duelFieldContainerRef.current;
        const content = arenaContentRef.current;
        if (!containerLive || !content || !content.isConnected) return;
        const viewport = arenaPlaymatViewportRef.current;
        /** Até ~6% maior que o “fit” quando ainda há folga no viewport (campo um pouco maior). */
        const ARENA_MAX_SCALE_UP = 1.1;
        const pad = 8;
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const vvW = vv?.width ?? window.innerWidth;
        const vvH = vv?.height ?? window.innerHeight;
        let cw: number;
        let availH: number;
        if (viewport && viewport.isConnected) {
          const cs = getComputedStyle(viewport);
          const pl = parseFloat(cs.paddingLeft) || 0;
          const pr = parseFloat(cs.paddingRight) || 0;
          const pt = parseFloat(cs.paddingTop) || 0;
          const pb = parseFloat(cs.paddingBottom) || 0;
          // Largura/altura só a partir do retângulo do viewport do playmat (estável ao rolar a página).
          // Antes: cap com getBoundingClientRect(container) + visualViewport — ao scrollar, cr.top mudava
          // e a escala “piscava” na mesma tela.
          cw = Math.max(1, Math.round(viewport.clientWidth - pl - pr));
          const innerH = Math.max(0, viewport.clientHeight - pt - pb - pad);
          availH = Math.max(72, Math.round(innerH));
          cw = Math.min(cw, Math.max(1, Math.round(vvW - 4)));
        } else {
          cw = Math.max(1, Math.min(Math.round(containerLive.clientWidth), Math.round(vvW - 4)));
          availH = Math.max(72, Math.round(containerLive.clientHeight - pad));
        }
        if (cw <= 0 || availH <= 0) return;
        // Largura: só o bloco dos playmats (exclui a fileira da mão). A mão usa overflow-x-auto; o scrollWidth
        // do arenaContentRef incluía toda a fileira → contentW absurdo → escala minúscula após atualizar.
        // Altura: offsetHeight de playmats + faixa inferior (fases + mão com altura fixa) — não scrollHeight
        // (evita campo “pulsar” quando a mão ganha/perde cartas ou overlays estouram layout).
        const widthEl = arenaScaleWidthMeasureRef.current;
        const chromeEl = duelBottomChromeRef.current;
        const rawW = Math.max(
          1,
          Math.ceil(widthEl?.isConnected ? widthEl.scrollWidth : content.scrollWidth),
        );
        const playmatH = widthEl?.isConnected ? widthEl.offsetHeight : 0;
        const chromeH = chromeEl?.isConnected ? chromeEl.offsetHeight : 0;
        const composedH = playmatH + chromeH;
        const rawH = Math.max(
          1,
          Math.ceil((composedH > 8 ? composedH : content.offsetHeight || content.scrollHeight) + 24),
        );
        const mx = arenaMaxContentDimsRef.current;
        // Cresce com o conteúdo; se encolher claramente (ex.: playmat sem aspect fixo), acompanha para a escala não ficar minúscula.
        const shrinkOk = 0.92;
        if (mx.w <= 0 || rawW >= mx.w * shrinkOk) mx.w = Math.max(mx.w, rawW);
        else mx.w = rawW;
        if (mx.h <= 0 || rawH >= mx.h * shrinkOk) mx.h = Math.max(mx.h, rawH);
        else mx.h = rawH;
        const contentW = mx.w;
        const contentH = mx.h;
        if (contentH <= 0 || contentW <= 0) return;
        // Desktop: margens pequenas — priorizar usar a tela, não encolher o campo demais
        const isShortScreen = vvH < 720;
        const insetX = isShortScreen ? 1 : 1;
        const insetY = isShortScreen ? 0.998 : 1;
        // Escala uniforme: mesmo fator em X e Y para caber inteiro no viewport sem scroll (letterbox/pillarbox se sobrar espaço).
        // Fator >1 usa melhor o viewport quando o campo caberia menor que 100% (playmat um pouco maior).
        // Coluna central mais larga (sidebars menores) + fator alto para slots/campo maiores.
        const playmatShrink = 1.78;
        const ratioW = (cw * insetX) / contentW;
        const ratioH = (availH * insetY) / contentH;
        const maxScaleByHeight = ratioH - 0.0005;
        const maxScaleByWidth = ratioW - 0.0005;
        const MIN_ARENA_SCALE = 0.2;
        const scaleFit = Math.min(ARENA_MAX_SCALE_UP, ratioW, ratioH);
        const scaleClamped = Math.min(
          ARENA_MAX_SCALE_UP,
          Math.max(MIN_ARENA_SCALE, scaleFit * playmatShrink),
        );
        // Passos de ~0,25% evitam troca de escala por ruído de subpixel / RO da mão.
        const floorScaled = Math.floor(scaleClamped * 400) / 400;
        /** Levemente maior que o “fit” estrito — em telas altas/largas o campo aproveita melhor o espaço. */
        const arenaScaleBoost = 1.035;
        let scaleRounded = Math.min(
          floorScaled,
          Math.max(MIN_ARENA_SCALE, maxScaleByHeight * arenaScaleBoost),
          Math.max(MIN_ARENA_SCALE, maxScaleByWidth * arenaScaleBoost),
        );
        scaleRounded = Math.floor(scaleRounded * 400) / 400;
        setArenaContentSize((prev) => {
          if (prev && prev.w === contentW && prev.h === contentH) return prev;
          return { w: contentW, h: contentH };
        });
        // Na mesma janela/viewport: só atualiza se mudança for relevante (responsivo entre telas, fixo no meio do jogo).
        const ARENA_SCALE_MIN_DELTA = 0.012;
        setArenaScale((prev) => (Math.abs(prev - scaleRounded) < ARENA_SCALE_MIN_DELTA ? prev : scaleRounded));
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(runMeasure);
      });
    };
    let firstScaleDebounce = true;
    const schedule = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (debounceTimer) clearTimeout(debounceTimer);
        const delayMs = firstScaleDebounce ? 0 : 160;
        firstScaleDebounce = false;
        debounceTimer = setTimeout(updateScale, delayMs);
      });
    };

    const onArenaVisibleRecalc = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    let ro: ResizeObserver | null = null;
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;

    const attachObservers = () => {
      const container = duelFieldContainerRef.current;
      if (!container || cancelled) return false;
      ro = new ResizeObserver(schedule);
      ro.observe(container);
      const rootEl = duelArenaRootRef.current;
      if (rootEl) ro.observe(rootEl);
      const layoutRow = duelLayoutRowRef.current;
      if (layoutRow) ro.observe(layoutRow);
      initTimer = setTimeout(() => {
        if (cancelled || !ro) return;
        const content = arenaContentRef.current;
        const chrome = duelBottomChromeRef.current;
        const vp = arenaPlaymatViewportRef.current;
        const row = duelLayoutRowRef.current;
        // Com height não fixo no conteúdo, RO aqui só reflete mudança real (mão/cartas), sem espiral de flex encolhendo.
        if (content) ro.observe(content);
        schedule();
        if (chrome) ro.observe(chrome);
        if (vp) ro.observe(vp);
        if (row) ro.observe(row);
      }, 120);
      return true;
    };

    const tryAttach = () => {
      if (cancelled) return;
      if (attachObservers()) {
        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
        document.addEventListener('visibilitychange', onArenaVisibleRecalc);
        window.addEventListener('pageshow', schedule);
        if (vv) {
          vv.addEventListener('resize', schedule);
          // Não escutar 'scroll' do visualViewport: não altera layout útil do duelo e gerava rescale ao pan/zoom.
        }
        schedule();
        return;
      }
      attachAttempts += 1;
      if (attachAttempts < MAX_ATTACH_FRAMES) {
        attachRaf = requestAnimationFrame(tryAttach);
      }
    };

    tryAttach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(attachRaf);
      ro?.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (initTimer) clearTimeout(initTimer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      document.removeEventListener('visibilitychange', onArenaVisibleRecalc);
      window.removeEventListener('pageshow', schedule);
      if (vv) {
        vv.removeEventListener('resize', schedule);
      }
    };
  }, [arenaScaleMountKey, useScrollArenaLayout]);

  // Helper: bônus de ATK da Banner of Courage — acumulativo (cada cópia face-up +200) durante a Fase de Batalha do dono
  const getBannerOfCourageBonus = (spellTraps: (any | null)[], isCurrentTurnPlayer: boolean): number => {
    if (currentPhase !== 'BATTLE' || !isCurrentTurnPlayer) return 0;
    const count = (spellTraps || []).filter((st: any) => {
      if (!st || st.position !== 'face-up') return false;
      const id = String(st.idCarta || st.id || st.cardId || '').toLowerCase();
      const name = String(st.name || st.cardName || '').toLowerCase();
      return id.includes('bannerofcourage') || name.includes('banner of courage');
    }).length;
    return count * 200;
  };

  // Animação de ataque: só após o backend emitir `attackSucceeded` (ataque negado por armadilha etc. = sem animação)
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>('DRAW');
  const [turnTimeLeft, setTurnTimeLeft] = useState(90); // Timer do turno
  const [turnTimer, setTurnTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeExpired, setTimeExpired] = useState(false); // Indica se o tempo do oponente expirou
  const [turnTimeLimit, setTurnTimeLimit] = useState(90); // Limite de tempo do turno (vem do banco)
  const [turnTimeRemainingFromServer, setTurnTimeRemainingFromServer] = useState<number | null>(null); // Tempo restante do servidor (fonte da verdade)
  const [turnStartedAt, setTurnStartedAt] = useState<Date | null>(null); // Timestamp de quando o turno começou
  const [duelTime, setDuelTime] = useState(0); // Tempo total do duelo em segundos
  const [duelStartTime, setDuelStartTime] = useState<number | null>(null); // Timestamp de quando o duelo começou
  
  // Refs para valores que precisamos no interval sem causar re-renders
  const isMyTurnRef = useRef(false);
  const duelIdRef = useRef<string | undefined>(duelId);
  const userIdRef = useRef<string | number | undefined>(user?.id);
  const turnStartedAtRef = useRef<Date | null>(null);
  const turnTimeLimitRef = useRef<number>(90);
  const duelDataRef = useRef<DuelData | null>(null);
  
  // Refs para estados dos modais (para acessar valores mais recentes nos listeners)
  const showOpponentHandRevealedRef = useRef(false);
  const showGracefulCharityModalRef = useRef(false);
  const cardEffectTypeRef = useRef<'forcefulSentry' | 'confiscation' | null>(null);
  
  // Sistema de mão e deck - carregados do backend
  const [myHand, setMyHand] = useState<any[]>([]);
  /** Largura das cartas da mão (px) — baseada na coluna do campo, ampliada para leitura/jogar melhor */
  const [handCardWidthPx, setHandCardWidthPx] = useState<number | null>(null);
  const handlePlayerFieldColumnWidth = useCallback((columnWidthPx: number) => {
    const boosted = Math.round(columnWidthPx * DUEL_HAND_CARD_WIDTH_MULTIPLIER * 100) / 100;
    setHandCardWidthPx(boosted);
  }, []);
  /** Altura da faixa da mão (cartas 59:86 + folga) — evita arena/playmat mudarem de escala com 0 vs N cartas */
  const handRowFixedHeightPx = useMemo(() => {
    if (handCardWidthPx != null && handCardWidthPx > 0) {
      const cardHeight = Math.ceil((handCardWidthPx * 86) / 59);
      return cardHeight + (useScrollArenaLayout ? 40 : 28);
    }
    return useScrollArenaLayout ? 260 : 220;
  }, [handCardWidthPx, useScrollArenaLayout]);

  /**
   * Controles da mão (invocar / ativar) ficam dentro de `arenaContentRef`.
   * No desktop o bloco recebe `transform: scale(arenaScale)` — contra-escala só nos botões.
   * No mobile (scroll layout) não reduzir: hit target precisa ficar tocável (~40px+).
   */
  const handActionOverlayScale = useMemo(() => {
    if (useScrollArenaLayout) return 1;
    const s = Math.max(0.22, Math.min(1.15, arenaScale));
    return Math.min(0.9, Math.max(0.45, 0.58 / s));
  }, [useScrollArenaLayout, arenaScale]);

  const [myDeck, setMyDeck] = useState<any[]>([]);
  const [myGraveyard, setMyGraveyard] = useState<any[]>([]);
  const [myExtraDeck, setMyExtraDeck] = useState<any[]>([]);
  const [myBanished, setMyBanished] = useState<any[]>([]);
  const [opponentHand, setOpponentHand] = useState<any[]>([]);
  
  // Estado para controle de ataque
  const [attackingMonsterIndex, setAttackingMonsterIndex] = useState<number | null>(null);
  const [opponentDeck, setOpponentDeck] = useState<any[]>([]);
  const [opponentGraveyard, setOpponentGraveyard] = useState<any[]>([]);
  const [opponentExtraDeck, setOpponentExtraDeck] = useState<any[]>([]);
  const [opponentBanished, setOpponentBanished] = useState<any[]>([]);
  
  // Estado para descarte de cartas
  const [, setSelectedCardsToDiscard] = useState<string[]>([]);
  const [isDiscarding, setIsDiscarding] = useState(false); // Evitar múltiplos cliques ao descartar
  
  // Estado para modal do cemitério
  const [showGraveyardModal, setShowGraveyardModal] = useState(false);
  const [showExtraDeckModal, setShowExtraDeckModal] = useState(false);
  const [showOpponentGraveyardModal, setShowOpponentGraveyardModal] = useState(false);
  const [showOpponentExtraDeckModal, setShowOpponentExtraDeckModal] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] = useState<'chat' | 'logs'>('chat');
  const closeMobileDrawer = () => {
    setMobileChatOpen(false);
  };
  
  // Estado para mostrar mão do oponente virada (The Forceful Sentry ou Confiscation)
  const [showOpponentHandRevealed, setShowOpponentHandRevealed] = useState(false);
  const [opponentHandRevealed, setOpponentHandRevealed] = useState<any[]>([]);
  const [cardEffectType, setCardEffectType] = useState<'forcefulSentry' | 'confiscation' | null>(null);
  
  // Estado para carta selecionada no modal do Confiscation
  const [selectedConfiscationCard] = useState<any | null>(null);
  
  // Estado para GracefulCharity
  const [showGracefulCharityModal, setShowGracefulCharityModal] = useState(false);
  const [gracefulCharityHand, setGracefulCharityHand] = useState<any[]>([]);
  const [selectedGracefulCharityCards, setSelectedGracefulCharityCards] = useState<string[]>([]);

  // Estado para MonsterReborn
  const [showMonsterRebornModal, setShowMonsterRebornModal] = useState(false);
  const [monsterRebornData, setMonsterRebornData] = useState<{
    playerGraveyard: any[];
    opponentGraveyard: any[];
  } | null>(null);
  // Usar identificadores únicos para MonsterReborn
  const [selectedMonsterReborn, setSelectedMonsterReborn] = useState<{
    graveyard: 'player' | 'opponent';
    index: number;
    instanceId?: string;
    graveyardIndex?: number;
  } | null>(null);
  
  // Estado para Premature Burial (só cemitério do jogador)
  const [showPrematureBurialModal, setShowPrematureBurialModal] = useState(false);
  const [prematureBurialGraveyard, setPrematureBurialGraveyard] = useState<any[]>([]);
  const [selectedPrematureBurialIndex, setSelectedPrematureBurialIndex] = useState<number | null>(null);
  
  // Estado para Autonomous Action Unit (escolher monstro do cemitério do oponente)
  const [showAutonomousActionUnitModal, setShowAutonomousActionUnitModal] = useState(false);
  const [autonomousActionUnitGraveyard, setAutonomousActionUnitGraveyard] = useState<any[]>([]);
  const [selectedAutonomousActionUnitIndex, setSelectedAutonomousActionUnitIndex] = useState<number | null>(null);
  
  // Estado para Monster Reincarnation
  const [showMonsterReincarnationDiscardModal, setShowMonsterReincarnationDiscardModal] = useState(false);
  const [monsterReincarnationHand, setMonsterReincarnationHand] = useState<any[]>([]);
  const [selectedMonsterReincarnationCard, setSelectedMonsterReincarnationCard] = useState<string | null>(null);
  const [showMonsterReincarnationGraveyardModal, setShowMonsterReincarnationGraveyardModal] = useState(false);
  const [showDmocEndPhaseModal, setShowDmocEndPhaseModal] = useState(false);
  const [dmocSpellOptions, setDmocSpellOptions] = useState<any[]>([]);
  const [selectedDmocSpellIndex, setSelectedDmocSpellIndex] = useState<number | null>(null);
  const [showMagiciansRodSearchModal, setShowMagiciansRodSearchModal] = useState(false);
  const [magiciansRodDeckOptions, setMagiciansRodDeckOptions] = useState<any[]>([]);
  const [selectedMagiciansRodDeckIndex, setSelectedMagiciansRodDeckIndex] = useState<number | null>(null);
  const [showMagiciansRodGyModal, setShowMagiciansRodGyModal] = useState(false);
  const [magiciansRodTributeOptions, setMagiciansRodTributeOptions] = useState<any[]>([]);
  const [selectedMagiciansRodTribute, setSelectedMagiciansRodTribute] = useState<number | null>(null);
  const [showBerfometSearchModal, setShowBerfometSearchModal] = useState(false);
  const [berfometDeckOptions, setBerfometDeckOptions] = useState<any[]>([]);
  const [selectedBerfometDeckIndex, setSelectedBerfometDeckIndex] = useState<number | null>(null);
  const [showMagiciansSalvationEternalSoulModal, setShowMagiciansSalvationEternalSoulModal] = useState(false);
  const [magiciansSalvationDeckOptions, setMagiciansSalvationDeckOptions] = useState<any[]>([]);
  const [selectedMagiciansSalvationDeckIndex, setSelectedMagiciansSalvationDeckIndex] = useState<number | null>(null);
  const [showMagiciansSalvationPairModal, setShowMagiciansSalvationPairModal] = useState(false);
  const [magiciansSalvationPairData, setMagiciansSalvationPairData] = useState<any | null>(null);
  const [showSkilledDarkMagicianModal, setShowSkilledDarkMagicianModal] = useState(false);
  const [skilledDarkMagicianOptions, setSkilledDarkMagicianOptions] = useState<any[]>([]);
  const [selectedSkilledDarkMagician, setSelectedSkilledDarkMagician] = useState<{
    source: string;
    index: number;
  } | null>(null);
  const [monsterReincarnationGraveyard, setMonsterReincarnationGraveyard] = useState<any[]>([]);
  const [selectedMonsterReincarnationMonster, setSelectedMonsterReincarnationMonster] = useState<number | null>(null);
  
  // Estado para ChaosSorcerer Special Summon
  const [showChaosSorcererModal, setShowChaosSorcererModal] = useState(false);
  const [chaosSorcererData, setChaosSorcererData] = useState<{
    cardId?: string;
    cardName?: string;
    lightMonsters: any[];
    darkMonsters: any[];
  } | null>(null);
  // Usar identificadores únicos (instanceId ou graveyardIndex) ao invés de apenas índice
  const [selectedLightMonster, setSelectedLightMonster] = useState<{ instanceId?: string; graveyardIndex?: number; arrayIndex: number } | null>(null);
  const [selectedDarkMonster, setSelectedDarkMonster] = useState<{ instanceId?: string; graveyardIndex?: number; arrayIndex: number } | null>(null);
  
  // Estado para efeito do ChaosSorcerer (banir monstro do oponente)
  const [isSelectingChaosSorcererTarget, setIsSelectingChaosSorcererTarget] = useState(false);
  const [chaosSorcererMonsterZoneIndex, setChaosSorcererMonsterZoneIndex] = useState<number | null>(null);
  
  // Debug: Monitorar quando o modal deveria abrir
  useEffect(() => {
    if (showChaosSorcererModal) {
      console.log(`🎯 [useEffect] Modal ChaosSorcerer ABERTO!`, {
        showChaosSorcererModal,
        chaosSorcererData,
        lightMonstersCount: chaosSorcererData?.lightMonsters?.length || 0,
        darkMonstersCount: chaosSorcererData?.darkMonsters?.length || 0,
      });
    }
  }, [showChaosSorcererModal, chaosSorcererData]);
  
  // Estado para Red-Eyes Darkness Metal Dragon Special Summon
  const [showRedEyesDarknessMetalDragonModal, setShowRedEyesDarknessMetalDragonModal] = useState(false);
  const [redEyesDarknessMetalDragonData, setRedEyesDarknessMetalDragonData] = useState<{
    cardId?: string;
    dragonMonsters: any[];
  } | null>(null);
  const [selectedDragonToBanish, setSelectedDragonToBanish] = useState<number | null>(null);
  
  // Estado para efeito do Red-Eyes Darkness Metal Dragon (invocar dragão da mão/cemitério)
  const [showRedEyesDarknessMetalDragonEffectModal, setShowRedEyesDarknessMetalDragonEffectModal] = useState(false);
  const [redEyesDarknessMetalDragonEffectData, setRedEyesDarknessMetalDragonEffectData] = useState<{
    monsterZoneIndex: number;
    dragonsInHand: any[];
    dragonsInGraveyard: any[];
  } | null>(null);
  const [selectedDragonSource, setSelectedDragonSource] = useState<'hand' | 'graveyard' | null>(null);
  const [selectedDragonIndex, setSelectedDragonIndex] = useState<number | null>(null);
  const [selectedDragonId, setSelectedDragonId] = useState<string | null>(null); // Para rastrear qual dragão foi selecionado (com source e index)
  
  // Estado para Cyber-Stein
  const [showCyberSteinModal, setShowCyberSteinModal] = useState(false);
  const [cyberSteinData, setCyberSteinData] = useState<{
    monsterZoneIndex: number;
    extraDeckMonsters: any[];
  } | null>(null);
  const [selectedCyberSteinMonster, setSelectedCyberSteinMonster] = useState<number | null>(null);
  
  // Estado para Dark Armed Dragon
  const [showDarkArmedDragonEffectModal, setShowDarkArmedDragonEffectModal] = useState(false);
  const [darkArmedDragonEffectData, setDarkArmedDragonEffectData] = useState<{
    monsterZoneIndex: number;
    darkMonsters: any[];
  } | null>(null);
  const [selectedDarkMonsterToBanish, setSelectedDarkMonsterToBanish] = useState<number | null>(null);
  const [selectedCardToDestroy, setSelectedCardToDestroy] = useState<{
    player: 'player' | 'opponent';
    type: 'monster' | 'spellTrap';
    zoneIndex: number;
  } | null>(null);
  
  // Estado para ChangeOfHeart
  const [showChangeOfHeartModal, setShowChangeOfHeartModal] = useState(false);
  const [changeOfHeartData, setChangeOfHeartData] = useState<{
    opponentMonsters: any[];
  } | null>(null);
  const [selectedChangeOfHeartMonster, setSelectedChangeOfHeartMonster] = useState<number | null>(null);
  
  // Estado para BrainControl
  const [showBrainControlModal, setShowBrainControlModal] = useState(false);
  const [brainControlData, setBrainControlData] = useState<{
    opponentMonsters: any[];
  } | null>(null);
  const [selectedBrainControlMonster, setSelectedBrainControlMonster] = useState<number | null>(null);
  
  // Estado para SoulTaker
  const [showSoulTakerModal, setShowSoulTakerModal] = useState(false);
  const [soulTakerData, setSoulTakerData] = useState<{
    opponentMonsters: any[];
  } | null>(null);
  const [selectedSoulTakerMonster, setSelectedSoulTakerMonster] = useState<number | null>(null);

  /** Modal unificado: Lightning Vortex, Trade-In, Dark Eruption, Stamping, Tribute, Ancient Rules, Silver's Cry, Shield Crush, Fissure (empate) */
  const [showPlayerTargetSpellModal, setShowPlayerTargetSpellModal] = useState(false);
  const [playerTargetSpellData, setPlayerTargetSpellData] = useState<any | null>(null);
  const [playerTargetSpellPick, setPlayerTargetSpellPick] = useState<any>(null);

  // Estado para Lightning Storm (escolher 1 efeito)
  const [showLightningStormModal, setShowLightningStormModal] = useState(false);
  
  // Estado para Chaos Sorcerer Effect
  const [showChaosSorcererEffectModal, setShowChaosSorcererEffectModal] = useState(false);
  const [chaosSorcererEffectData, setChaosSorcererEffectData] = useState<{
    availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>;
    monsterZoneIndex?: number;
  } | null>(null);
  const [selectedChaosSorcererEffectMonster, setSelectedChaosSorcererEffectMonster] = useState<{
    zoneIndex: number;
    player: 'player' | 'opponent';
  } | null>(null);
  
  // Estado para Black Luster Soldier - Envoy of the Beginning (efeito 1: banir monstro / efeito 2: segundo ataque se destruir)
  const [showBlsEffectModal, setShowBlsEffectModal] = useState(false);
  const [blsEffectData, setBlsEffectData] = useState<{
    availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>;
    monsterZoneIndex?: number;
  } | null>(null);
  const [blsEffectChoice, setBlsEffectChoice] = useState<1 | 2 | null>(null);
  const [selectedBlsEffectMonster, setSelectedBlsEffectMonster] = useState<{ zoneIndex: number; player: 'player' | 'opponent' } | null>(null);
  
  // Estado para Exiled Force
  const [showExiledForceModal, setShowExiledForceModal] = useState(false);
  const [exiledForceData, setExiledForceData] = useState<{
    availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>;
    monsterZoneIndex?: number;
  } | null>(null);
  const [selectedExiledForceMonster, setSelectedExiledForceMonster] = useState<{ zoneIndex: number; player: 'player' | 'opponent' } | null>(null);
  
  // Estado para UnitedWeStand
  const [showUnitedWeStandModal, setShowUnitedWeStandModal] = useState(false);
  const [unitedWeStandData, setUnitedWeStandData] = useState<{
    availableMonsters: any[];
  } | null>(null);
  const [selectedUnitedWeStandMonster, setSelectedUnitedWeStandMonster] = useState<number | null>(null);
  
  // Estado para MagePower
  const [showMagePowerModal, setShowMagePowerModal] = useState(false);
  const [magePowerData, setMagePowerData] = useState<{
    availableMonsters: any[];
  } | null>(null);
  const [selectedMagePowerMonster, setSelectedMagePowerMonster] = useState<number | null>(null);

  // Estado para Reinforcement Of The Army
  const [showReinforcementOfTheArmyModal, setShowReinforcementOfTheArmyModal] = useState(false);
  const [reinforcementOfTheArmyData, setReinforcementOfTheArmyData] = useState<{
    warriorMonsters: any[];
  } | null>(null);
  const [selectedReinforcementOfTheArmyMonster, setSelectedReinforcementOfTheArmyMonster] = useState<number | null>(null);
  
  // Estado para Last Will
  const [showLastWillModal, setShowLastWillModal] = useState(false);
  const [lastWillData, setLastWillData] = useState<{
    eligibleMonsters: any[];
  } | null>(null);
  const [selectedLastWillMonster, setSelectedLastWillMonster] = useState<number | null>(null);
  
  // Estado para Mystical Space Typhoon
  const [isSelectingMSTTarget, setIsSelectingMSTTarget] = useState(false);
  const [showMysticalSpaceTyphoonModal, setShowMysticalSpaceTyphoonModal] = useState(false);
  const [mysticalSpaceTyphoonData, setMysticalSpaceTyphoonData] = useState<{
    playerSpellTraps: Array<{ card: any; zoneIndex: number; player: 'player' | 'opponent' }>;
    opponentSpellTraps: Array<{ card: any; zoneIndex: number; player: 'player' | 'opponent' }>;
    spellTrapZoneIndex: number;
  } | null>(null);
  const [selectedMSTTarget, setSelectedMSTTarget] = useState<{ player: 'player' | 'opponent'; zoneIndex: number } | null>(null);
  const [isSelectingSnowmanEaterTarget, setIsSelectingSnowmanEaterTarget] = useState(false);
  
  // Estado para Breaker The Magical Warrior (modal de escolha de S/T)
  const [isSelectingBreakerTarget, setIsSelectingBreakerTarget] = useState(false);
  const [breakerMonsterZoneIndex, setBreakerMonsterZoneIndex] = useState<number | null>(null);
  const [selectedBreakerTarget, setSelectedBreakerTarget] = useState<{ player: 'player' | 'opponent'; zoneIndex: number } | null>(null);
  /** Snapshot das S/T ao abrir o modal (evita lista vazia por estado assíncrono) */
  const [breakerModalSpellTraps, setBreakerModalSpellTraps] = useState<{ my: (any | null)[]; opp: (any | null)[] } | null>(null);
  
  // Estado para rastrear pendingChoice
  const [currentPendingChoice, setCurrentPendingChoice] = useState<any | null>(null);
  
  // Estado para popup de duelo encerrado
  const [duelEndedData, setDuelEndedData] = useState<{ 
    status: string; 
    result?: string; 
    winnerId?: number | null; 
    message: string;
    player1LifePoints?: number;
    player2LifePoints?: number;
    player1?: any;
    player2?: any;
    player1Id?: number;
    player2Id?: number;
    turnCounter?: number;
    currentTurn?: number;
    duelTime?: number;
  } | null>(null);
  
  // Estado para controlar qual carta está selecionada para colocar no campo
  const [, setSelectedCardForField] = useState<any | null>(null);
  
  // Estado para controlar seleção de slot de spell/trap
  const [selectingSpellTrapSlot, setSelectingSpellTrapSlot] = useState<{ card: any; position: 'set' | 'face-up' } | null>(null);
  
  // Estado para controlar qual carta está com zoom
  const [zoomedCard, setZoomedCard] = useState<any | null>(null);
  
  // Estado para modal de informações da carta
  const [selectedCardInfo, setSelectedCardInfo] = useState<any | null>(null);
  
  // Estado para armazenar as cartas no campo (monstros)
  const [myMonsters, setMyMonsters] = useState<(any | null)[]>(Array(5).fill(null));
  const [opponentMonsters, setOpponentMonsters] = useState<(any | null)[]>(Array(5).fill(null));
  
  // Estado para armazenar as cartas no campo (spell/trap)
  const [mySpellTraps, setMySpellTraps] = useState<(any | null)[]>(Array(5).fill(null));
  const [opponentSpellTraps, setOpponentSpellTraps] = useState<(any | null)[]>(Array(5).fill(null));
  
  // Estado para Last Will - indica se um monstro foi destruído no campo do jogador neste turno
  const [monsterDestroyedThisTurn, setMonsterDestroyedThisTurn] = useState<boolean>(false);
  // Obelisk the Tormentor: turno em que o efeito foi usado (para 1x por turno)
  const [obeliskEffectUsedTurn, setObeliskEffectUsedTurn] = useState<number | undefined>(undefined);
  // Modal do efeito do Obelisk: escolher 2 monstros para sacrificar
  const [showObeliskEffectModal, setShowObeliskEffectModal] = useState(false);
  const [obeliskSelectedZones, setObeliskSelectedZones] = useState<number[]>([]);
  
  // Estado para rastrear se já fez invocação normal neste turno
  const [normalSummonUsed, setNormalSummonUsed] = useState(false);
  const [positionChangedThisTurn] = useState(false);
  const [myTurnCounter, setMyTurnCounter] = useState<number>(1); // Contador global de turnos do campo do jogador
  
  // Estado para modal de seleção de tributos
  const [showTributeModal, setShowTributeModal] = useState(false);
  const [tributeModalData, setTributeModalData] = useState<{
    card: any;
    position: 'attack' | 'defense' | 'set';
    requiredTributes: number;
    handIndex?: number;
  } | null>(null);

  // Estado para overlay de fase
  const [showPhaseOverlay, setShowPhaseOverlay] = useState(false);
  const [phaseOverlayText, setPhaseOverlayText] = useState('');
  const [phaseOverlaySubtext, setPhaseOverlaySubtext] = useState('');
  const previousPhaseRef = useRef<string>('');
  
  // Estado para overlay de invocação
  const [showSummonOverlay, setShowSummonOverlay] = useState(false);
  const [summonCardName, setSummonCardName] = useState('');
  /** Animação de invocação do Slifer no fundo do duelo (Animations/Slifer.gif) */
  const [showSliferAnimation, setShowSliferAnimation] = useState(false);
  const sliferAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMonstersRef = useRef<(any | null)[]>(Array(5).fill(null));

  useEffect(() => {
    return () => {
      if (sliferAnimationTimeoutRef.current) clearTimeout(sliferAnimationTimeoutRef.current);
    };
  }, []);

  // Estado para rastrear se já houve mudança de turno (para identificar primeiro turno)
  const [hasTurnChanged, setHasTurnChanged] = useState(false);
  const previousTurnRef = useRef<number | null>(null);
  // Evitar reabrir modal quando duelUpdate atrasado chega depois de choice_completed
  const justResolvedChoiceRef = useRef<{ type: string; at: number } | null>(null);

  // Bloquear nova ação (usar carta/invocar/efeito) enquanto uma invocação ou efeito ainda não foi concluído
  const hasActionInProgress = Boolean(
    currentPendingChoice != null ||
    showOpponentHandRevealed ||
    showGracefulCharityModal ||
    showPlayerTargetSpellModal ||
    showUnitedWeStandModal ||
    showMagePowerModal ||
    showObeliskEffectModal ||
    tributeModalData != null ||
    chaosSorcererData != null ||
    redEyesDarknessMetalDragonData != null ||
    redEyesDarknessMetalDragonEffectData != null ||
    showCyberSteinModal ||
    (showBlsEffectModal && blsEffectData != null) ||
    chaosSorcererEffectData != null ||
    selectingSpellTrapSlot != null ||
    isSelectingBreakerTarget ||
    isSelectingMSTTarget ||
    isSelectingSnowmanEaterTarget ||
    isSelectingChaosSorcererTarget
  );

  // Modo espectador: usuário não é jogador do duelo (ex.: admin assistindo)
  // Preferir player1Id/player2Id (sempre no payload); fallback para player1.id / player2.id
  const userIdForSpectator = user?.id != null ? (typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)) : null;
  const player1IdFromData =
    duelData?.player1Id != null
      ? Number(duelData.player1Id)
      : duelData?.player1?.id != null
        ? Number(duelData.player1.id)
        : null;
  const player2IdFromData =
    duelData?.player2Id != null
      ? Number(duelData.player2Id)
      : duelData?.player2?.id != null
        ? Number(duelData.player2.id)
        : null;
  const isSpectator = !!(
    userIdForSpectator != null &&
    player1IdFromData != null &&
    player2IdFromData != null &&
    !Number.isNaN(player1IdFromData) &&
    !Number.isNaN(player2IdFromData) &&
    userIdForSpectator !== player1IdFromData &&
    userIdForSpectator !== player2IdFromData
  );

  // Carregar dados do duelo via WebSocket (INSTANTÂNEO - sem requisições HTTP pesadas)
  // Usar useRef para evitar múltiplas execuções
  const hasInitializedRef = useRef(false);
  const initializedDuelIdRef = useRef<string | undefined>(undefined);
  const initializedUserIdRef = useRef<number | string | undefined>(undefined);
  
  useEffect(() => {
    if (!duelId || !user || !user.id) {
      setLoading(false);
      return;
    }
    
    const currentDuelId = duelId;
    const currentUserId = user?.id;
    
    // Verificar se é a primeira vez (refs ainda não foram setados)
    const isFirstTime = initializedDuelIdRef.current === undefined && initializedUserIdRef.current === undefined;
    
    // Se é a primeira vez, sempre permitir inicialização
    if (isFirstTime) {
      console.log('🆕 [DuelArena] Primeira inicialização do duelo');
      hasInitializedRef.current = false;
    } else {
      // Verificar se precisa reinicializar (duelo ou usuário mudaram)
      const needsReinit = 
        initializedDuelIdRef.current !== currentDuelId ||
        initializedUserIdRef.current !== currentUserId;
      
      if (needsReinit) {
        console.log('🔄 [DuelArena] Duelo ou usuário mudaram, permitindo inicialização');
        hasInitializedRef.current = false;
      } else if (
        hasInitializedRef.current &&
        initializedDuelIdRef.current === currentDuelId &&
        initializedUserIdRef.current === currentUserId
      ) {
        // Verificar se o socket ainda está conectado e se os listeners estão registrados
        const currentSocket = getSocket();
        if (currentSocket && currentSocket.connected) {
          // Verificar se os listeners ainda estão registrados
          const hasListeners = currentSocket.listeners('duelUpdate').length > 0;
          if (hasListeners) {
            console.log('🔄 [DuelArena] Já inicializado para este duelo e usuário, pulando reinicialização');
            return;
          } else {
            // Listeners foram removidos, permitir reinicialização
            console.log('⚠️ [DuelArena] Listeners removidos, permitindo reinicialização');
            hasInitializedRef.current = false;
          }
        } else {
          // Socket desconectado, permitir reinicialização
          console.log('⚠️ [DuelArena] Socket desconectado, permitindo reinicialização');
          hasInitializedRef.current = false;
        }
      }
    }

    // Handler para receber dados do duelo via WebSocket
    const handleDuelUpdate = (data: any) => {
      console.log('📥 [handleDuelUpdate] ========== RECEBIDO DUEL UPDATE ==========');
      console.log('📥 [handleDuelUpdate] Dados básicos:', {
        id: data?.id,
        hasPlayer1Field: !!data?.player1Field,
        hasPlayer2Field: !!data?.player2Field,
        pendingChoice: data?.pendingChoice,
        pendingChoiceType: data?.pendingChoice?.type,
        pendingChoiceUserId: data?.pendingChoice?.userId,
        pendingChoiceData: data?.pendingChoice?.data,
      });
      
      // Log completo do pendingChoice se existir
      if (data?.pendingChoice) {
        console.log('📥 [handleDuelUpdate] pendingChoice COMPLETO:', JSON.stringify(data.pendingChoice, null, 2));
      }
      console.log('📥 [handleDuelUpdate] ===========================================');
      
      // Garantir que loading seja false imediatamente ao receber qualquer update válido
      if (data && data.id) {
        setLoading(false);
        setWsDisconnectedUi(false);
      }
      
      if (!data || !data.id) {
        console.error('❌ [DuelArena] Dados inválidos recebidos!');
        setError('Dados do duelo inválidos');
        setLoading(false);
        return;
      }
      
      // Duelo terminou: só montar overlay quando dá para inferir resultado (evita “empate” com PLAYER*_WIN sem winnerId)
      if (data.status === 'FINISHED') {
        const next = buildDuelEndedScreenState(data);
        setDuelEndedData((prev) => {
          if (!next) return prev;
          if (prev?.status === 'FINISHED') {
            const prevW = prev.winnerId != null && !Number.isNaN(Number(prev.winnerId));
            const nextW = next.winnerId != null && !Number.isNaN(Number(next.winnerId));
            if (prev.result === 'DRAW' && next.result !== 'DRAW') return prev;
            if (prevW && !nextW && next.result !== 'DRAW') return prev;
          }
          return next;
        });
        setLoading(false);
        // NUNCA dar return aqui: senão o campo/LP/deck não são atualizados com o último payload e a arena some (só sobra o fundo).
      }
      
      // Preservar player1/player2 (cosméticos/sleeve do oponente) se o payload não trouxer, para não perder a sleeve
      setDuelData((prev) => {
        const merged = {
          ...data,
          player1: data.player1 ?? prev?.player1,
          player2: data.player2 ?? prev?.player2,
        };
        duelDataRef.current = merged;
        return merged;
      });
      
      // Configurar life points, turno, fase e campos
      // Garantir que a comparação funcione corretamente convertendo ambos para número
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const player1Id = typeof data.player1Id === 'string' ? parseInt(data.player1Id, 10) : Number(data.player1Id);
      const player2Id = typeof data.player2Id === 'string' ? parseInt(data.player2Id, 10) : Number(data.player2Id);
      const isPlayer1 = userId === player1Id;
      // Admin/espectador: sempre P1 no topo (my*) e P2 embaixo (opponent*) — bate com topPanel/bottomPanel
      const isSpectatorUpdate =
        Number.isFinite(player1Id) &&
        Number.isFinite(player2Id) &&
        userId !== player1Id &&
        userId !== player2Id;
      const mapAsPlayer1 = isPlayer1 || isSpectatorUpdate;
      
      console.log(`🔍 [handleDuelUpdate] userId: ${userId}, player1Id: ${player1Id}, player2Id: ${player2Id}, isPlayer1: ${isPlayer1}, spectator: ${isSpectatorUpdate}`);
      console.log(`🔍 [handleDuelUpdate] player1Field:`, data.player1Field ? `${data.player1Field.deck?.length || 0} cartas no deck, ${data.player1Field.hand?.length || 0} na mão` : 'não existe');
      console.log(`🔍 [handleDuelUpdate] player2Field:`, data.player2Field ? `${data.player2Field.deck?.length || 0} cartas no deck, ${data.player2Field.hand?.length || 0} na mão` : 'não existe');
      
      setMyLifePoints(mapAsPlayer1 ? data.player1LifePoints : data.player2LifePoints);
      setOpponentLifePoints(mapAsPlayer1 ? data.player2LifePoints : data.player1LifePoints);
      setIsMyTurn(isSpectatorUpdate ? false : mapAsPlayer1 ? data.currentTurn === 1 : data.currentTurn === 2);
      if (data.currentPhase) {
        setCurrentPhase(data.currentPhase);
      }
      
      // Rastrear mudanças de turno para identificar primeiro turno
      if (previousTurnRef.current !== null && previousTurnRef.current !== data.currentTurn) {
        setHasTurnChanged(true);
      }
      previousTurnRef.current = data.currentTurn;
      
      // Carregar tempo do duelo
      if (data.duelTime !== undefined) {
        setDuelTime(data.duelTime);
      } else if (data.createdAt) {
        // Calcular tempo baseado no createdAt se duelTime não estiver disponível
        const createdAt = new Date(data.createdAt);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
        setDuelTime(elapsedSeconds);
        setDuelStartTime(createdAt.getTime());
      }
      
      // Carregar tempo do turno do banco de dados
      if (data.turnTime !== undefined && data.turnTime > 0) {
        setTurnTimeLimit(data.turnTime);
      } else {
        // Se não tiver no banco, usar 90 como padrão
        setTurnTimeLimit(90);
      }
      
      // Usar tempo restante calculado pelo backend se disponível
      if (data.turnTimeRemaining !== undefined) {
        setTurnTimeLeft(data.turnTimeRemaining);
        setTurnTimeRemainingFromServer(data.turnTimeRemaining); // Armazenar tempo do servidor
      } else if (data.turnTime !== undefined && data.turnTime > 0) {
        setTurnTimeLeft(data.turnTime);
        setTurnTimeRemainingFromServer(null); // Resetar se não veio do servidor
      } else {
        setTurnTimeLeft(90);
        setTurnTimeRemainingFromServer(null); // Resetar se não veio do servidor
      }
      
      // Salvar timestamp de quando o turno começou
      if (data.turnStartedAt) {
        const startedAt = typeof data.turnStartedAt === 'string' 
          ? new Date(data.turnStartedAt) 
          : data.turnStartedAt;
        setTurnStartedAt(startedAt);
      } else {
        setTurnStartedAt(null);
      }
      
      // Carregar deck, mão, monstros, spell/trap e cemitério - SEMPRE processar ambos os campos
      // player1Field sempre é do player1, player2Field sempre é do player2
      if (data.player1Field && data.player2Field) {
        const player1Deck = data.player1Field.deck || [];
        const player1Hand = data.player1Field.hand || [];
        const player1Graveyard = data.player1Field.graveyard || [];
        const player1ExtraDeck = data.player1Field.extraDeck || [];
        const player1Banished = data.player1Field.banished || [];
        // Garantir que monsters e spellTraps sejam arrays de 5 elementos
        const player1MonstersRaw = data.player1Field.monsters || [];
        const player1Monsters = Array.isArray(player1MonstersRaw)
          ? [...player1MonstersRaw, ...Array(5 - player1MonstersRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        const player1SpellTrapsRaw = data.player1Field.spellTrap || data.player1Field.spellTraps || [];
        const player1SpellTraps = Array.isArray(player1SpellTrapsRaw)
          ? [...player1SpellTrapsRaw, ...Array(5 - player1SpellTrapsRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        
        const player2Deck = data.player2Field.deck || [];
        const player2Hand = data.player2Field.hand || [];
        const player2Graveyard = data.player2Field.graveyard || [];
        const player2ExtraDeck = data.player2Field.extraDeck || [];
        const player2Banished = data.player2Field.banished || [];
        // Garantir que monsters e spellTraps sejam arrays de 5 elementos
        const player2MonstersRaw = data.player2Field.monsters || [];
        const player2Monsters = Array.isArray(player2MonstersRaw)
          ? [...player2MonstersRaw, ...Array(5 - player2MonstersRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        const player2SpellTrapsRaw = data.player2Field.spellTrap || data.player2Field.spellTraps || [];
        const player2SpellTraps = Array.isArray(player2SpellTrapsRaw)
          ? [...player2SpellTrapsRaw, ...Array(5 - player2SpellTrapsRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        
        if (mapAsPlayer1) {
          // Player1 (ou espectador): my* = P1 (topo), opponent* = P2 (baixo)
          setMyDeck(player1Deck);
          setMyHand(player1Hand);
          setMyGraveyard(player1Graveyard);
          setMyExtraDeck(player1ExtraDeck);
          setMyBanished(player1Banished);
          setMyMonsters(player1Monsters);
          setMySpellTraps(player1SpellTraps);
          
          // Armazenar turnCounter do campo do jogador
          const turnCounterValue = data.player1Field?.turnCounter || data.turnCounter || 1;
          setMyTurnCounter(turnCounterValue);
          
          // Armazenar flag monsterDestroyedThisTurn para Last Will
          const monsterDestroyedFlag = data.player1Field?.monsterDestroyedThisTurn || false;
          console.log(`🔍 [handleDuelUpdate] Player1/spec - monsterDestroyedThisTurn: ${monsterDestroyedFlag}`);
          setMonsterDestroyedThisTurn(monsterDestroyedFlag);
          setObeliskEffectUsedTurn((data.player1Field as any)?.obeliskEffectUsedTurn);
          setOpponentDeck(player2Deck);
          setOpponentHand(player2Hand);
          setOpponentGraveyard(player2Graveyard);
          setOpponentExtraDeck(player2ExtraDeck);
          setOpponentBanished(player2Banished);
          setOpponentMonsters(player2Monsters);
          setOpponentSpellTraps(player2SpellTraps);
          console.log(`✅ [handleDuelUpdate] Player1/spec - P1 deck: ${player1Deck.length}, P2 deck: ${player2Deck.length}`);
        } else {
          // É player2 - meu campo é player2Field, oponente é player1Field
          setMyDeck(player2Deck);
          setMyHand(player2Hand);
          setMyGraveyard(player2Graveyard);
          setMyExtraDeck(player2ExtraDeck);
          setMyBanished(player2Banished);
          setMyMonsters(player2Monsters);
          setMySpellTraps(player2SpellTraps);
          
          // Armazenar turnCounter do campo do jogador
          const turnCounterValue = data.player2Field?.turnCounter || data.turnCounter || 1;
          setMyTurnCounter(turnCounterValue);
          
          // Armazenar flag monsterDestroyedThisTurn para Last Will
          const monsterDestroyedFlag = data.player2Field?.monsterDestroyedThisTurn || false;
          console.log(`🔍 [handleDuelUpdate] Player2 - monsterDestroyedThisTurn: ${monsterDestroyedFlag}`);
          setMonsterDestroyedThisTurn(monsterDestroyedFlag);
          setObeliskEffectUsedTurn((data.player2Field as any)?.obeliskEffectUsedTurn);
          setOpponentDeck(player1Deck);
          setOpponentHand(player1Hand);
          setOpponentGraveyard(player1Graveyard);
          setOpponentExtraDeck(player1ExtraDeck);
          setOpponentBanished(player1Banished);
          setOpponentMonsters(player1Monsters);
          setOpponentSpellTraps(player1SpellTraps);
          console.log(`✅ [handleDuelUpdate] Player2 - Meu deck: ${player2Deck.length}, cemitério: ${player2Graveyard.length}, Extra Deck: ${player2ExtraDeck.length}, Oponente deck: ${player1Deck.length}`);
        }
      } else {
        console.warn(`⚠️ [handleDuelUpdate] Dados incompletos - player1Field: ${!!data.player1Field}, player2Field: ${!!data.player2Field}`);
      }
      
      // Atualizar estado do pendingChoice
      const pendingChoice = (data as any).pendingChoice;
      const previousPendingChoice = currentPendingChoice;
      
      // Log para debug
      console.log(`🔍 [handleDuelUpdate] pendingChoice atualizado:`, {
        previous: previousPendingChoice?.type || 'null',
        current: pendingChoice?.type || 'null',
        showGracefulCharityModal,
        showOpponentHandRevealed,
        cardEffectType
      });
      
      // Verificar se pendingChoice mudou de não-null para null
      const wasGracefulCharity = previousPendingChoice && previousPendingChoice.type === 'GRACEFUL_CHARITY';
      const wasConfiscation = previousPendingChoice && previousPendingChoice.type === 'CONFISCATION';
      const wasForcefulSentry = previousPendingChoice && previousPendingChoice.type === 'FORCEFUL_SENTRY';
      const isNowNull = !pendingChoice || pendingChoice === null || pendingChoice === undefined;
      
      // Se pendingChoice mudou de não-null para null, fechar os modais ANTES de atualizar o estado
      if (previousPendingChoice && isNowNull) {
        console.log(`✅ [handleDuelUpdate] Escolha confirmada pelo backend - fechando modais`);
        console.log(`🔍 [handleDuelUpdate] previousPendingChoice:`, previousPendingChoice?.type, 'pendingChoice:', pendingChoice, 'wasGracefulCharity:', wasGracefulCharity);
        
        // Fechar modais de Confiscation/ForcefulSentry APENAS se pendingChoice realmente mudou de não-null para null
        // Não fechar se ainda há pendingChoice (pode ser um update intermediário)
        if ((wasConfiscation || wasForcefulSentry || showOpponentHandRevealed) && 
            (cardEffectType === 'confiscation' || cardEffectType === 'forcefulSentry') &&
            isNowNull && previousPendingChoice) {
          console.log(`✅ [handleDuelUpdate] Fechando modal ${cardEffectType} - wasConfiscation: ${wasConfiscation}, wasForcefulSentry: ${wasForcefulSentry}, showOpponentHandRevealed: ${showOpponentHandRevealed}, isNowNull: ${isNowNull}, previousPendingChoice: ${!!previousPendingChoice}`);
          setShowOpponentHandRevealed(false);
          setOpponentHandRevealed([]);
          setCardEffectType(null);
        }
        
        // Fechar modal de GracefulCharity (verificar tanto pelo tipo quanto pelo estado do modal)
        if (wasGracefulCharity || showGracefulCharityModal) {
          console.log(`✅ [handleDuelUpdate] Fechando modal GracefulCharity - wasGracefulCharity: ${wasGracefulCharity}, showGracefulCharityModal: ${showGracefulCharityModal}`);
          setShowGracefulCharityModal(false);
          setGracefulCharityHand([]);
          setSelectedGracefulCharityCards([]);
        }
      }
      
      // Atualizar estado do pendingChoice DEPOIS de fechar modais
      // Isso garante que o useEffect também seja acionado
      setCurrentPendingChoice(pendingChoice || null);
      
      // Verificação adicional: Se pendingChoice é null e o modal ainda está aberto, forçar fechamento
      // Isso garante que o modal feche mesmo se a verificação anterior não funcionou
      // Verificar também se não há pendingChoice no updatedDuel
      if (isNowNull && showGracefulCharityModal) {
        console.log(`⚠️ [handleDuelUpdate] pendingChoice é null mas modal ainda está aberto - forçando fechamento`);
        console.log(`🔍 [handleDuelUpdate] Detalhes - isNowNull: ${isNowNull}, showGracefulCharityModal: ${showGracefulCharityModal}, pendingChoice:`, pendingChoice);
        setShowGracefulCharityModal(false);
        setGracefulCharityHand([]);
        setSelectedGracefulCharityCards([]);
      }
      
      // Verificação final: Se não há pendingChoice e o modal está aberto, sempre fechar
      // Isso é uma verificação de segurança adicional
      if ((!pendingChoice || pendingChoice === null || pendingChoice === undefined) && showGracefulCharityModal) {
        console.log(`🔒 [handleDuelUpdate] Verificação final - fechando modal GracefulCharity (pendingChoice ausente)`);
        setShowGracefulCharityModal(false);
        setGracefulCharityHand([]);
        setSelectedGracefulCharityCards([]);
      }
      
      // Verificação para modais de Confiscation/ForcefulSentry também
      // IMPORTANTE: Só fechar se realmente mudou de não-null para null (não fechar em updates intermediários)
      if ((!pendingChoice || pendingChoice === null || pendingChoice === undefined) && 
          showOpponentHandRevealed && 
          isNowNull && 
          previousPendingChoice) {
        console.log(`🔒 [handleDuelUpdate] Verificação final - fechando modal Confiscation/ForcefulSentry (pendingChoice mudou de não-null para null)`);
        setShowOpponentHandRevealed(false);
        setOpponentHandRevealed([]);
        setCardEffectType(null);
      }
      
      // Verificar se há escolha pendente e restaurar modal IMEDIATAMENTE
      // Isso garante que o modal abra mesmo no primeiro carregamento
      if (pendingChoice) {
        console.log(`🔍 [handleDuelUpdate] Escolha pendente encontrada:`, {
          type: pendingChoice.type,
          userId: pendingChoice.userId,
          myUserId: user?.id,
          hasData: !!pendingChoice.data,
          opponentHandLength: pendingChoice.data?.opponentHand?.length,
          playerHandLength: pendingChoice.data?.playerHand?.length,
          isFirstLoad: !previousPendingChoice // Indica se é o primeiro carregamento
        });
        
        // Comparar IDs convertendo ambos para número para garantir compatibilidade
        const pendingUserId = typeof pendingChoice.userId === 'string' ? parseInt(pendingChoice.userId, 10) : Number(pendingChoice.userId);
        const myUserId = typeof user?.id === 'string' ? parseInt(user.id, 10) : Number(user?.id);
        const isMyChoice = pendingUserId === myUserId;
        
        console.log(`🔍 [handleDuelUpdate] ========== VERIFICANDO PENDING CHOICE ==========`);
        console.log(`🔍 [handleDuelUpdate] Tipo: ${pendingChoice.type}`);
        console.log(`🔍 [handleDuelUpdate] É minha escolha? ${isMyChoice}`);
        console.log(`🔍 [handleDuelUpdate] pendingChoice.userId: ${pendingChoice.userId} (${typeof pendingChoice.userId}) -> ${pendingUserId} (number)`);
        console.log(`🔍 [handleDuelUpdate] user?.id: ${user?.id} (${typeof user?.id}) -> ${myUserId} (number)`);
        console.log(`🔍 [handleDuelUpdate] Comparação: ${pendingUserId} === ${myUserId} = ${pendingUserId === myUserId}`);
        console.log(`🔍 [handleDuelUpdate] ===========================================`);
        
        if (isMyChoice) {
          // Ignorar duelUpdate atrasado que reabre o modal logo após choice_completed (evita bug em produção)
          const resolved = justResolvedChoiceRef.current;
          if (resolved && resolved.type === pendingChoice.type && (Date.now() - resolved.at) < 2500) {
            console.log(`🔒 [handleDuelUpdate] Ignorando pendingChoice duplicado/atrasado (${pendingChoice.type}) - escolha já foi confirmada`);
            justResolvedChoiceRef.current = null;
          } else {
            if (resolved && (Date.now() - resolved.at) >= 2500) justResolvedChoiceRef.current = null;
            console.log(`✅ [handleDuelUpdate] É MINHA ESCOLHA! Restaurando modal para:`, pendingChoice.type);
          
          // Abrir modal IMEDIATAMENTE quando há pendingChoice
          if (pendingChoice.type === 'CONFISCATION' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelUpdate] Abrindo modal Confiscation com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('confiscation');
          } else if (pendingChoice.type === 'GRACEFUL_CHARITY' && pendingChoice.data?.playerHand) {
            console.log(`✅ [handleDuelUpdate] Abrindo modal GracefulCharity com ${pendingChoice.data.playerHand.length} cartas`);
            setGracefulCharityHand(pendingChoice.data.playerHand);
            setShowGracefulCharityModal(true);
            setSelectedGracefulCharityCards([]);
          } else if (pendingChoice.type === 'FORCEFUL_SENTRY' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelUpdate] Abrindo modal ForcefulSentry com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('forcefulSentry');
          } else if (pendingChoice.type === 'UNITED_WE_STAND') {
            const monsters = pendingChoice.data?.availableMonsters ?? [];
            console.log(`✅ [handleDuelUpdate] Abrindo modal United We Stand com ${monsters.length} monstros`);
            setUnitedWeStandData({ availableMonsters: monsters });
            setShowUnitedWeStandModal(true);
            setSelectedUnitedWeStandMonster(null);
          } else if (pendingChoice.type === 'MAGE_POWER') {
            const monsters = pendingChoice.data?.availableMonsters ?? [];
            console.log(`✅ [handleDuelUpdate] Abrindo modal Mage Power com ${monsters.length} monstros`);
            setMagePowerData({ availableMonsters: monsters });
            setShowMagePowerModal(true);
            setSelectedMagePowerMonster(null);
          } else if (pendingChoice.type === 'PLAYER_TARGET_SPELL' && pendingChoice.data) {
            const d = pendingChoice.data;
            setPlayerTargetSpellData({
              duelId: data.id,
              spellKind: d.spellKind,
              step: d.step ?? 1,
              title: d.title,
              selectableHand: d.selectableHand,
              graveyardChoices: d.graveyardChoices,
              spellTrapChoices: d.spellTrapChoices,
              opponentMonsters: d.opponentMonsters,
              defenseMonsters: d.defenseMonsters,
              emptyMonsterZones: d.emptyMonsterZones,
            });
            setPlayerTargetSpellPick(null);
            setShowPlayerTargetSpellModal(true);
          } else if (pendingChoice.type === 'DARK_MAGICIAN_OF_CHAOS' && pendingChoice.data?.spellOptions) {
            setDmocSpellOptions(pendingChoice.data.spellOptions);
            setSelectedDmocSpellIndex(null);
            setShowDmocEndPhaseModal(true);
          } else if (pendingChoice.type === 'MAGICIAN_S_ROD_SEARCH' && pendingChoice.data?.deckOptions) {
            setMagiciansRodDeckOptions(pendingChoice.data.deckOptions);
            setSelectedMagiciansRodDeckIndex(null);
            setShowMagiciansRodSearchModal(true);
          } else if (pendingChoice.type === 'BERFOMET_SEARCH' && pendingChoice.data?.deckOptions) {
            setBerfometDeckOptions(pendingChoice.data.deckOptions);
            setSelectedBerfometDeckIndex(null);
            setShowBerfometSearchModal(true);
          } else if (pendingChoice.type === 'MAGICIAN_S_ROD_GY' && pendingChoice.data?.tributeOptions) {
            setMagiciansRodTributeOptions(pendingChoice.data.tributeOptions);
            setSelectedMagiciansRodTribute(null);
            setShowMagiciansRodGyModal(true);
          } else if (
            pendingChoice.type === 'MAGICIAN_S_SALVATION_ETERNAL_SOUL' &&
            pendingChoice.data?.deckOptions
          ) {
            setMagiciansSalvationDeckOptions(pendingChoice.data.deckOptions);
            setSelectedMagiciansSalvationDeckIndex(null);
            setShowMagiciansSalvationEternalSoulModal(true);
          } else if (pendingChoice.type === 'MAGICIAN_S_SALVATION_PAIR' && pendingChoice.data) {
            setMagiciansSalvationPairData(pendingChoice.data);
            setShowMagiciansSalvationPairModal(true);
          } else if (pendingChoice.type === 'SKILLED_DARK_MAGICIAN' && pendingChoice.data?.options) {
            setSkilledDarkMagicianOptions(pendingChoice.data.options);
            setSelectedSkilledDarkMagician(null);
            setShowSkilledDarkMagicianModal(true);
          } else {
            console.warn(`⚠️ [handleDuelUpdate] Tipo de escolha pendente desconhecido ou dados faltando:`, pendingChoice);
          }
          }
        } else {
          // Escolha pendente não é minha - fechar modais se estiverem abertos
          // Mas só fechar se realmente não for minha escolha (não fechar durante abertura)
          console.log(`ℹ️ [handleDuelUpdate] Escolha pendente não é minha - verificando se preciso fechar modais`);
          // Não fechar aqui - deixar o listener closePendingChoiceModal fazer isso
        }
      } else {
        // Não há escolha pendente - mas não fechar aqui
        // O fechamento já foi tratado acima quando pendingChoice mudou de não-null para null
        // Isso evita fechar modais durante o carregamento inicial quando não há pendingChoice
        // NOTA: Modais não-persistentes (Monster Reborn, Change of Heart, etc.) são fechados via closePendingChoiceModal
        // ou quando o usuário cancela/atualiza a página, não aqui
        console.log(`ℹ️ [handleDuelUpdate] Nenhuma escolha pendente encontrada`);
      }
      
      setLoading(false);
      setError(null);
    };

    const handleDuelError = (data: any) => {
      const errorMessage = data.message || 'Erro ao carregar duelo';
      console.error('❌ [DuelArena] Erro recebido do backend:', errorMessage);
      
      // Se o erro menciona "escolha pendente" e há pendingChoice no erro, abrir o modal
      if (errorMessage.includes('escolha pendente') || errorMessage.includes('completar a escolha')) {
        const pendingChoice = data.pendingChoice;
        if (pendingChoice && pendingChoice.userId === user?.id) {
          console.log('🔍 [handleDuelError] Erro de escolha pendente detectado - abrindo modal:', pendingChoice.type);
          
          // Abrir modal baseado no tipo de pendingChoice
          if (pendingChoice.type === 'CONFISCATION' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelError] Abrindo modal Confiscation com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('confiscation');
            setCurrentPendingChoice(pendingChoice);
          } else if (pendingChoice.type === 'GRACEFUL_CHARITY' && pendingChoice.data?.playerHand) {
            console.log(`✅ [handleDuelError] Abrindo modal GracefulCharity com ${pendingChoice.data.playerHand.length} cartas`);
            setGracefulCharityHand(pendingChoice.data.playerHand);
            setShowGracefulCharityModal(true);
            setSelectedGracefulCharityCards([]);
            setCurrentPendingChoice(pendingChoice);
          } else if (pendingChoice.type === 'FORCEFUL_SENTRY' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelError] Abrindo modal ForcefulSentry com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('forcefulSentry');
            setCurrentPendingChoice(pendingChoice);
          } else if (pendingChoice.type === 'UNITED_WE_STAND') {
            const monsters = pendingChoice.data?.availableMonsters ?? [];
            console.log(`✅ [handleDuelError] Abrindo modal United We Stand com ${monsters.length} monstros`);
            setUnitedWeStandData({ availableMonsters: monsters });
            setShowUnitedWeStandModal(true);
            setSelectedUnitedWeStandMonster(null);
            setCurrentPendingChoice(pendingChoice);
          } else if (pendingChoice.type === 'MAGE_POWER') {
            const monsters = pendingChoice.data?.availableMonsters ?? [];
            console.log(`✅ [handleDuelError] Abrindo modal Mage Power com ${monsters.length} monstros`);
            setMagePowerData({ availableMonsters: monsters });
            setShowMagePowerModal(true);
            setSelectedMagePowerMonster(null);
            setCurrentPendingChoice(pendingChoice);
          }
          
          // Não mostrar erro se conseguimos abrir o modal
          return;
        }
      }
      
      // Se o erro for "Duelo não encontrado" mas já temos duelData, não fechar o duelo
      // Pode ser um erro temporário ou de sincronização
      if (errorMessage.includes('não encontrado') || errorMessage.includes('not found')) {
        // Sempre ignorar se já temos duelData carregado
        if (duelData && duelData.id) {
          console.warn('⚠️ [DuelArena] Erro de "duelo não encontrado" ignorado - duelo já está carregado');
          return; // Não definir erro se o duelo já está carregado
        }
        // Se não temos duelData mas já foi inicializado, também ignorar (pode ser erro temporário)
        if (hasInitializedRef.current && initializedDuelIdRef.current === duelId) {
          console.warn('⚠️ [DuelArena] Erro de "duelo não encontrado" ignorado - duelo já foi inicializado');
          return;
        }
      }
      
      // Só definir erro se realmente não temos o duelo carregado
      if (!duelData || !duelData.id) {
        setError(errorMessage);
        setLoading(false);
      } else {
        console.warn('⚠️ [DuelArena] Erro ignorado - duelo já está carregado e funcionando');
      }
    };

    // Obter socket do hook useSocket
    // CRÍTICO: A nova aba precisa criar seu próprio socket independente
    let socket = getSocket();
    
    // Desconexão: overlay sobre a arena; o overlay só some após duelUpdate (estado sincronizado).
    const disconnectListener = (reason?: string) => {
      if (reason === 'io client disconnect') return;
      if (currentDuelId) setWsDisconnectedUi(true);
    };
    const resyncJoinAfterReconnect = () => {
      if (!currentDuelId || currentUserId == null) return;
      const duelIdStr = typeof currentDuelId === 'string' ? currentDuelId : String(currentDuelId);
      const numericUserId = typeof currentUserId === 'string' ? parseInt(currentUserId, 10) : Number(currentUserId);
      joinDuelRoomRef.current(duelIdStr, numericUserId);
      window.setTimeout(() => joinDuelRoomRef.current(duelIdStr, numericUserId), 300);
    };
    
    // Se não há socket ou não está conectado, aguardar a conexão
    // O useSocket já cria o socket automaticamente, mas pode levar alguns milissegundos
    const setupSocket = () => {
      // Obter socket novamente (pode ter sido criado enquanto aguardávamos)
      socket = getSocket();
      
      if (!socket || !socket.connected) {
        return false;
      }

      // Registrar listeners
      socket.on('duelUpdate', handleDuelUpdate);
      socket.on('duelError', handleDuelError);
      
      // Animação de batalha só quando o servidor confirma sucesso (evita animar se Mirror Force etc. negar)
      socket.on('attackSucceeded', (data: {
        duelId: string | number;
        attackerUserId: string | number;
        attackerZoneIndex: number;
        targetZoneIndex: number | null;
        attackerCard: any;
        targetCard: any | null;
        damage: number;
        isDirectAttack: boolean;
        defenderProfileImage?: string | null;
      }) => {
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          return;
        }
        const myIdStr = user?.id != null ? String(user.id).trim() : '';
        const attackerStr =
          data.attackerUserId != null && data.attackerUserId !== ''
            ? String(data.attackerUserId).trim()
            : '';
        const isMeAttacker = myIdStr !== '' && attackerStr !== '' && myIdStr === attackerStr;

        if (data.isDirectAttack) {
          const resolvedTarget = getProfileImageUrl(data.defenderProfileImage);

          setAttackAnimation({
            attackerCard: data.attackerCard || null,
            targetCard: null,
            damage: typeof data.damage === 'number' ? data.damage : 0,
            isDirectAttack: true,
            isMyAttack: isMeAttacker,
            targetProfileImage: resolvedTarget,
          });
        } else {
          setAttackAnimation({
            attackerCard: data.attackerCard,
            targetCard: data.targetCard,
            damage: typeof data.damage === 'number' ? data.damage : 0,
            isDirectAttack: false,
            isMyAttack: isMeAttacker,
          });
        }

        setTimeout(() => setAttackAnimation(null), 1200);
      });
      
      // Listener para quando o duelo é encerrado
      const duelEndedListener = (data: any) => {
        console.log('🔴 [DuelArena] Duelo encerrado:', data);
        const currentDuelData = duelDataRef.current;
        const merged = {
          ...data,
          status: data.status || 'FINISHED',
          player1LifePoints: data.player1LifePoints ?? currentDuelData?.player1LifePoints,
          player2LifePoints: data.player2LifePoints ?? currentDuelData?.player2LifePoints,
          player1: data.player1 ?? currentDuelData?.player1,
          player2: data.player2 ?? currentDuelData?.player2,
          player1Id: data.player1Id ?? currentDuelData?.player1Id,
          player2Id: data.player2Id ?? currentDuelData?.player2Id,
          turnCounter: data.turnCounter ?? currentDuelData?.turnCounter ?? 0,
          currentTurn: data.currentTurn ?? currentDuelData?.currentTurn,
          duelTime: data.duelTime ?? currentDuelData?.duelTime ?? duelTime,
        };
        const next = buildDuelEndedScreenState(merged);
        setDuelEndedData(
          next ?? {
            status: 'FINISHED',
            result: merged.result,
            winnerId:
              merged.winnerId != null && merged.winnerId !== ''
                ? Number(merged.winnerId)
                : null,
            message: merged.message || 'Este duelo foi encerrado',
            player1LifePoints: merged.player1LifePoints,
            player2LifePoints: merged.player2LifePoints,
            player1: merged.player1,
            player2: merged.player2,
            player1Id: merged.player1Id,
            player2Id: merged.player2Id,
            turnCounter: merged.turnCounter || 0,
            currentTurn: merged.currentTurn,
            duelTime: merged.duelTime || 0,
          },
        );
        setLoading(false);
        requestActiveDuelRefresh();
      };
      socket.on('duelEnded', duelEndedListener);
      
      // Listener para quando o tempo do oponente expira (recebido do backend)
      const timeExpiredListener = (data: any) => {
        if (!isMyTurn) {
          setTimeExpired(true);
        }
      };
      socket.on('timeExpired', timeExpiredListener);
      
      // Listener para quando precisa descartar cartas (não usado mais, mas mantido para compatibilidade)
      const needsDiscardListener = (data: any) => {
        // Não fazer nada - o descarte agora é feito diretamente clicando nas cartas
      };
      socket.on('needsDiscard', needsDiscardListener);
      
      // Listener para The Forceful Sentry
      const forcefulSentryListener = (data: { opponentHand: any[]; duelId: string | number }) => {
        console.log('✨ The Forceful Sentry ativada - mostrando mão do oponente:', data.opponentHand);
        setOpponentHandRevealed(data.opponentHand);
        setShowOpponentHandRevealed(true);
        setCardEffectType('forcefulSentry');
      };
      
      // Listener para Confiscation
      const confiscationListener = (data: { opponentHand: any[]; duelId: string | number }) => {
        console.log('✨ [Confiscation Listener] ==========================================');
        console.log('✨ [Confiscation Listener] Evento recebido!', data);
        console.log('✨ [Confiscation Listener] Mão do oponente:', data.opponentHand);
        console.log('✨ [Confiscation Listener] Número de cartas:', data.opponentHand?.length || 0);
        console.log('✨ [Confiscation Listener] DuelId recebido:', data.duelId, 'DuelId atual:', duelId);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [Confiscation Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        // Atualizar estados
        const handArray = data.opponentHand || [];
        console.log('✨ [Confiscation Listener] Abrindo modal com', handArray.length, 'cartas');
        setOpponentHandRevealed(handArray);
        setShowOpponentHandRevealed(true);
        setCardEffectType('confiscation');
        
        console.log('✅ [Confiscation Listener] Estados atualizados:', {
          showOpponentHandRevealed: true,
          opponentHandRevealed: handArray.length,
          cardEffectType: 'confiscation',
          handArray: handArray
        });
        console.log('✨ [Confiscation Listener] ==========================================');
        
        // Forçar re-render verificando estados após um pequeno delay
        setTimeout(() => {
          console.log('🔍 [Confiscation Listener] Verificação pós-update - showOpponentHandRevealed deve ser true');
        }, 100);
      };
      
      socket.on('forcefulSentryShowHand', forcefulSentryListener);
      socket.on('confiscationShowHand', confiscationListener);

      // Listener para GracefulCharity
      const gracefulCharityListener = (data: { playerHand: any[]; duelId: string | number }) => {
        console.log('✨ [GracefulCharity Listener] ==========================================');
        console.log('✨ [GracefulCharity Listener] Evento recebido!', data);
        console.log('✨ [GracefulCharity Listener] Dados recebidos:', {
          playerHandLength: data.playerHand?.length || 0,
          playerHand: data.playerHand,
          duelId: data.duelId
        });
        console.log('✨ [GracefulCharity Listener] DuelId recebido:', data.duelId, 'DuelId atual:', duelId);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [GracefulCharity Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        const handArray = data.playerHand || [];
        console.log('✨ [GracefulCharity Listener] Abrindo modal com', handArray.length, 'cartas');
        setGracefulCharityHand(handArray);
        setShowGracefulCharityModal(true);
        setSelectedGracefulCharityCards([]);
        console.log('✅ [GracefulCharity Listener] Estados atualizados - showGracefulCharityModal: true, handLength:', handArray.length);
        console.log('✨ [GracefulCharity Listener] ==========================================');
      };
      socket.on('gracefulCharityShowHand', gracefulCharityListener);
      console.log('✅ [DuelArena] Listener gracefulCharityShowHand registrado');

      // Listener para MonsterReborn
      const monsterRebornListener = (data: { playerGraveyard: any[]; opponentGraveyard: any[]; duelId: string | number }) => {
        console.log('✨ [MonsterReborn Listener] Evento recebido!', data);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MonsterReborn Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        console.log('✨ [MonsterReborn Listener] Abrindo modal');
        setMonsterRebornData({
          playerGraveyard: data.playerGraveyard || [],
          opponentGraveyard: data.opponentGraveyard || [],
        });
        setShowMonsterRebornModal(true);
        setSelectedMonsterReborn(null);
      };
      socket.on('monsterRebornShowGraveyards', monsterRebornListener);
      console.log('✅ [DuelArena] Listener monsterRebornShowGraveyards registrado');
      
      // Listener para Premature Burial (escolher monstro do próprio cemitério)
      const prematureBurialListener = (data: { playerGraveyard: any[]; duelId: string | number }) => {
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) return;
        setPrematureBurialGraveyard(data.playerGraveyard || []);
        setShowPrematureBurialModal(true);
        setSelectedPrematureBurialIndex(null);
      };
      socket.on('prematureBurialShowGraveyard', prematureBurialListener);
      console.log('✅ [DuelArena] Listener prematureBurialShowGraveyard registrado');
      
      // Listener para Autonomous Action Unit (escolher monstro do cemitério do oponente)
      const autonomousActionUnitListener = (data: { opponentGraveyard: any[]; duelId: string | number }) => {
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) return;
        setAutonomousActionUnitGraveyard(data.opponentGraveyard || []);
        setShowAutonomousActionUnitModal(true);
        setSelectedAutonomousActionUnitIndex(null);
      };
      socket.on('autonomousActionUnitShowOpponentGraveyard', autonomousActionUnitListener);
      console.log('✅ [DuelArena] Listener autonomousActionUnitShowOpponentGraveyard registrado');
      
      // Listener para Monster Reincarnation - descartar carta da mão
      const monsterReincarnationDiscardListener = (data: { playerHand: any[]; duelId: string | number }) => {
        console.log('✨ [MonsterReincarnation Discard Listener] Evento recebido!', data);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MonsterReincarnation Discard Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        console.log('✨ [MonsterReincarnation Discard Listener] Abrindo modal para descartar carta');
        const handArray = data.playerHand || [];
        setMonsterReincarnationHand(handArray);
        setShowMonsterReincarnationDiscardModal(true);
        setSelectedMonsterReincarnationCard(null);
      };
      socket.on('monsterReincarnationShowHand', monsterReincarnationDiscardListener);
      console.log('✅ [DuelArena] Listener monsterReincarnationShowHand registrado');
      
      // Listener para Monster Reincarnation - escolher monstro do cemitério
      const monsterReincarnationGraveyardListener = (data: { monsters: any[]; duelId: string | number }) => {
        console.log('✨ [MonsterReincarnation Graveyard Listener] Evento recebido!', data);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MonsterReincarnation Graveyard Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        console.log('✨ [MonsterReincarnation Graveyard Listener] Abrindo modal para escolher monstro do cemitério');
        const monstersArray = data.monsters || [];
        setMonsterReincarnationGraveyard(monstersArray);
        setShowMonsterReincarnationGraveyardModal(true);
        setSelectedMonsterReincarnationMonster(null);
      };
      socket.on('monsterReincarnationShowGraveyard', monsterReincarnationGraveyardListener);
      console.log('✅ [DuelArena] Listener monsterReincarnationShowGraveyard registrado');
      
      // Listener para ChangeOfHeart
      const changeOfHeartListener = (data: { opponentMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [ChangeOfHeart Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ChangeOfHeart Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ChangeOfHeart Listener] Abrindo modal');
        setChangeOfHeartData({
          opponentMonsters: data.opponentMonsters || [],
        });
        setShowChangeOfHeartModal(true);
        setSelectedChangeOfHeartMonster(null);
      };
      socket.on('changeOfHeartShowOpponentMonsters', changeOfHeartListener);
      console.log('✅ [DuelArena] Listener changeOfHeartShowOpponentMonsters registrado');
      
      // Listener para BrainControl
      const brainControlListener = (data: { opponentMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [BrainControl Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [BrainControl Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [BrainControl Listener] Abrindo modal');
        setBrainControlData({
          opponentMonsters: data.opponentMonsters || [],
        });
        setShowBrainControlModal(true);
        setSelectedBrainControlMonster(null);
      };
      socket.on('brainControlShowOpponentMonsters', brainControlListener);
      console.log('✅ [DuelArena] Listener brainControlShowOpponentMonsters registrado');
      
      // Listener para SoulTaker
      const soulTakerListener = (data: { opponentMonsters: any[]; duelId: string | number }) => {
        console.log('🔍 [DuelArena] soulTakerShowOpponentMonsters recebido:', data);
        if (data.duelId === duelId) {
          setSoulTakerData({ opponentMonsters: data.opponentMonsters });
          setShowSoulTakerModal(true);
          setSelectedSoulTakerMonster(null);
        }
      };
      socket.on('soulTakerShowOpponentMonsters', soulTakerListener);
      console.log('✅ [DuelArena] Listener soulTakerShowOpponentMonsters registrado');

      const playerTargetSpellListener = (data: any) => {
        if (data.duelId === duelId || String(data.duelId) === String(duelId)) {
          setPlayerTargetSpellData(data);
          setPlayerTargetSpellPick(null);
          setShowPlayerTargetSpellModal(true);
        }
      };
      socket.on('playerTargetSpellShow', playerTargetSpellListener);
      console.log('✅ [DuelArena] Listener playerTargetSpellShow registrado');

      // Listener para Lightning Storm (escolher 1 efeito: destruir monstros em ataque OU magias/armadilhas do oponente)
      const lightningStormListener = (data: { duelId: string | number }) => {
        if (data.duelId === duelId || String(data.duelId) === String(duelId)) {
          setShowLightningStormModal(true);
        }
      };
      socket.on('lightningStormShowOptions', lightningStormListener);
      console.log('✅ [DuelArena] Listener lightningStormShowOptions registrado');

      // Listener para Exiled Force
      const exiledForceListener = (data: { availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>; duelId: string | number; monsterZoneIndex?: number }) => {
        console.log('🔍 [DuelArena] exiledForceShowTargets recebido:', data);
        if (data.duelId === duelId) {
          setExiledForceData({ 
            availableMonsters: data.availableMonsters,
            monsterZoneIndex: data.monsterZoneIndex
          });
          setShowExiledForceModal(true);
          setSelectedExiledForceMonster(null);
        }
      };
      socket.on('exiledForceShowTargets', exiledForceListener);
      console.log('✅ [DuelArena] Listener exiledForceShowTargets registrado');

      // Listener para UnitedWeStand
      const unitedWeStandListener = (data: { availableMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [UnitedWeStand Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [UnitedWeStand Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [UnitedWeStand Listener] Abrindo modal');
        setUnitedWeStandData({
          availableMonsters: data.availableMonsters || [],
        });
        setShowUnitedWeStandModal(true);
        setSelectedUnitedWeStandMonster(null);
      };

      socket.on('unitedWeStandShowMonsters', unitedWeStandListener);
      console.log('✅ [DuelArena] Listener unitedWeStandShowMonsters registrado');

      // Listener para MagePower
      const magePowerListener = (data: { availableMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [MagePower Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MagePower Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [MagePower Listener] Abrindo modal');
        setMagePowerData({
          availableMonsters: data.availableMonsters || [],
        });
        setShowMagePowerModal(true);
        setSelectedMagePowerMonster(null);
      };

      socket.on('magePowerShowMonsters', magePowerListener);
      console.log('✅ [DuelArena] Listener magePowerShowMonsters registrado');
      
      // Listener para Reinforcement Of The Army
      const reinforcementOfTheArmyListener = (data: { warriorMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [ReinforcementOfTheArmy Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ReinforcementOfTheArmy Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ReinforcementOfTheArmy Listener] Abrindo modal');
        setReinforcementOfTheArmyData({
          warriorMonsters: data.warriorMonsters || [],
        });
        setShowReinforcementOfTheArmyModal(true);
        setSelectedReinforcementOfTheArmyMonster(null);
      };
      socket.on('reinforcementOfTheArmyShowDeck', reinforcementOfTheArmyListener);
      console.log('✅ [DuelArena] Listener reinforcementOfTheArmyShowDeck registrado');

      // Listener para Last Will
      const lastWillListener = (data: { eligibleMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [LastWill Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [LastWill Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [LastWill Listener] Abrindo modal');
        setLastWillData({
          eligibleMonsters: data.eligibleMonsters || [],
        });
        setShowLastWillModal(true);
        setSelectedLastWillMonster(null);
      };
      socket.on('lastWillShowDeck', lastWillListener);
      console.log('✅ [DuelArena] Listener lastWillShowDeck registrado');

      // Listener para Chaos Sorcerer Summon
      const chaosSorcererSummonListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [ChaosSorcererSummon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ChaosSorcererSummon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ChaosSorcererSummon Listener] Abrindo modal');
        if (data.data) {
          setChaosSorcererData({
            cardId: data.data.cardId,
            cardName: data.data.cardName || 'Carta Chaos',
            lightMonsters: data.data.lightMonsters || [],
            darkMonsters: data.data.darkMonsters || [],
          });
          setShowChaosSorcererModal(true);
          setSelectedLightMonster(null);
          setSelectedDarkMonster(null);
        }
      };
      socket.on('chaosSorcererSummonShowMonsters', chaosSorcererSummonListener);
      console.log('✅ [DuelArena] Listener chaosSorcererSummonShowMonsters registrado');

      // Listener para Chaos Sorcerer Effect
      const chaosSorcererEffectListener = (data: { duelId: string | number; availableMonsters?: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>; data: any }) => {
        console.log('✨ [ChaosSorcererEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ChaosSorcererEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ChaosSorcererEffect Listener] Abrindo modal');
        setChaosSorcererEffectData({
          availableMonsters: data.availableMonsters || [],
          monsterZoneIndex: data.data?.monsterZoneIndex,
        });
        setShowChaosSorcererEffectModal(true);
        setSelectedChaosSorcererEffectMonster(null);
      };
      socket.on('chaosSorcererEffectShowTargets', chaosSorcererEffectListener);
      console.log('✅ [DuelArena] Listener chaosSorcererEffectShowTargets registrado');

      // Listener para Black Luster Soldier - Envoy of the Beginning
      const blsEffectListener = (data: { duelId: string | number; data: { monsterZoneIndex?: number; availableMonsters?: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }> } }) => {
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) return;
        setBlsEffectData({
          availableMonsters: data.data?.availableMonsters || [],
          monsterZoneIndex: data.data?.monsterZoneIndex,
        });
        setBlsEffectChoice(null);
        setSelectedBlsEffectMonster(null);
        setShowBlsEffectModal(true);
      };
      socket.on('blsEffectShowTargets', blsEffectListener);
      console.log('✅ [DuelArena] Listener blsEffectShowTargets registrado');

      // Listener para Dark Armed Dragon Summon
      const darkArmedDragonSummonListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [DarkArmedDragonSummon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [DarkArmedDragonSummon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [DarkArmedDragonSummon Listener] Mostrando zonas disponíveis');
        // Dark Armed Dragon invoca diretamente sem modal (sempre em ataque)
        // O backend já valida que há exatamente 3 Dark no cemitério
        if (data.data && duelId && user?.id) {
          // Usar duelDataRef para obter o estado mais recente do duelo
          const currentDuelData = duelDataRef.current;
          if (currentDuelData) {
            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
            const player1Id = typeof currentDuelData.player1Id === 'string' ? parseInt(currentDuelData.player1Id, 10) : Number(currentDuelData.player1Id);
            const isPlayer1 = userId === player1Id;
            const field = isPlayer1 ? currentDuelData.player1Field : currentDuelData.player2Field;
            const monsters = field?.monsters || [];
            const emptyZoneIndex = monsters.findIndex((m: any) => m === null || m === undefined);
            if (emptyZoneIndex !== -1) {
              const cardId = data.data.cardId;
              performAction(duelId, user.id, 'DARK_ARMED_DRAGON_SUMMON_CHOICE', {
                cardId: cardId,
                zoneIndex: emptyZoneIndex,
              });
            }
          }
        }
      };
      socket.on('darkArmedDragonSummonShowZones', darkArmedDragonSummonListener);
      console.log('✅ [DuelArena] Listener darkArmedDragonSummonShowZones registrado');

      // Listener para Dark Armed Dragon Effect
      const darkArmedDragonEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [DarkArmedDragonEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [DarkArmedDragonEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [DarkArmedDragonEffect Listener] Abrindo modal');
        if (data.data) {
          setDarkArmedDragonEffectData({
            monsterZoneIndex: data.data.monsterZoneIndex,
            darkMonsters: data.data.darkMonsters || [],
          });
          setShowDarkArmedDragonEffectModal(true);
          setSelectedDarkMonsterToBanish(null);
        }
      };
      socket.on('darkArmedDragonEffectShowModal', darkArmedDragonEffectListener);
      console.log('✅ [DuelArena] Listener darkArmedDragonEffectShowModal registrado');

      // Listener para Red-Eyes Darkness Metal Dragon Summon
      const redEyesDarknessMetalDragonSummonListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [RedEyesDarknessMetalDragonSummon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [RedEyesDarknessMetalDragonSummon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [RedEyesDarknessMetalDragonSummon Listener] Abrindo modal');
        if (data.data) {
          setRedEyesDarknessMetalDragonData({
            cardId: data.data.cardId || '',
            dragonMonsters: data.data.dragonMonsters || [],
          });
          setShowRedEyesDarknessMetalDragonModal(true);
          setSelectedDragonToBanish(null);
        }
      };
      socket.on('redEyesDarknessMetalDragonSummonShowDragons', redEyesDarknessMetalDragonSummonListener);
      console.log('✅ [DuelArena] Listener redEyesDarknessMetalDragonSummonShowDragons registrado');

      // Listener para Red-Eyes Darkness Metal Dragon Effect
      const redEyesDarknessMetalDragonEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [RedEyesDarknessMetalDragonEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [RedEyesDarknessMetalDragonEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [RedEyesDarknessMetalDragonEffect Listener] Abrindo modal');
        if (data.data) {
          setRedEyesDarknessMetalDragonEffectData({
            monsterZoneIndex: data.data.monsterZoneIndex,
            dragonsInHand: data.data.dragonsInHand || [],
            dragonsInGraveyard: data.data.dragonsInGraveyard || [],
          });
          setShowRedEyesDarknessMetalDragonEffectModal(true);
          setSelectedDragonSource(null);
          setSelectedDragonIndex(null);
          setSelectedDragonId(null);
        }
      };
      socket.on('redEyesDarknessMetalDragonEffectShowDragons', redEyesDarknessMetalDragonEffectListener);
      console.log('✅ [DuelArena] Listener redEyesDarknessMetalDragonEffectShowDragons registrado');

      // Listener para Cyber-Stein Effect
      const cyberSteinEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [CyberSteinEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [CyberSteinEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [CyberSteinEffect Listener] Abrindo modal');
        if (data.data) {
          setCyberSteinData({
            monsterZoneIndex: data.data.monsterZoneIndex,
            extraDeckMonsters: data.data.extraDeckMonsters || [],
          });
          setShowCyberSteinModal(true);
          setSelectedCyberSteinMonster(null);
        }
      };
      socket.on('cyberSteinEffectShowExtraDeck', cyberSteinEffectListener);
      console.log('✅ [DuelArena] Listener cyberSteinEffectShowExtraDeck registrado');

      // Listener para Mystical Space Typhoon
      const mysticalSpaceTyphoonListener = (data: { duelId: string | number; playerSpellTraps: any[]; opponentSpellTraps: any[]; spellTrapZoneIndex: number }) => {
        console.log('✨ [MysticalSpaceTyphoon Listener] ========== EVENTO RECEBIDO ==========');
        console.log('✨ [MysticalSpaceTyphoon Listener] Dados completos:', JSON.stringify(data, null, 2));
        console.log('✨ [MysticalSpaceTyphoon Listener] playerSpellTraps:', data.playerSpellTraps?.length || 0);
        console.log('✨ [MysticalSpaceTyphoon Listener] opponentSpellTraps:', data.opponentSpellTraps?.length || 0);
        console.log('✨ [MysticalSpaceTyphoon Listener] opponentSpellTraps é array:', Array.isArray(data.opponentSpellTraps));
        console.log('✨ [MysticalSpaceTyphoon Listener] opponentSpellTraps tipo:', typeof data.opponentSpellTraps);
        console.log('✨ [MysticalSpaceTyphoon Listener] Detalhes opponentSpellTraps:', data.opponentSpellTraps);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MysticalSpaceTyphoon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [MysticalSpaceTyphoon Listener] Abrindo modal');
        const playerSpellTraps = Array.isArray(data.playerSpellTraps) ? data.playerSpellTraps : [];
        // CRÍTICO: Garantir que opponentSpellTraps é sempre um array válido
        let opponentSpellTraps = Array.isArray(data.opponentSpellTraps) ? data.opponentSpellTraps : [];
        
        // CRÍTICO: Verificar se os dados estão na estrutura correta
        // Se opponentSpellTraps tem itens mas não têm a propriedade 'card', pode ser que os dados estejam em formato diferente
        if (opponentSpellTraps.length > 0 && opponentSpellTraps[0] && !opponentSpellTraps[0].card) {
          console.warn('⚠️ [MysticalSpaceTyphoon Listener] opponentSpellTraps não tem estrutura card - tentando corrigir...');
          // Tentar corrigir a estrutura se os dados vieram em formato diferente
          opponentSpellTraps = opponentSpellTraps.map((item: any, idx: number) => {
            if (item.card) {
              return item; // Já está na estrutura correta
            }
            // Se não tem card, pode ser que o item inteiro seja a carta
            return {
              card: item,
              zoneIndex: item.zoneIndex || idx,
              player: item.player || 'opponent'
            };
          });
        }
        
        console.log('✨ [MysticalSpaceTyphoon Listener] playerSpellTraps processadas:', playerSpellTraps.length);
        console.log('✨ [MysticalSpaceTyphoon Listener] opponentSpellTraps processadas:', opponentSpellTraps.length);
        console.log('✨ [MysticalSpaceTyphoon Listener] opponentSpellTraps é array após processamento:', Array.isArray(opponentSpellTraps));
        console.log('✨ [MysticalSpaceTyphoon Listener] Detalhes das opponentSpellTraps processadas:', opponentSpellTraps.map((st: any) => ({
          name: st?.card?.name || st?.card?.cardName || st?.name || 'Desconhecida',
          zoneIndex: st?.zoneIndex,
          player: st?.player,
          hasCard: !!st?.card,
          cardId: st?.card?.idCarta || st?.card?.id || st?.card?.cardId || st?.idCarta || st?.id || st?.cardId,
          estrutura: Object.keys(st || {})
        })));
        console.log('✨ [MysticalSpaceTyphoon Listener] Definindo mysticalSpaceTyphoonData com opponentSpellTraps:', opponentSpellTraps.length);
        console.log('✨ [MysticalSpaceTyphoon Listener] opponentSpellTraps completo:', JSON.stringify(opponentSpellTraps, null, 2));
        
        // CRÍTICO: Criar objeto de dados com estrutura garantida
        const modalData = {
          playerSpellTraps: playerSpellTraps,
          opponentSpellTraps: opponentSpellTraps, // Garantir que sempre é um array
          spellTrapZoneIndex: data.spellTrapZoneIndex,
        };
        
        console.log('✨ [MysticalSpaceTyphoon Listener] modalData criado:', {
          playerSpellTraps: modalData.playerSpellTraps.length,
          opponentSpellTraps: modalData.opponentSpellTraps.length,
          opponentSpellTrapsIsArray: Array.isArray(modalData.opponentSpellTraps),
          opponentSpellTrapsFirstItem: modalData.opponentSpellTraps[0]
        });
        
        // Definir estado de forma síncrona
        setMysticalSpaceTyphoonData(modalData);
        setShowMysticalSpaceTyphoonModal(true);
        setSelectedMSTTarget(null);
        setIsSelectingMSTTarget(true);
        
        console.log('✨ [MysticalSpaceTyphoon Listener] ========== MODAL ABERTO ==========');
        console.log('✨ [MysticalSpaceTyphoon Listener] Estados definidos - modalData:', {
          playerSpellTraps: modalData.playerSpellTraps.length,
          opponentSpellTraps: modalData.opponentSpellTraps.length,
          opponentSpellTrapsStructure: modalData.opponentSpellTraps.map((st: any) => ({
            hasCard: !!st?.card,
            cardName: st?.card?.name || st?.card?.cardName || 'N/A',
            zoneIndex: st?.zoneIndex,
            player: st?.player
          }))
        });
      };
      socket.on('mysticalSpaceTyphoonShowTargets', mysticalSpaceTyphoonListener);
      console.log('✅ [DuelArena] Listener mysticalSpaceTyphoonShowTargets registrado');

      // Listener para Snowman Eater
      const snowmanEaterListener = (data: { duelId: string | number; faceUpMonsters: any[]; monsterZoneIndex: number }) => {
        console.log('✨ [SnowmanEater Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [SnowmanEater Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [SnowmanEater Listener] Iniciando seleção de alvo');
        setIsSelectingSnowmanEaterTarget(true);
        // Os dados necessários já estão disponíveis no estado do componente
      };
      socket.on('snowmanEaterShowTargets', snowmanEaterListener);
      console.log('✅ [DuelArena] Listener snowmanEaterShowTargets registrado');

      // Listener para fechar modal quando turno é roubado ou muda
      // IMPORTANTE: Se o motivo for 'turn_stolen', fechar TODOS os modais (escolha automática será feita)
      const closePendingChoiceModalListener = (data: { duelId: string | number; userId?: number; reason: string }) => {
        console.log('🔒 [closePendingChoiceModal] Evento recebido para fechar modal:', data);
        console.log('🔒 [closePendingChoiceModal] Verificando condições - duelId:', data.duelId, '===', duelId, 'userId:', data.userId, '===', user?.id);
        
        // Verificar se é para este duelo
        const isForThisDuel = data.duelId === duelId || String(data.duelId) === String(duelId);
        
        // Se o turno foi roubado, fechar TODOS os modais (escolha automática será feita pelo backend)
        // O evento é emitido para todos na sala, mas só fecha o modal se for para este duelo E se o userId corresponder ao usuário atual
        if (isForThisDuel && data.reason === 'turn_stolen') {
          // Converter ambos os IDs para número para comparação
          const eventUserId = typeof data.userId === 'string' ? parseInt(data.userId, 10) : Number(data.userId);
          const currentUserId = typeof user?.id === 'string' ? parseInt(user.id, 10) : Number(user?.id);
          
          // Verificar se o evento é para este usuário OU se não há userId especificado (fechar para todos)
          const userIdMatch = !data.userId || eventUserId === currentUserId;
          
          if (userIdMatch) {
            console.log('🔒 [closePendingChoiceModal] Turno foi roubado - fechando TODOS os modais imediatamente');
            console.log('🔒 [closePendingChoiceModal] userId do evento:', data.userId, '->', eventUserId, 'userId atual:', user?.id, '->', currentUserId, 'match:', userIdMatch);
            
            // Usar refs para acessar valores mais recentes dos modais
            const isOpponentHandRevealedOpen = showOpponentHandRevealedRef.current;
            const isGracefulCharityOpen = showGracefulCharityModalRef.current;
            const currentCardEffectType = cardEffectTypeRef.current;
            
            console.log('🔒 [closePendingChoiceModal] Estados atuais dos modais (via refs):', {
              isOpponentHandRevealedOpen,
              isGracefulCharityOpen,
              currentCardEffectType
            });
            
            // Fechar todos os modais quando o turno é roubado
            if (isOpponentHandRevealedOpen) {
              console.log('🔒 [closePendingChoiceModal] Fechando modal Confiscation/ForcefulSentry (turno roubado)');
              setShowOpponentHandRevealed(false);
              setOpponentHandRevealed([]);
              setCardEffectType(null);
            }
            if (isGracefulCharityOpen) {
              console.log('🔒 [closePendingChoiceModal] Fechando modal GracefulCharity (turno roubado)');
              setShowGracefulCharityModal(false);
              setGracefulCharityHand([]);
              setSelectedGracefulCharityCards([]);
            }
            return; // Não processar mais nada, já fechou os modais
          } else {
            console.log('🔒 [closePendingChoiceModal] Evento de turno roubado recebido, mas não é para este usuário');
            console.log('🔒 [closePendingChoiceModal] eventUserId:', eventUserId, 'currentUserId:', currentUserId);
          }
        }
        
        // Verificar se é para este usuário (para outros casos)
        const eventUserId = typeof data.userId === 'string' ? parseInt(data.userId, 10) : Number(data.userId);
        const currentUserId = typeof user?.id === 'string' ? parseInt(user.id, 10) : Number(user?.id);
        const isForThisUser = !data.userId || eventUserId === currentUserId;
        
        if (isForThisDuel && isForThisUser) {
          console.log('🔒 [closePendingChoiceModal] ✅ Condições atendidas - fechando modais - motivo:', data.reason);
          
          // Se o motivo for 'choice_completed', fechar modais de Confiscation/ForcefulSentry/GracefulCharity
          const cardEffectTypeFromData = (data as any).cardEffectType;
          if (data.reason === 'choice_completed') {
            if (cardEffectTypeFromData === 'confiscation' || cardEffectType === 'confiscation') {
              console.log('🔒 [closePendingChoiceModal] Fechando modal Confiscation (choice_completed)');
              setShowOpponentHandRevealed(false);
              setOpponentHandRevealed([]);
              setCardEffectType(null);
            }
            if (cardEffectTypeFromData === 'forcefulSentry' || cardEffectType === 'forcefulSentry') {
              console.log('🔒 [closePendingChoiceModal] Fechando modal ForcefulSentry (choice_completed)');
              setShowOpponentHandRevealed(false);
              setOpponentHandRevealed([]);
              setCardEffectType(null);
            }
            if (cardEffectTypeFromData === 'gracefulCharity' || showGracefulCharityModal) {
              console.log('🔒 [closePendingChoiceModal] Fechando modal GracefulCharity (choice_completed)');
              setShowGracefulCharityModal(false);
              setGracefulCharityHand([]);
              setSelectedGracefulCharityCards([]);
            }
          }
          
          // NÃO fechar modais de Confiscation, GracefulCharity e ForcefulSentry em outros casos (exceto choice_completed)
          // Esses modais só fecham quando pendingChoice vira null (escolha confirmada) ou quando reason é choice_completed
          // Fechar apenas outros modais que não são de seleção obrigatória
          if (showMonsterRebornModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal MonsterReborn');
            setShowMonsterRebornModal(false);
            setMonsterRebornData(null);
            setSelectedMonsterReborn(null);
          }
          if (showDmocEndPhaseModal || cardEffectTypeFromData === 'dark_magician_of_chaos') {
            setShowDmocEndPhaseModal(false);
            setDmocSpellOptions([]);
            setSelectedDmocSpellIndex(null);
          }
          if (
            showMagiciansRodSearchModal ||
            cardEffectTypeFromData === 'magicians_rod_search'
          ) {
            setShowMagiciansRodSearchModal(false);
            setMagiciansRodDeckOptions([]);
            setSelectedMagiciansRodDeckIndex(null);
          }
          if (showMagiciansRodGyModal || cardEffectTypeFromData === 'magicians_rod_gy') {
            setShowMagiciansRodGyModal(false);
            setMagiciansRodTributeOptions([]);
            setSelectedMagiciansRodTribute(null);
          }
          if (
            showMagiciansSalvationEternalSoulModal ||
            cardEffectTypeFromData === 'magicians_salvation_eternal_soul'
          ) {
            setShowMagiciansSalvationEternalSoulModal(false);
            setMagiciansSalvationDeckOptions([]);
            setSelectedMagiciansSalvationDeckIndex(null);
          }
          if (
            showMagiciansSalvationPairModal ||
            cardEffectTypeFromData === 'magicians_salvation_pair'
          ) {
            setShowMagiciansSalvationPairModal(false);
            setMagiciansSalvationPairData(null);
          }
          if (
            showSkilledDarkMagicianModal ||
            cardEffectTypeFromData === 'skilled_dark_magician'
          ) {
            setShowSkilledDarkMagicianModal(false);
            setSkilledDarkMagicianOptions([]);
            setSelectedSkilledDarkMagician(null);
          }
          if (showPrematureBurialModal) {
            setShowPrematureBurialModal(false);
            setPrematureBurialGraveyard([]);
            setSelectedPrematureBurialIndex(null);
          }
          if (showChaosSorcererModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal ChaosSorcerer');
            setShowChaosSorcererModal(false);
            setChaosSorcererData(null);
            setSelectedLightMonster(null);
            setSelectedDarkMonster(null);
          }
          if (showRedEyesDarknessMetalDragonModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Red-Eyes Darkness Metal Dragon');
            setShowRedEyesDarknessMetalDragonModal(false);
            setRedEyesDarknessMetalDragonData(null);
            setSelectedDragonToBanish(null);
          }
          if (showRedEyesDarknessMetalDragonEffectModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal de efeito do Red-Eyes Darkness Metal Dragon');
            setShowRedEyesDarknessMetalDragonEffectModal(false);
            setRedEyesDarknessMetalDragonEffectData(null);
            setSelectedDragonSource(null);
            setSelectedDragonIndex(null);
            setSelectedDragonId(null);
          }
          if (showCyberSteinModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Cyber-Stein');
            setShowCyberSteinModal(false);
            setCyberSteinData(null);
            setSelectedCyberSteinMonster(null);
          }
          if (showDarkArmedDragonEffectModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Dark Armed Dragon');
            setShowDarkArmedDragonEffectModal(false);
            setDarkArmedDragonEffectData(null);
            setSelectedDarkMonsterToBanish(null);
            setSelectedCardToDestroy(null);
          }
          if (showChangeOfHeartModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal ChangeOfHeart');
            setShowChangeOfHeartModal(false);
            setChangeOfHeartData(null);
            setSelectedChangeOfHeartMonster(null);
          }
          if (showBrainControlModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal BrainControl');
            setShowBrainControlModal(false);
            setBrainControlData(null);
            setSelectedBrainControlMonster(null);
          }
          if (showMysticalSpaceTyphoonModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Mystical Space Typhoon');
            setShowMysticalSpaceTyphoonModal(false);
            setMysticalSpaceTyphoonData(null);
            setSelectedMSTTarget(null);
            setIsSelectingMSTTarget(false);
          }
          if (showSoulTakerModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal SoulTaker');
            setShowSoulTakerModal(false);
            setSoulTakerData(null);
            setSelectedSoulTakerMonster(null);
          }
          if (showPlayerTargetSpellModal) {
            setShowPlayerTargetSpellModal(false);
            setPlayerTargetSpellData(null);
            setPlayerTargetSpellPick(null);
          }
          if (showLightningStormModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Lightning Storm');
            setShowLightningStormModal(false);
          }
          if (showExiledForceModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Exiled Force');
            setShowExiledForceModal(false);
            setExiledForceData(null);
            setSelectedExiledForceMonster(null);
          }
          if (showUnitedWeStandModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal UnitedWeStand');
            setShowUnitedWeStandModal(false);
            setUnitedWeStandData(null);
            setSelectedUnitedWeStandMonster(null);
          }
          if (showMagePowerModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal MagePower');
            setShowMagePowerModal(false);
            setMagePowerData(null);
            setSelectedMagePowerMonster(null);
          }
          
          // Fechar modal de informações da carta quando o turno é roubado
          if (selectedCardInfo) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal de informações da carta');
            setSelectedCardInfo(null);
          }
          
          // NÃO limpar pendingChoice se for Confiscation, GracefulCharity ou ForcefulSentry
          // Esses modais devem permanecer abertos até que a escolha seja feita
          const isSelectionRequired = currentPendingChoice && (
            currentPendingChoice.type === 'CONFISCATION' ||
            currentPendingChoice.type === 'GRACEFUL_CHARITY' ||
            currentPendingChoice.type === 'FORCEFUL_SENTRY'
          );
          
          if (data.reason === 'choice_completed') {
            justResolvedChoiceRef.current = currentPendingChoice ? { type: currentPendingChoice.type, at: Date.now() } : null;
            setCurrentPendingChoice(null);
          } else if (!isSelectionRequired) {
            setCurrentPendingChoice(null);
          } else {
            console.log('⚠️ [closePendingChoiceModal] Mantendo pendingChoice ativo para modal de seleção obrigatória:', currentPendingChoice.type);
          }
        } else {
          console.log('🔒 [closePendingChoiceModal] ⚠️ Condições NÃO atendidas - NÃO fechando modais');
          console.log('🔒 [closePendingChoiceModal] isForThisDuel:', isForThisDuel, 'isForThisUser:', isForThisUser);
        }
      };
      socket.on('closePendingChoiceModal', closePendingChoiceModalListener);
      console.log('✅ [DuelArena] Listener closePendingChoiceModal registrado');
      
      // Perda de conexão: overlay; em `connect` / `reconnect`, reentrar na sala e aguardar duelUpdate.
      socket.on('disconnect', disconnectListener);
      socket.on('connect', resyncJoinAfterReconnect);
      socket.on('reconnect', resyncJoinAfterReconnect);
      
      // Verificar se o listener foi registrado corretamente
      if (typeof socket.hasListeners === 'function') {
        const hasListener = socket.hasListeners('gracefulCharityShowHand');
        console.log('🔍 [DuelArena] Listener gracefulCharityShowHand está registrado?', hasListener);
      }

      console.log('✅ [DuelArena] Listeners registrados: forcefulSentryShowHand, confiscationShowHand, gracefulCharityShowHand e closePendingChoiceModal');
      
      // Teste: verificar se o socket está ouvindo o evento (se o método existir)
      if (typeof socket.hasListeners === 'function') {
        console.log('🔍 [DuelArena] Socket listeners ativos:', {
          hasForcefulSentry: socket.hasListeners('forcefulSentryShowHand'),
          hasConfiscation: socket.hasListeners('confiscationShowHand'),
          socketId: socket.id,
          connected: socket.connected
        });
      } else {
        console.log('🔍 [DuelArena] Socket info:', {
          socketId: socket.id,
          connected: socket.connected,
          listenersRegistered: 'forcefulSentryShowHand e confiscationShowHand'
        });
      }
      
      // Cleanup será feito no return do useEffect
      
      // Entrar na room do duelo via WebSocket (carregamento instantâneo)
      const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
      const numericUserId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      
      joinDuelRoom(duelIdStr, numericUserId);
      
      return true;
    };

    // Aguardar um pouco para o useSocket inicializar o socket
    // Isso é especialmente importante quando a página abre em uma nova aba
    let retryInterval: NodeJS.Timeout | null = null;
    let connectListener: (() => void) | null = null;
    
    const markAsInitialized = () => {
      hasInitializedRef.current = true;
      initializedDuelIdRef.current = duelId;
      initializedUserIdRef.current = user?.id;
      console.log('✅ [DuelArena] Marcado como inicializado');
    };
    
    const initTimeout = setTimeout(() => {
      // Tentar configurar imediatamente
      if (setupSocket()) {
        markAsInitialized();
        return;
      }
      
      // Se o socket existe mas não está conectado, aguardar evento de conexão
      const currentSocket = getSocket();
      if (currentSocket && !currentSocket.connected) {
        connectListener = () => {
          if (setupSocket() && currentSocket && connectListener) {
            markAsInitialized();
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
        };
        currentSocket.on('connect', connectListener);
      }
      
      // Também iniciar retry como fallback
      let attempts = 0;
      const maxAttempts = 20;
      
      retryInterval = setInterval(() => {
        attempts++;
        
        if (setupSocket()) {
          markAsInitialized();
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          const currentSocket = getSocket();
          if (currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
        } else if (attempts >= maxAttempts) {
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          const currentSocket = getSocket();
          if (currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
          setError('WebSocket não conectado. Aguarde alguns segundos e recarregue a página.');
          setLoading(false);
        }
      }, 500);
    }, 100);
    
    // Cleanup
    return () => {
      // NÃO resetar os refs no cleanup - eles devem persistir entre re-renders
      // Só limpar os listeners e timers
      clearTimeout(initTimeout);
      if (retryInterval) {
        clearInterval(retryInterval);
      }
      const currentSocket = getSocket();
      if (currentSocket) {
        currentSocket.off('duelUpdate', handleDuelUpdate);
        currentSocket.off('duelError', handleDuelError);
        currentSocket.off('duelEnded');
        currentSocket.off('timeExpired');
        currentSocket.off('needsDiscard');
        currentSocket.off('attackSucceeded');
        currentSocket.off('disconnect', disconnectListener);
        currentSocket.off('connect', resyncJoinAfterReconnect);
        currentSocket.off('reconnect', resyncJoinAfterReconnect);
        // Remover listener de conexão se ainda estiver ativo
        if (connectListener) {
          currentSocket.off('connect', connectListener);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId, user?.id]);

  // NOTA: Removido useEffect que fechava modais automaticamente
  // O fechamento dos modais agora é feito apenas via:
  // 1. Listener closePendingChoiceModal (quando turno é roubado/muda)
  // 2. handleDuelUpdate (quando pendingChoice é null ou não é do usuário)
  // Isso evita interferir na abertura dos modais

  // Verificar e restaurar modais quando currentPendingChoice mudar ou quando o componente montar
  useEffect(() => {
    if (!currentPendingChoice || !user?.id) {
      return;
    }

    // Comparar IDs convertendo ambos para número para garantir compatibilidade
    const pendingUserId = typeof currentPendingChoice.userId === 'string' ? parseInt(currentPendingChoice.userId, 10) : Number(currentPendingChoice.userId);
    const myUserId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    const isMyChoice = pendingUserId === myUserId;
    
    if (!isMyChoice) {
      console.log(`⚠️ [useEffect pendingChoice] Não é minha escolha - pendingUserId: ${pendingUserId}, myUserId: ${myUserId}`);
      return;
    }

    console.log(`🔍 [useEffect pendingChoice] Verificando se precisa restaurar modal:`, currentPendingChoice.type, {
      hasData: !!currentPendingChoice.data,
      opponentHandLength: currentPendingChoice.data?.opponentHand?.length,
      playerHandLength: currentPendingChoice.data?.playerHand?.length
    });

    // Restaurar modais baseado no tipo de pendingChoice
    if (currentPendingChoice.type === 'CONFISCATION' && currentPendingChoice.data?.opponentHand) {
      console.log(`✅ [useEffect pendingChoice] Restaurando modal Confiscation com ${currentPendingChoice.data.opponentHand.length} cartas`);
      setOpponentHandRevealed(currentPendingChoice.data.opponentHand);
      setShowOpponentHandRevealed(true);
      setCardEffectType('confiscation');
    } else if (currentPendingChoice.type === 'GRACEFUL_CHARITY' && currentPendingChoice.data?.playerHand) {
      console.log(`✅ [useEffect pendingChoice] Restaurando modal GracefulCharity com ${currentPendingChoice.data.playerHand.length} cartas`);
      setGracefulCharityHand(currentPendingChoice.data.playerHand);
      setShowGracefulCharityModal(true);
      setSelectedGracefulCharityCards([]);
    } else if (currentPendingChoice.type === 'FORCEFUL_SENTRY' && currentPendingChoice.data?.opponentHand) {
      console.log(`✅ [useEffect pendingChoice] Restaurando modal ForcefulSentry com ${currentPendingChoice.data.opponentHand.length} cartas`);
      setOpponentHandRevealed(currentPendingChoice.data.opponentHand);
      setShowOpponentHandRevealed(true);
      setCardEffectType('forcefulSentry');
    } else if (currentPendingChoice.type === 'MYSTICAL_SPACE_TYPHOON') {
      // Restaurar modal do Mystical Space Typhoon
      console.log(`✅ [useEffect pendingChoice] Restaurando modal Mystical Space Typhoon`);
      
      // Coletar spell/trap do campo atual (próprio e oponente)
      const playerSpellTrapsArray: Array<{ card: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];
      const opponentSpellTrapsArray: Array<{ card: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];
      
      // Coletar do próprio campo
      if (mySpellTraps && Array.isArray(mySpellTraps)) {
        mySpellTraps.forEach((card: any, index: number) => {
          if (card && card !== null) {
            // Não incluir a própria Mystical Space Typhoon se estiver no campo
            const cardId = card.idCarta || card.id || card.cardId;
            const isMST = cardId === 'MysticalSpaceTyphoon' || 
                         cardId === 'mysticalspacetyphoon' ||
                         (typeof cardId === 'string' && cardId.toLowerCase().includes('mysticalspacetyphoon'));
            if (!isMST) {
              playerSpellTrapsArray.push({ card, zoneIndex: index, player: 'player' });
            }
          }
        });
      }
      
      // Coletar do campo do oponente
      // CRÍTICO: Usar o estado opponentSpellTraps do componente (linha 436), não o array que está sendo construído
      // O estado opponentSpellTraps vem das props/dados do duelo
      const opponentSpellTrapsFromState = opponentSpellTraps; // Estado do componente (linha 436)
      if (opponentSpellTrapsFromState && Array.isArray(opponentSpellTrapsFromState)) {
        opponentSpellTrapsFromState.forEach((card: any, index: number) => {
          if (card && card !== null) {
            opponentSpellTrapsArray.push({ card, zoneIndex: index, player: 'opponent' });
          }
        });
      }
      
      const spellTrapZoneIndex = currentPendingChoice.data?.zoneIndex ?? null;
      
      console.log(`✅ [useEffect pendingChoice] Mystical Space Typhoon - playerSpellTraps: ${playerSpellTrapsArray.length}, opponentSpellTraps: ${opponentSpellTrapsArray.length}`);
      
      // Se ambas as listas estão vazias, a ação já foi processada (ex: MST destruiu a última spell) — não reabrir modal para evitar "Nenhuma carta encontrada"
      if (playerSpellTrapsArray.length === 0 && opponentSpellTrapsArray.length === 0) {
        console.log('✅ [useEffect pendingChoice] MST: listas vazias (ação já processada) - fechando modal');
        setShowMysticalSpaceTyphoonModal(false);
        setMysticalSpaceTyphoonData(null);
        setSelectedMSTTarget(null);
      } else {
        setMysticalSpaceTyphoonData({
          playerSpellTraps: playerSpellTrapsArray,
          opponentSpellTraps: opponentSpellTrapsArray,
          spellTrapZoneIndex: spellTrapZoneIndex,
        });
        setShowMysticalSpaceTyphoonModal(true);
        setSelectedMSTTarget(null);
      }
    } else {
      console.warn(`⚠️ [useEffect pendingChoice] Tipo de pendingChoice desconhecido ou dados faltando:`, currentPendingChoice);
    }
  }, [currentPendingChoice, user?.id, mySpellTraps, opponentSpellTraps]);

  // Debug: verificar estados do Confiscation
  useEffect(() => {
    if (showOpponentHandRevealed || cardEffectType === 'confiscation' || opponentHandRevealed.length > 0) {
      console.log('🔍 [Debug Confiscation] Estados atuais:', {
        showOpponentHandRevealed,
        cardEffectType,
        opponentHandRevealedLength: opponentHandRevealed.length,
        opponentHandRevealed: opponentHandRevealed,
        shouldShowModal: showOpponentHandRevealed && cardEffectType === 'confiscation',
        selectedConfiscationCard: !!selectedConfiscationCard,
        selectedCardName: selectedConfiscationCard?.card?.name
      });
    }
  }, [showOpponentHandRevealed, cardEffectType, opponentHandRevealed, selectedConfiscationCard]);

  // Atualizar dados do duelFound se vier do WebSocket
  useEffect(() => {
    if (duelFound) {
      setMyLifePoints(duelFound.lifePoints);
      setOpponentLifePoints(duelFound.opponentLifePoints);
      previousMyLifePoints.current = duelFound.lifePoints;
      previousOpponentLifePoints.current = duelFound.opponentLifePoints;
      setIsMyTurn(duelFound.yourTurn);
      
      // Atualizar deck e mão se vierem no duelFound
      const userId = typeof user?.id === 'string' ? parseInt(user?.id, 10) : Number(user?.id);
      
      // Usar player1Id e player2Id do duelFound se disponíveis, senão do duelData
      const player1Id = duelFound.player1Id 
        ? (typeof duelFound.player1Id === 'string' ? parseInt(duelFound.player1Id, 10) : Number(duelFound.player1Id))
        : (duelData?.player1?.id ? (typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id)) : null);
      const player2Id = duelFound.player2Id 
        ? (typeof duelFound.player2Id === 'string' ? parseInt(duelFound.player2Id, 10) : Number(duelFound.player2Id))
        : (duelData?.player2?.id ? (typeof duelData.player2.id === 'string' ? parseInt(duelData.player2.id, 10) : Number(duelData.player2.id)) : null);
      
      console.log(`🔍 [DuelArena] Processando duelFound - userId: ${userId}, player1Id: ${player1Id}, player2Id: ${player2Id}`);
      console.log(`🔍 [DuelArena] duelFound.player1Field:`, duelFound.player1Field ? `${duelFound.player1Field.deck?.length || 0} cartas no deck, ${duelFound.player1Field.hand?.length || 0} na mão` : 'não existe');
      console.log(`🔍 [DuelArena] duelFound.player2Field:`, duelFound.player2Field ? `${duelFound.player2Field.deck?.length || 0} cartas no deck, ${duelFound.player2Field.hand?.length || 0} na mão` : 'não existe');
      
      // Sempre processar ambos os campos se disponíveis
      if (duelFound.player1Field && duelFound.player2Field) {
        if (userId === player1Id) {
          // É player1
          setMyDeck(duelFound.player1Field.deck || []);
          setMyHand(duelFound.player1Field.hand || []);
          setMyExtraDeck(duelFound.player1Field.extraDeck || []);
          setOpponentDeck(duelFound.player2Field.deck || []);
          setOpponentHand(duelFound.player2Field.hand || []);
          setOpponentExtraDeck(duelFound.player2Field.extraDeck || []);
          console.log(`✅ [DuelArena] Player1 - Meu deck: ${duelFound.player1Field.deck?.length || 0}, Extra Deck: ${duelFound.player1Field.extraDeck?.length || 0}, Oponente deck: ${duelFound.player2Field.deck?.length || 0}`);
        } else if (userId === player2Id) {
          // É player2
          setMyDeck(duelFound.player2Field.deck || []);
          setMyHand(duelFound.player2Field.hand || []);
          setMyExtraDeck(duelFound.player2Field.extraDeck || []);
          setOpponentDeck(duelFound.player1Field.deck || []);
          setOpponentHand(duelFound.player1Field.hand || []);
          setOpponentExtraDeck(duelFound.player1Field.extraDeck || []);
          console.log(`✅ [DuelArena] Player2 - Meu deck: ${duelFound.player2Field.deck?.length || 0}, Extra Deck: ${duelFound.player2Field.extraDeck?.length || 0}, Oponente deck: ${duelFound.player1Field.deck?.length || 0}`);
        } else {
          console.warn(`⚠️ [DuelArena] userId (${userId}) não corresponde a player1Id (${player1Id}) nem player2Id (${player2Id})`);
        }
      } else {
        console.warn(`⚠️ [DuelArena] duelFound não tem player1Field ou player2Field completo`);
      }
    }
  }, [duelFound, duelData, user?.id]);

  // Fonte da verdade para turno e fase: duelData (atualizado por duelUpdate).
  // Garante que isMyTurn e currentPhase reflitam sempre o último estado do duelo.
  useEffect(() => {
    if (!duelData || !user?.id) return;
    const player1Id = duelData.player1Id ?? (duelData.player1?.id ? (typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id)) : null);
    if (player1Id == null) return;
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    const isPlayer1 = userId === player1Id;
    const myTurnNumber = isPlayer1 ? 1 : 2;
    const turn = duelData.currentTurn ?? currentTurn;
    if (turn != null) {
      setIsMyTurn(turn === myTurnNumber);
    }
    if (duelData.currentPhase) {
      setCurrentPhase(duelData.currentPhase);
    }
  }, [duelData, currentTurn, user?.id]);

  // Escutar atualizações do duelo (quando comprar carta, etc)
  // Usar useRef para evitar loops de renderização
  const processedUpdatesRef = useRef<Set<string>>(new Set());
  
  // Removido: detecção automática de ataques via logs - animação só aparece quando o jogador ataca diretamente
  
  useEffect(() => {
    if (!duelUpdate || !user?.id) {
      return;
    }
    
    // Verificar se os campos estão presentes - se não estiverem, ignorar
    // Mas permitir processar se pelo menos um campo estiver presente (pode ser update parcial)
    if (!duelUpdate.player1Field && !duelUpdate.player2Field) {
      console.warn(`⚠️ [handleDuelUpdate] Update sem campos - ignorando`);
      return; // Ignorar updates sem campos
    }
    
    // Log para debug
    console.log(`📥 [handleDuelUpdate] Recebido update - player1Field: ${!!duelUpdate.player1Field}, player2Field: ${!!duelUpdate.player2Field}`);
    
    // ID para deduplicar apenas o MESMO payload (evitar processar 2x o mesmo evento).
    // Incluir hand lengths para não ignorar updates com mesmo turno/fase/LP mas mão/campo diferentes.
    const p1HandLen = duelUpdate.player1Field?.hand?.length ?? -1;
    const p2HandLen = duelUpdate.player2Field?.hand?.length ?? -1;
    const updateId = `${duelUpdate.id || 'no-id'}-${duelUpdate.currentTurn ?? 0}-${duelUpdate.currentPhase ?? 'no-phase'}-${duelUpdate.player1LifePoints ?? 0}-${duelUpdate.player2LifePoints ?? 0}-${p1HandLen}-${p2HandLen}-${String(duelUpdate.status ?? '')}`;
    
    if (processedUpdatesRef.current.has(updateId)) {
      return;
    }
    processedUpdatesRef.current.add(updateId);
    
    // Limpar updates antigos (manter apenas os últimos 100)
    if (processedUpdatesRef.current.size > 100) {
      const firstKey = processedUpdatesRef.current.values().next().value;
      if (firstKey !== undefined) processedUpdatesRef.current.delete(firstKey);
    }
    
    // Atualizar life points
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      
    // Usar player1Id e player2Id do próprio duelUpdate (sempre presentes)
    const player1Id = duelUpdate.player1Id 
      ? (typeof duelUpdate.player1Id === 'string' ? parseInt(duelUpdate.player1Id, 10) : Number(duelUpdate.player1Id))
      : (duelUpdate.player1?.id ? (typeof duelUpdate.player1.id === 'string' ? parseInt(duelUpdate.player1.id, 10) : Number(duelUpdate.player1.id)) : null);
    
    const player2Id = duelUpdate.player2Id 
      ? (typeof duelUpdate.player2Id === 'string' ? parseInt(duelUpdate.player2Id, 10) : Number(duelUpdate.player2Id))
      : (duelUpdate.player2?.id ? (typeof duelUpdate.player2.id === 'string' ? parseInt(duelUpdate.player2.id, 10) : Number(duelUpdate.player2.id)) : null);
    
    const isPlayer1 = player1Id ? userId === player1Id : false;
    const isSpectatorUpdate =
      player1Id != null &&
      player2Id != null &&
      userId !== player1Id &&
      userId !== player2Id;
    // Espectador: P1 no topo (my*), P2 embaixo (opponent*) — alinhado ao layout admin
    const mapAsPlayer1 = isPlayer1 || isSpectatorUpdate;
    
    console.log(`🔍 [handleDuelUpdate] userId: ${userId}, player1Id: ${player1Id}, player2Id: ${player2Id}, isPlayer1: ${isPlayer1}, spectator: ${isSpectatorUpdate}`);
    console.log(`🔍 [handleDuelUpdate] player1Field:`, duelUpdate.player1Field ? `${duelUpdate.player1Field.deck?.length || 0} cartas no deck, ${duelUpdate.player1Field.hand?.length || 0} na mão` : 'não existe');
    console.log(`🔍 [handleDuelUpdate] player2Field:`, duelUpdate.player2Field ? `${duelUpdate.player2Field.deck?.length || 0} cartas no deck, ${duelUpdate.player2Field.hand?.length || 0} na mão` : 'não existe');
    
    // SEMPRE processar ambos os campos se disponíveis
    if (duelUpdate.player1Field && duelUpdate.player2Field) {
      const player1Deck = duelUpdate.player1Field.deck || [];
      const player1Hand = duelUpdate.player1Field.hand || [];
      const player1Graveyard = duelUpdate.player1Field.graveyard || [];
      const player1ExtraDeck = duelUpdate.player1Field.extraDeck || [];
      const player1Banished = duelUpdate.player1Field.banished || [];
      
      // Debug: Verificar se cardImage está presente nas cartas
      if (player1Hand.length > 0) {
        const firstCard = player1Hand[0];
        console.log(`🔍 [handleDuelUpdate] Primeira carta da mão Player1:`, {
          name: firstCard?.name,
          idCarta: firstCard?.idCarta,
          hasCardImage: !!firstCard?.cardImage,
          cardImage: firstCard?.cardImage,
        });
      }
      if (player1ExtraDeck.length > 0) {
        const firstExtraCard = player1ExtraDeck[0];
        console.log(`🔍 [handleDuelUpdate] Primeira carta do Extra Deck Player1:`, {
          name: firstExtraCard?.name,
          idCarta: firstExtraCard?.idCarta,
          hasCardImage: !!firstExtraCard?.cardImage,
          cardImage: firstExtraCard?.cardImage,
        });
      }
      // Garantir que monsters e spellTraps sejam arrays de 5 elementos
      const player1MonstersRaw = duelUpdate.player1Field.monsters || [];
      const player1Monsters = Array.isArray(player1MonstersRaw) 
        ? [...player1MonstersRaw, ...Array(5 - player1MonstersRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      const player1SpellTrapsRaw = duelUpdate.player1Field.spellTrap || duelUpdate.player1Field.spellTraps || [];
      const player1SpellTraps = Array.isArray(player1SpellTrapsRaw)
        ? [...player1SpellTrapsRaw, ...Array(5 - player1SpellTrapsRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      
      const player2Deck = duelUpdate.player2Field.deck || [];
      const player2Hand = duelUpdate.player2Field.hand || [];
      const player2Graveyard = duelUpdate.player2Field.graveyard || [];
      const player2ExtraDeck = duelUpdate.player2Field.extraDeck || [];
      const player2Banished = duelUpdate.player2Field.banished || [];
      // Garantir que monsters e spellTraps sejam arrays de 5 elementos
      const player2MonstersRaw = duelUpdate.player2Field.monsters || [];
      const player2Monsters = Array.isArray(player2MonstersRaw)
        ? [...player2MonstersRaw, ...Array(5 - player2MonstersRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      const player2SpellTrapsRaw = duelUpdate.player2Field.spellTrap || duelUpdate.player2Field.spellTraps || [];
      const player2SpellTraps = Array.isArray(player2SpellTrapsRaw)
        ? [...player2SpellTrapsRaw, ...Array(5 - player2SpellTrapsRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      
      if (mapAsPlayer1) {
        // Player1 / espectador: my* = P1 (topo), opponent* = P2 (baixo)
        // Detectar dano recebido
        const newMyLP = duelUpdate.player1LifePoints;
        const newOpponentLP = duelUpdate.player2LifePoints;
        const myLPChange = previousMyLifePoints.current - newMyLP;
        const opponentLPChange = previousOpponentLifePoints.current - newOpponentLP;
        
        // Detectar apenas mudanças de life points para mostrar dano (sem animação de ataque)
        if (opponentLPChange > 0) {
          setOpponentDamage(opponentLPChange);
          setTimeout(() => setOpponentDamage(null), 1000);
        }
        
        if (myLPChange > 0) {
          setMyDamage(myLPChange);
          setTimeout(() => setMyDamage(null), 1000);
        }
        
        previousMyLifePoints.current = newMyLP;
        previousOpponentLifePoints.current = newOpponentLP;
        
        setMyLifePoints(newMyLP);
        setOpponentLifePoints(newOpponentLP);
        setMyDeck(player1Deck);
        setMyHand(player1Hand);
        setMyGraveyard(player1Graveyard);
        setMyExtraDeck(player1ExtraDeck);
        setMyBanished(player1Banished);
        
        // Detectar invocação no campo P1
        const newMonsters = player1Monsters;
        const isMyFieldSummon = true; // este bloco é sempre "meu" campo
        for (let i = 0; i < newMonsters.length; i++) {
          if (newMonsters[i] && !previousMonstersRef.current[i]) {
            const name = newMonsters[i].name || newMonsters[i].cardName || 'Monstro';
            setSummonCardName(name);
            setShowSummonOverlay(true);
            if (isMyFieldSummon && /slifer\s+the\s+sky\s+dragon/i.test(name || '')) {
              if (sliferAnimationTimeoutRef.current) clearTimeout(sliferAnimationTimeoutRef.current);
              setShowSliferAnimation(true);
              sliferAnimationTimeoutRef.current = setTimeout(() => {
                setShowSliferAnimation(false);
                sliferAnimationTimeoutRef.current = null;
              }, 4500);
            }
            setTimeout(() => {
              setShowSummonOverlay(false);
            }, 500);
            break;
          }
        }
        setMyMonsters(newMonsters);
        previousMonstersRef.current = newMonsters;
        previousOpponentMonstersRef.current = player2Monsters;
        
        setMySpellTraps(player1SpellTraps);
        setOpponentDeck(player2Deck);
        setOpponentHand(player2Hand);
        setOpponentGraveyard(player2Graveyard);
        setOpponentExtraDeck(player2ExtraDeck);
        setOpponentBanished(player2Banished);
        setOpponentMonsters(player2Monsters);
        setOpponentSpellTraps(player2SpellTraps);
        // Atualizar flag de invocação normal
        const newNormalSummonUsed = duelUpdate.player1Field?.normalSummonUsed === true;
        setNormalSummonUsed(newNormalSummonUsed);
        console.log(`✅ [handleDuelUpdate] Player1/spec - normalSummonUsed: ${newNormalSummonUsed}, P1 deck: ${player1Deck.length}, P2 deck: ${player2Deck.length}`);
      } else {
        // É player2 - meu campo é player2Field, oponente é player1Field
        // Detectar dano recebido
        const newMyLP = duelUpdate.player2LifePoints;
        const newOpponentLP = duelUpdate.player1LifePoints;
        const myLPChange = previousMyLifePoints.current - newMyLP;
        const opponentLPChange = previousOpponentLifePoints.current - newOpponentLP;
        
        // Detectar apenas mudanças de life points para mostrar dano (sem animação de ataque)
        if (opponentLPChange > 0) {
          setOpponentDamage(opponentLPChange);
          setTimeout(() => setOpponentDamage(null), 1000);
        }
        
        if (myLPChange > 0) {
          setMyDamage(myLPChange);
          setTimeout(() => setMyDamage(null), 1000);
        }
        
        previousMyLifePoints.current = newMyLP;
        previousOpponentLifePoints.current = newOpponentLP;
        
        setMyLifePoints(newMyLP);
        setOpponentLifePoints(newOpponentLP);
        setMyDeck(player2Deck);
        setMyHand(player2Hand);
        setMyGraveyard(player2Graveyard);
        setMyExtraDeck(player2ExtraDeck);
        setMyBanished(player2Banished);
        
        // Detectar invocação no MEU campo (sou player2 → meu campo é player2Monsters)
        const newMonsters = player2Monsters;
        const isMyFieldSummon = true; // este bloco é sempre "meu" campo
        for (let i = 0; i < newMonsters.length; i++) {
          if (newMonsters[i] && !previousMonstersRef.current[i]) {
            const name = newMonsters[i].name || newMonsters[i].cardName || 'Monstro';
            setSummonCardName(name);
            setShowSummonOverlay(true);
            if (isMyFieldSummon && /slifer\s+the\s+sky\s+dragon/i.test(name || '')) {
              if (sliferAnimationTimeoutRef.current) clearTimeout(sliferAnimationTimeoutRef.current);
              setShowSliferAnimation(true);
              sliferAnimationTimeoutRef.current = setTimeout(() => {
                setShowSliferAnimation(false);
                sliferAnimationTimeoutRef.current = null;
              }, 4500);
            }
            setTimeout(() => {
              setShowSummonOverlay(false);
            }, 500);
            break;
          }
        }
        setMyMonsters(newMonsters);
        previousMonstersRef.current = newMonsters;
        previousOpponentMonstersRef.current = player1Monsters;
        
        setMySpellTraps(player2SpellTraps);
        setOpponentDeck(player1Deck);
        setOpponentHand(player1Hand);
        setOpponentGraveyard(player1Graveyard);
        setOpponentExtraDeck(player1ExtraDeck);
        setOpponentBanished(player1Banished);
        setOpponentMonsters(player1Monsters);
        setOpponentSpellTraps(player1SpellTraps);
        // Atualizar flag de invocação normal
        const newNormalSummonUsed = duelUpdate.player2Field?.normalSummonUsed === true;
        setNormalSummonUsed(newNormalSummonUsed);
        console.log(`✅ [handleDuelUpdate] Player2 - normalSummonUsed: ${newNormalSummonUsed}, Meu deck: ${player2Deck.length}, Oponente deck: ${player1Deck.length}`);
      }
    } else {
      console.warn(`⚠️ [handleDuelUpdate] Dados incompletos - player1Field: ${!!duelUpdate.player1Field}, player2Field: ${!!duelUpdate.player2Field}`);
    }
    
    // Atualizar fase
    if (duelUpdate.currentPhase) {
      const newPhase = duelUpdate.currentPhase;
      if (newPhase !== previousPhaseRef.current) {
        setCurrentPhase(newPhase);
        previousPhaseRef.current = newPhase;
        
        // Mostrar overlay de fase
        const phaseNames: { [key: string]: { main: string; sub: string } } = {
          DRAW: { main: 'DRAW PHASE', sub: 'Fase de Compras' },
          STANDBY: { main: 'STANDBY PHASE', sub: 'Fase de Apoio' },
          MAIN1: { main: 'MAIN PHASE 1', sub: 'Fase Principal 1' },
          BATTLE: { main: 'BATTLE PHASE', sub: 'Fase de Batalha' },
          MAIN2: { main: 'MAIN PHASE 2', sub: 'Fase Principal 2' },
          END: { main: 'END PHASE', sub: 'Fase Final' }
        };
        
        const phaseInfo = phaseNames[newPhase] || { main: newPhase, sub: '' };
        setPhaseOverlayText(phaseInfo.main);
        setPhaseOverlaySubtext(phaseInfo.sub);
        setShowPhaseOverlay(true);
        
        // Esconder após breve exibição
        setTimeout(() => {
          setShowPhaseOverlay(false);
        }, 600);
      }
    }
    
    // Atualizar tempo do duelo se vier na atualização
    if (duelUpdate.duelTime !== undefined) {
      setDuelTime(duelUpdate.duelTime);
      // Se temos createdAt mas não temos duelStartTime, calcular
      if (!duelStartTime && duelUpdate.createdAt) {
        const createdAt = new Date(duelUpdate.createdAt);
        setDuelStartTime(createdAt.getTime());
      }
    }
    
    // Atualizar tempo do turno se vier na atualização (sincronizar com o banco)
    if (duelUpdate.turnTime !== undefined && duelUpdate.turnTime > 0) {
      setTurnTimeLimit(duelUpdate.turnTime);
    }
    
    // Usar tempo restante calculado pelo backend se disponível
    if (duelUpdate.turnTimeRemaining !== undefined) {
      setTurnTimeLeft(duelUpdate.turnTimeRemaining);
      setTurnTimeRemainingFromServer(duelUpdate.turnTimeRemaining); // Armazenar tempo do servidor
    } else if (duelUpdate.turnTime !== undefined && duelUpdate.turnTime > 0) {
      // Se o turno mudou, resetar o timer para o novo valor
      if (duelUpdate.currentTurn && duelUpdate.currentTurn !== currentTurn) {
        setTurnTimeLeft(duelUpdate.turnTime);
        // NÃO resetar turnTimeRemainingFromServer aqui - aguardar atualização do servidor
        // O servidor sempre envia turnTimeRemaining quando disponível
      }
    }
    
    // Atualizar timestamp de quando o turno começou
    if (duelUpdate.turnStartedAt) {
      const startedAt = typeof duelUpdate.turnStartedAt === 'string' 
        ? new Date(duelUpdate.turnStartedAt) 
        : duelUpdate.turnStartedAt;
      setTurnStartedAt(startedAt);
    }
    
    // Atualizar turno (espectador nunca "é o seu turno")
    if (isSpectatorUpdate) {
      setIsMyTurn(false);
    } else if (duelUpdate.currentTurn && duelData?.player1) {
      const uid = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const p1 = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
      setIsMyTurn(duelUpdate.currentTurn === (uid === p1 ? 1 : 2));
    } else if (duelUpdate.currentTurn && duelUpdate.player1) {
      const uid = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const p1 = typeof duelUpdate.player1.id === 'string' ? parseInt(duelUpdate.player1.id, 10) : Number(duelUpdate.player1.id);
      setIsMyTurn(duelUpdate.currentTurn === (uid === p1 ? 1 : 2));
    }

    // Atualizar duelData para garantir que o componente renderize
    // Sempre atualizar duelData quando receber um update válido
    if (duelUpdate.id && duelUpdate.player1Field && duelUpdate.player2Field) {
      // Atualizar tempo restante se veio do backend (fonte da verdade)
      if (duelUpdate.turnTimeRemaining !== undefined) {
        console.log(`⏰ [handleDuelUpdate] Sincronizando tempo do banco: ${duelUpdate.turnTimeRemaining}s`);
        setTurnTimeLeft(duelUpdate.turnTimeRemaining);
        
        // Verificar se é o turno do jogador atual
        const isCurrentlyMyTurn =
          !isSpectatorUpdate &&
          ((isPlayer1 && duelUpdate.currentTurn === 1) || (!isPlayer1 && duelUpdate.currentTurn === 2));
        
        // O turnTimeRemaining sempre reflete o tempo do jogador que está jogando (currentTurn)
        // Se não é meu turno, então o turnTimeRemaining é do oponente
        // Armazenar o tempo restante do servidor (fonte da verdade para mostrar botão)
        setTurnTimeRemainingFromServer(duelUpdate.turnTimeRemaining);
        
        // Se o tempo expirou e não é meu turno, marcar para mostrar botão
        if (duelUpdate.turnTimeRemaining <= 0 && !isCurrentlyMyTurn) {
          setTimeExpired(true);
          console.log(`⏰ [handleDuelUpdate] Tempo do oponente expirou no banco: ${duelUpdate.turnTimeRemaining}s`);
        } else {
          setTimeExpired(false);
        }
      }
      
      // Atualizar turnStartedAt se veio
      if (duelUpdate.turnStartedAt) {
        const startTime = new Date(duelUpdate.turnStartedAt);
        setTurnStartedAt(startTime);
        turnStartedAtRef.current = startTime;
      }

      // Preservar player1/player2 (sleeve do oponente) se o update não trouxer, para não perder a sleeve
      const newDuelData = {
        id: duelUpdate.id,
        player1Id: duelUpdate.player1Id,
        player2Id: duelUpdate.player2Id,
        player1: duelUpdate.player1 ?? duelData?.player1,
        player2: duelUpdate.player2 ?? duelData?.player2,
        player1LifePoints: duelUpdate.player1LifePoints,
        player2LifePoints: duelUpdate.player2LifePoints,
        currentTurn: duelUpdate.currentTurn,
        currentPhase: duelUpdate.currentPhase,
        status: duelUpdate.status,
        createdAt: duelUpdate.createdAt,
        updatedAt: duelUpdate.updatedAt,
        player1Field: duelUpdate.player1Field,
        player2Field: duelUpdate.player2Field,
      };
      setDuelData(newDuelData);
      duelDataRef.current = newDuelData;
      
      // Garantir que loading seja false quando receber dados válidos
      setLoading(false);
      setError(null);
    } else if (duelUpdate.id) {
      // Mesmo que não tenha todos os campos, se tiver id, garantir que loading seja false
      // Isso evita que o loading fique infinito quando o duelUpdate não tem todos os campos
      console.log(`⚠️ [useEffect duelUpdate] DuelUpdate recebido mas campos incompletos - id: ${duelUpdate.id}, player1Field: ${!!duelUpdate.player1Field}, player2Field: ${!!duelUpdate.player2Field}`);
      setLoading(false);
    }
  }, [duelUpdate, duelData, user?.id, duelStartTime, currentTurn]);


  // Timer do Duelo - Atualiza o tempo total do duelo
  useEffect(() => {
    if (!duelData || loading) return;

    // Se não temos duelStartTime, calcular baseado no createdAt
    if (!duelStartTime && duelData.createdAt) {
      const createdAt = new Date(duelData.createdAt);
      setDuelStartTime(createdAt.getTime());
    }

    // Atualizar tempo a cada segundo
    const duelTimer = setInterval(() => {
      if (duelStartTime) {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - duelStartTime) / 1000);
        setDuelTime(elapsedSeconds);
        
        // Enviar atualização para o backend a cada 5 segundos
        if (elapsedSeconds % 5 === 0 && duelId) {
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('updateDuelTime', { duelId, timeInSeconds: elapsedSeconds });
          }
        }
      } else if (duelData.createdAt) {
        // Se ainda não temos duelStartTime, calcular agora
        const createdAt = new Date(duelData.createdAt);
        setDuelStartTime(createdAt.getTime());
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - createdAt.getTime()) / 1000);
        setDuelTime(elapsedSeconds);
      }
    }, 1000);

    return () => {
      clearInterval(duelTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelData, duelStartTime, loading, duelId]);

  // Atualizar refs quando os valores mudam
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
    duelIdRef.current = duelId;
    userIdRef.current = user?.id;
    turnStartedAtRef.current = turnStartedAt;
    turnTimeLimitRef.current = turnTimeLimit || 90;
  }, [isMyTurn, duelId, user?.id, turnStartedAt, turnTimeLimit]);
  
  // Atualizar refs dos modais sempre que os estados mudarem
  useEffect(() => {
    showOpponentHandRevealedRef.current = showOpponentHandRevealed;
    showGracefulCharityModalRef.current = showGracefulCharityModal;
    cardEffectTypeRef.current = cardEffectType;
  }, [showOpponentHandRevealed, showGracefulCharityModal, cardEffectType]);

  // Timer do Turno - Calcula baseado no timestamp do backend
  useEffect(() => {
    // Limpar timer anterior se existir
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }

    // Resetar estado de tempo expirado quando o turno muda
    setTimeExpired(false);
    // NÃO resetar turnTimeRemainingFromServer aqui - ele deve ser atualizado pelo handleDuelUpdate
    // que sempre recebe o tempo do jogador que está jogando (currentTurn)

    // Função para calcular tempo restante baseado no timestamp
    const calculateRemainingTime = (): number => {
      const currentTurnStartedAt = turnStartedAtRef.current;
      const currentTurnTimeLimit = turnTimeLimitRef.current;
      
      // Se não há timestamp, retornar o limite
      if (!currentTurnStartedAt) {
        return currentTurnTimeLimit;
      }
      
      const now = new Date();
      const startedAt = currentTurnStartedAt instanceof Date ? currentTurnStartedAt : new Date(currentTurnStartedAt);
      const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, currentTurnTimeLimit - elapsedSeconds);
      
      return remaining;
    };

    // Atualizar tempo inicial baseado no cálculo
    const initialTime = calculateRemainingTime();
    setTurnTimeLeft(initialTime);

    // Criar timer que recalcula baseado no timestamp
    // O timer deve rodar sempre, independente de ser o turno do jogador ou não
    const timer = setInterval(() => {
      const remaining = calculateRemainingTime();
      setTurnTimeLeft(remaining);
      
      // Verificar se o tempo expirou
      if (remaining <= 0) {
        // Se é o turno do oponente (não é meu turno), marcar como expirado para mostrar botão "Roubar Turno"
        if (!isMyTurnRef.current) {
          setTimeExpired(true);
          // Garantir que o botão apareça sem depender de update do servidor
          setTurnTimeRemainingFromServer(0);
        } else {
          // Se é meu turno, notificar o oponente que meu tempo expirou
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('timeExpired', { 
              duelId: duelIdRef.current, 
              userId: userIdRef.current 
            });
          }
          setTimeExpired(false); // Não mostrar botão para mim mesmo
        }
      } else {
        // Se ainda tem tempo, resetar timeExpired quando o tempo voltar significativamente
        if (timeExpired && remaining > 5) {
          setTimeExpired(false);
        }
      }
    }, 1000);
    
    setTurnTimer(timer);

    // Cleanup ao desmontar ou mudar turno
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnTimeLimit, turnStartedAt]);

  // Função para finalizar turno
  // Função para descartar uma carta individualmente (na fase END quando tem mais de 6 cartas)
  const handleDiscardCard = (card: any) => {
    if (isSpectator) return;
    // Verificações de segurança
    if (!duelId || !user?.id || normalizeDuelPhase(currentPhase) !== 'END' || myHand.length <= 6) return;
    if (isDiscarding) return; // Evitar múltiplos cliques
    
    const cardId = card.id || card.cardId || card.idCarta;
    if (!cardId) return;

    const cardIdStr = cardId.toString();
    
    // Marcar como descartando para evitar múltiplos cliques
    setIsDiscarding(true);
    
    // Descartar carta imediatamente para o cemitério
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('discardCard', { 
        duelId, 
        userId: user.id,
        cardId: cardIdStr
      });
    }
    
    // Resetar após um pequeno delay para permitir nova ação
    setTimeout(() => {
      setIsDiscarding(false);
    }, 500);
  };

  // Função para finalizar turno (só funciona na fase END)
  // Agora chama nextPhase que descarta automaticamente e avança o turno
  const handleEndTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    // Só permitir finalizar turno na fase END (comparar fase normalizada)
    if (normalizeDuelPhase(currentPhase) !== 'END') {
      return;
    }

    // O descarte será feito automaticamente pelo backend se tiver mais de 6 cartas
    // Usar nextPhase para manter consistência com o clique no botão da fase
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('nextPhase', { 
        duelId, 
        userId: user.id
      });
    }
    
    // Limpar seleção
    setSelectedCardsToDiscard([]);
    
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }
    setTimeExpired(false);
  };

  // Função para roubar turno quando o oponente está com tempo expirado
  const handleStealTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    // Fechar modal de informações da carta imediatamente
    if (selectedCardInfo) {
      console.log('🔒 [handleStealTurn] Fechando modal de informações da carta');
      setSelectedCardInfo(null);
    }

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('stealTurn', { duelId, userId: user.id });
      setTimeExpired(false);
    }
  };

  // Função helper para comparar cartas (mão / zoom — cópias iguais precisam de instanceId ou mesma referência)
  const isSameCard = (card1: any, card2: any): boolean => {
    if (!card1 || !card2) return false;
    if (card1 === card2) return true;
    if (card1.instanceId && card2.instanceId) return card1.instanceId === card2.instanceId;
    if (card1.instanceId || card2.instanceId) return false;

    if (card1.id && card2.id && card1.id === card2.id) return true;
    if (card1.cardId && card2.cardId && card1.cardId === card2.cardId) return true;
    if (card1.idCarta && card2.idCarta && card1.idCarta === card2.idCarta) return true;

    if (card1.id && card2.cardId && card1.id === card2.cardId) return true;
    if (card1.cardId && card2.id && card1.cardId === card2.id) return true;

    return false;
  };

  // Função auxiliar para acionar animação de colocação de carta no campo
  const triggerCardPlacementAnimation = (
    card: any,
    zoneIndex: number,
    isMonster: boolean,
    handIndex?: number,
  ): Promise<void> => {
    return new Promise((resolve) => {
      const slotMatches = (slot: any, played: any): boolean => {
        if (!slot || !played) return false;
        if (slot === played) return true;
        if (played.instanceId && slot.instanceId && slot.instanceId === played.instanceId) return true;
        return false;
      };

      let cardIndexInHand = -1;
      if (
        typeof handIndex === 'number' &&
        handIndex >= 0 &&
        handIndex < myHand.length &&
        slotMatches(myHand[handIndex], card)
      ) {
        cardIndexInHand = handIndex;
      }
      if (cardIndexInHand === -1 && card?.instanceId) {
        cardIndexInHand = myHand.findIndex((c) => c?.instanceId === card.instanceId);
      }
      if (cardIndexInHand === -1) {
        cardIndexInHand = myHand.findIndex((c) => c === card);
      }
      if (cardIndexInHand === -1) {
        cardIndexInHand = myHand.findIndex(
          (c) =>
            c.id === card.id ||
            c.cardId === card.cardId ||
            c.idCarta === card.idCarta,
        );
      }

      if (cardIndexInHand === -1) {
        resolve();
        return;
      }

      const updatedHand = myHand.filter((_, i) => i !== cardIndexInHand);
      setMyHand(updatedHand);

      // Usar requestAnimationFrame e setTimeout para garantir que o DOM esteja atualizado
      requestAnimationFrame(() => {
        setTimeout(() => {
          const handCardElement = document.querySelector(`[data-hand-card-index="${cardIndexInHand}"]`);
          
          // Se não encontrou o elemento (já foi removido), usar posição estimada baseada no índice
          let handRect: DOMRect;
          if (handCardElement && handCardElement instanceof HTMLElement) {
            handRect = handCardElement.getBoundingClientRect();
          } else {
            // Calcular posição estimada baseada no índice anterior
            const cardWidth = Math.max(100, Math.min(156, Math.floor(1240 / Math.max(updatedHand.length + 1, 1))));
            const cardHeight = Math.floor(cardWidth * 1.458);
            const handContainer = document.querySelector('[data-hand-container]');
            if (handContainer) {
              const containerRect = handContainer.getBoundingClientRect();
              const estimatedX = containerRect.left + (cardIndexInHand * cardWidth) + (cardWidth / 2);
              const estimatedY = containerRect.top + (cardHeight / 2);
              handRect = {
                left: estimatedX - cardWidth / 2,
                top: estimatedY - cardHeight / 2,
                width: cardWidth,
                height: cardHeight,
              } as DOMRect;
            } else {
              // Fallback: usar posição da parte inferior da tela
              handRect = {
                left: window.innerWidth / 2,
                top: window.innerHeight - 200,
                width: 120,
                height: 174,
              } as DOMRect;
            }
          }
          
          // Calcular posição no campo - procurar apenas no campo do jogador (parte inferior da tela)
          const fieldSelector = isMonster 
            ? `[data-monster-zone="${zoneIndex}"]`
            : `[data-spell-trap-zone="${zoneIndex}"]`;
          
          // Procurar todos os elementos com esse seletor e escolher o que está na parte inferior (campo do jogador)
          const allFieldElements = document.querySelectorAll(fieldSelector);
          let fieldElement: HTMLElement | null = null;
          
          if (allFieldElements.length > 0) {
            // Se houver múltiplos (campo do jogador e oponente), escolher o que está mais abaixo na tela
            let bottomMostElement: HTMLElement | null = null;
            let maxBottom = -1;
            
            allFieldElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                const rect = el.getBoundingClientRect();
                const bottom = rect.bottom;
                if (bottom > maxBottom) {
                  maxBottom = bottom;
                  bottomMostElement = el;
                }
              }
            });
            
            fieldElement = bottomMostElement;
          } else {
            // Se não encontrou, tentar novamente com querySelector (pode ser que só exista um)
            const singleElement = document.querySelector(fieldSelector);
            if (singleElement instanceof HTMLElement) {
              fieldElement = singleElement;
            }
          }
          
          let fieldRect: DOMRect;
          
          if (fieldElement && fieldElement instanceof HTMLElement) {
            fieldRect = fieldElement.getBoundingClientRect();
          } else {
            // Fallback: calcular posição estimada baseada na estrutura do campo
            // O campo do jogador está na parte inferior da tela
            // Assumir que há 5 slots espaçados horizontalmente
            const fieldCenterX = window.innerWidth / 2;
            const fieldCenterY = window.innerHeight * 0.65; // Campo do jogador está mais abaixo
            
            const slotWidth = isMonster ? 120 : 100;
            const slotHeight = isMonster ? 175 : 145;
            const totalWidth = slotWidth * 5;
            const startX = fieldCenterX - (totalWidth / 2) + (slotWidth / 2);
            const slotX = startX + (zoneIndex * slotWidth);
            
            fieldRect = {
              left: slotX - slotWidth / 2,
              top: fieldCenterY - slotHeight / 2,
              width: slotWidth,
              height: slotHeight,
            } as DOMRect;
          }
          
          // Iniciar animação
          setCardPlacementAnimation({
            card,
            fromPosition: {
              x: handRect.left + handRect.width / 2,
              y: handRect.top + handRect.height / 2,
              width: handRect.width,
              height: handRect.height,
            },
            toPosition: {
              x: fieldRect.left + fieldRect.width / 2,
              y: fieldRect.top + fieldRect.height / 2,
              width: fieldRect.width || (isMonster ? 120 : 100),
              height: fieldRect.height || (isMonster ? 175 : 145),
            },
          });
          
          // Resolver após a animação completar
          setTimeout(() => {
            setCardPlacementAnimation(null);
            resolve();
          }, 500); // Duração da animação
        }, 100); // Delay aumentado para garantir que o DOM esteja atualizado
      });
    });
  };

  // Função para colocar carta no campo
  const handlePlaceCardOnField = async (
    card: any,
    position: 'attack' | 'defense' | 'set',
    zoneIndex: number,
    cardType?: string,
    isDragged: boolean = false,
    handIndex?: number,
  ) => {
    if (isSpectator) return;
    if (!duelId || !user?.id || !isMyTurn) {
      alert('Não é seu turno!');
      return;
    }

    // Bloquear se ainda há invocação ou efeito em andamento (não permitir usar outra carta antes de concluir)
    if (hasActionInProgress) {
      alert('Termine a invocação ou o efeito em andamento antes de usar outra carta.');
      return;
    }

    // Se estiver em STANDBY e tentar invocar, mudar automaticamente para MAIN1
    if (currentPhase === 'STANDBY') {
      console.log(`🔄 [handlePlaceCardOnField] Tentativa de invocar na STANDBY - mudando automaticamente para MAIN1`);
      const socket = getSocket();
      if (socket && socket.connected) {
        // Mudar para MAIN1 e continuar com a invocação
        // O backend vai validar se a fase está correta
        socket.emit('goToPhase', { duelId, userId: user.id, targetPhase: 'MAIN1' });
        // Aguardar um pouco para o backend processar a mudança de fase
        await new Promise(resolve => setTimeout(resolve, 80));
        // Continuar com a invocação - o backend vai validar a fase
      } else {
        alert('Erro: Socket não conectado. Não foi possível mudar a fase.');
        return;
      }
    }

    // Validar que está nas fases principais (MAIN1 ou MAIN2)
    // Bloquear invocação em DRAW, BATTLE ou END
    // Nota: Se estava em STANDBY, já mudamos para MAIN1 acima, então podemos continuar
    if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2' && currentPhase !== 'STANDBY') {
      const phaseNames: { [key: string]: string } = {
        'DRAW': 'Fase de Compras',
        'BATTLE': 'Fase de Batalha',
        'END': 'Fase Final'
      };
      const phaseName = phaseNames[currentPhase] || currentPhase;
      console.warn(`⚠️ [handlePlaceCardOnField] Tentativa de invocar na fase ${currentPhase} (${phaseName}) - bloqueada!`);
      alert(`Você só pode colocar cartas no campo nas fases principais (MP1 ou MP2)! Você está na ${phaseName}.`);
      return;
    }

    // Se for invocação normal (ataque ou defesa face-up) de monstro nível 4 ou menos, usar o método especial
    const isMonster = cardType === 'Monster' || card.type === 'Monster' || card.cardType === 'Monster';
    const cardLevel = card.level || 0;
    
    // Invocação normal em ataque
    if (isMonster && position === 'attack' && cardLevel <= 4 && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2')) {
      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, true, handIndex);
      }
      // Usar invocação normal (já valida se pode invocar)
      performAction(duelId, user.id, 'SUMMON_MONSTER', {
        cardId: card.id || card.cardId || card.idCarta,
        cardName: card.name,
        zoneIndex,
        position: 'attack',
      });
      return;
    }
    
    // Invocação normal em defesa (face-up)
    if (isMonster && position === 'defense' && cardLevel <= 4 && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2')) {
      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, true, handIndex);
      }
      // Usar invocação normal (já valida se pode invocar)
      performAction(duelId, user.id, 'SUMMON_MONSTER', {
        cardId: card.id || card.cardId || card.idCarta,
        cardName: card.name,
        zoneIndex,
        position: 'defense',
      });
      return;
    }
    
    // Para outras ações (set face-down ou monstros nível 5+), usar método antigo
    // Determinar o tipo da carta
    const type = cardType || card.type || card.cardType;
    const isSpellOrTrap = type === 'Spell' || type === 'Trap';

    if (!isMonster && !isSpellOrTrap) {
      alert('Tipo de carta inválido!');
      return;
    }

    if (zoneIndex < 0 || zoneIndex >= 5) {
      alert('Zona inválida!');
      return;
    }

    const matchesPlayedCard = (c: any) => {
      if (!c || !card) return false;
      if (c === card) return true;
      if (card.instanceId && c.instanceId) return c.instanceId === card.instanceId;
      return (
        (c.id != null && card.id != null && c.id === card.id) ||
        (c.cardId != null && card.cardId != null && c.cardId === card.cardId) ||
        (c.idCarta != null && card.idCarta != null && c.idCarta === card.idCarta)
      );
    };
    const atIndex =
      typeof handIndex === 'number' && handIndex >= 0 && handIndex < myHand.length
        ? myHand[handIndex]
        : null;
    const cardInHand =
      atIndex && matchesPlayedCard(atIndex) ? atIndex : myHand.find(matchesPlayedCard);
    if (!cardInHand) {
      alert('Carta não encontrada na mão!');
      return;
    }

    if (isMonster) {
      // Verificar se a zona de monstro está ocupada (considerar null e undefined como vazio)
      if (myMonsters[zoneIndex] !== null && myMonsters[zoneIndex] !== undefined) {
        alert('Esta zona de monstro já está ocupada!');
        return;
      }

      // Chaos Sorcerer, Chaos Emperor Dragon e BLS só podem ser invocados por invocação especial (banir LIGHT + DARK do cemitério)
      const cardIdPlace = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
      const cardNamePlace = (card.name || card.cardName || '').toString().toLowerCase();
      const isChaosSorcererPlace = cardIdPlace.includes('chaossorcerer') || cardNamePlace.includes('chaos sorcerer');
      const isChaosEmperorDragonPlace = cardIdPlace.includes('chaosemperordragon') || cardNamePlace.includes('chaos emperor dragon');
      const isBlackLusterSoldierPlace = cardIdPlace.includes('blacklustersoldier') || cardNamePlace.includes('black luster soldier');
      if (isChaosSorcererPlace || isChaosEmperorDragonPlace || isBlackLusterSoldierPlace) {
                performAction(duelId, user.id, 'START_CHAOS_SORCERER_SPECIAL_SUMMON', {
          cardId: card.id || card.cardId || card.idCarta,
        });
        setSelectedCardForField(null);
        return;
      }

      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, true, handIndex);
      }

      // Enviar ação para o backend
      // Se for ataque e nível <= 4, usar SUMMON_MONSTER, senão usar SET_MONSTER
      if (position === 'attack' && cardLevel <= 4) {
        performAction(duelId, user.id, 'SUMMON_MONSTER', {
          cardId: card.id || card.cardId || card.idCarta,
          cardName: card.name,
          zoneIndex,
          position: 'attack',
        });
      } else {
        // Para defesa ou set, usar SET_MONSTER
        // Quando colocar em defesa, sempre usar 'set' (face-down) para mostrar a sleeve da carta
        const finalPosition = position === 'defense' ? 'set' : position;
        console.log(`📤 [handlePlaceCardOnField] Enviando SET_MONSTER - card: ${card.name}, zoneIndex: ${zoneIndex}, position: ${finalPosition}`);
        performAction(duelId, user.id, 'SET_MONSTER', {
          cardId: card.id || card.cardId || card.idCarta,
          cardName: card.name,
          zoneIndex,
          position: finalPosition,
          cardType: 'Monster',
        });
      }
    } else if (isSpellOrTrap) {
      if (position !== 'set') {
        const lpCostPlace = getSpellActivationLpCost(card);
        if (lpCostPlace != null && myLifePoints < lpCostPlace) {
          alert(`Você precisa de pelo menos ${lpCostPlace} LP para ativar esta carta.`);
          return;
        }
      }
      // Verificar se a zona de spell/trap está ocupada (considerar null e undefined como vazio)
      if (mySpellTraps[zoneIndex] !== null && mySpellTraps[zoneIndex] !== undefined) {
        alert('Esta zona de spell/trap já está ocupada!');
        return;
      }

      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, false, handIndex);
      }

      // NÃO atualizar estado local do campo - deixar o backend fazer isso via duelUpdate
      // Isso evita que a carta apareça antes do backend confirmar

      // Enviar ação para o backend
      performAction(duelId, user.id, position === 'set' ? 'SET_SPELL_TRAP' : 'ACTIVATE_SPELL_TRAP', {
        cardId: card.id || card.cardId || card.idCarta,
        cardName: card.name,
        zoneIndex,
        position: position === 'set' ? 'set' : 'face-up',
        spellActivatedFromField: false,
        instanceId: card.instanceId,
      });
    }

    // Limpar seleção
    setSelectedCardForField(null);
  };

  // Função auxiliar para verificar se uma carta é Mystical Space Typhoon
  const isMysticalSpaceTyphoon = (card: any): boolean => {
    if (!card) return false;
    const cardName = (card.name || card.cardName || '').toLowerCase().replace(/\s+/g, '');
    return cardName.includes('mysticalspacetyphoon') || cardName === 'mysticalspacetyphoon';
  };

  // Filtrar mySpellTraps para ocultar Mystical Space Typhoon quando o modal está aberto
  const filteredMySpellTraps = useMemo(() => {
    if (!showMysticalSpaceTyphoonModal || !currentPendingChoice || currentPendingChoice.type !== 'MYSTICAL_SPACE_TYPHOON') {
      return mySpellTraps;
    }
    
    // Se o modal está aberto, ocultar a Mystical Space Typhoon no campo
    const spellTrapZoneIndex = currentPendingChoice.data?.zoneIndex;
    if (spellTrapZoneIndex !== undefined && spellTrapZoneIndex !== null) {
      const filtered = [...mySpellTraps];
      if (filtered[spellTrapZoneIndex] && isMysticalSpaceTyphoon(filtered[spellTrapZoneIndex])) {
        filtered[spellTrapZoneIndex] = null;
      }
      return filtered;
    }
    
    return mySpellTraps;
  }, [mySpellTraps, showMysticalSpaceTyphoonModal, currentPendingChoice]);

  if (!user) {
    return <Navigate to="/" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-white text-2xl">Carregando duelo...</div>
      </div>
    );
  }

  // Só mostrar erro se realmente não temos duelData E não está carregando
  // Se temos duelData, mesmo com erro, continuar mostrando o duelo (erro pode ser temporário)
  if ((error && !duelData && !loading) || (!duelData && !loading && error)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent p-4">
        <div className="max-w-md w-full bg-slate-800/50 rounded-xl border border-red-500/30 p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-3xl font-bold text-red-400 mb-4">Erro ao Carregar Duelo</h2>
          <p className="text-slate-300 mb-6">
            {error || 'Não foi possível carregar os dados do duelo.'}
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Duelo ID: <span className="font-mono text-purple-400">{duelId}</span>
          </p>
          <button
            onClick={() => window.location.href = '/random-duel'}
            className="gradient blue-purple px-8 py-3 rounded-lg font-bold"
          >
            Voltar para Random Duel
          </button>
        </div>
      </div>
    );
  }

  // Determinar quem é o oponente
  if (!duelData || !duelData.player1 || !user) {
    if (duelEndedData && user) {
      return (
        <div className="h-[100dvh] min-h-[100svh] w-full relative flex flex-col overflow-x-hidden overflow-y-auto lg:overflow-hidden min-h-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          <ArenaFullBleedBackground basePathWithoutExt="/images/background" zIndexClass="-z-10" />
          <DuelEndedOverlay duelEndedData={duelEndedData} user={user} />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Carregando duelo...</p>
          {loading && <p className="text-gray-400">Aguarde...</p>}
        </div>
      </div>
    );
  }
  
  // Numeric IDs (legacy); UUID/auth string ids: usar comparação estrita em string.
  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  const player1Id = typeof duelData.player1?.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1?.id);
  const isPlayer1 = isSpectator
    ? true
    : duelIdsEqual(user.id, duelData.player1?.id) ||
      (!Number.isNaN(userId) && !Number.isNaN(player1Id) && userId === player1Id);
  const opponent = isPlayer1 ? duelData.player2 : duelData.player1;
  const effectiveIsMyTurn = isMyTurn && !isSpectator;
  const myClanTag = user?.clanTag || '';
  const opponentClanTag = (opponent as any).clanTag || '';

  // Cosméticos do duelo (playmat e sleeve) vindos do backend, por jogador
  const myUserInDuel = isPlayer1 ? (duelData as any).player1 : (duelData as any).player2;
  const opponentInDuel = isPlayer1 ? (duelData as any).player2 : (duelData as any).player1;
  // No modo espectador: topo = Jogador 1, baixo = Jogador 2 (cada um com seu nome e sleeve)
  const player1DuelRef = (duelData as any).player1;
  const player2DuelRef = (duelData as any).player2;
  const topPanelUser = isSpectator ? player1DuelRef : opponent;
  const bottomPanelUser = isSpectator ? player2DuelRef : user;
  const topPanelClanTag = isSpectator ? (player1DuelRef as any)?.clanTag || '' : opponentClanTag;
  const bottomPanelClanTag = isSpectator ? (player2DuelRef as any)?.clanTag || '' : myClanTag;

  // URLs de playmat e sleeve: usar helper que em produção usa VITE_API_URL para paths relativos
  const myPlaymatImageUrl = getCosmeticImageUrl(myUserInDuel?.equippedPlaymatImage);
  const opponentPlaymatImageUrl = getCosmeticImageUrl(opponentInDuel?.equippedPlaymatImage);
  // SkinDefault (sleeve padrão) quando não há sleeve equipada ou quando a imagem não carregar
  const defaultSkinCardUrl = getDefaultSkinCardImageUrl();
  const mySkinImageUrl = getCosmeticImageUrl(myUserInDuel?.equippedSkinImage) ?? defaultSkinCardUrl;
  const opponentSkinImageUrl = getCosmeticImageUrl(opponentInDuel?.equippedSkinImage) ?? defaultSkinCardUrl;

  const player1Duel = (duelData as any).player1;
  const player2Duel = (duelData as any).player2;
  const skinPlayer1 = getCosmeticImageUrl(player1Duel?.equippedSkinImage) ?? defaultSkinCardUrl;
  const skinPlayer2 = getCosmeticImageUrl(player2Duel?.equippedSkinImage) ?? defaultSkinCardUrl;
  const skinTop = isSpectator ? skinPlayer1 : opponentSkinImageUrl;
  const skinBottom = isSpectator ? skinPlayer2 : mySkinImageUrl;
  const playmatTop = isSpectator ? getCosmeticImageUrl(player1Duel?.equippedPlaymatImage) : opponentPlaymatImageUrl;
  const playmatBottom = isSpectator ? getCosmeticImageUrl(player2Duel?.equippedPlaymatImage) : myPlaymatImageUrl;

  // Espectador: topo = Jogador 1, baixo = Jogador 2 — dados de campo e mão por posição
  const topFieldMonsters = isSpectator ? myMonsters : opponentMonsters;
  const topFieldSpellTraps = isSpectator ? mySpellTraps : opponentSpellTraps;
  const topFieldGraveyard = isSpectator ? myGraveyard : opponentGraveyard;
  const topFieldExtraDeck = isSpectator ? myExtraDeck : opponentExtraDeck;
  const topFieldDeckCount = isSpectator ? myDeck.length : opponentDeck.length;
  const topFieldHandCount = isSpectator ? myHand.length : opponentHand.length;
  const bottomFieldMonsters = isSpectator ? opponentMonsters : myMonsters;
  const bottomFieldSpellTraps = isSpectator ? opponentSpellTraps : mySpellTraps;
  const bottomFieldGraveyard = isSpectator ? opponentGraveyard : myGraveyard;
  const bottomFieldExtraDeck = isSpectator ? opponentExtraDeck : myExtraDeck;
  const bottomFieldDeckCount = isSpectator ? opponentDeck.length : myDeck.length;
  const bottomFieldHandCount = isSpectator ? opponentHand.length : myHand.length;

  // Bônus Banner of Courage (+200 ATK) durante a Fase de Batalha do dono da carta — para exibir no ATK e no cálculo de dano
  const turnNum = duelData?.currentTurn ?? currentTurn ?? 1;
  const isMyTurnPlayer = (isPlayer1 && turnNum === 1) || (!isPlayer1 && turnNum === 2);
  const myBannerBonus = getBannerOfCourageBonus(mySpellTraps, isMyTurnPlayer);
  const opponentBannerBonus = getBannerOfCourageBonus(opponentSpellTraps, !isMyTurnPlayer);

  return (
    <div
      ref={duelArenaRootRef}
      className="h-[100dvh] min-h-[100svh] w-full relative flex flex-col overflow-x-hidden overflow-y-auto lg:overflow-hidden min-h-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    >

      <ArenaFullBleedBackground basePathWithoutExt="/images/background" zIndexClass="-z-10" />

      {/* Banner modo espectador */}
      {isSpectator && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-600/90 text-white font-bold rounded-lg shadow-lg border-2 border-amber-400 flex items-center gap-2">
          👁 Modo espectador — somente visualização
        </div>
      )}

      {wsDisconnectedUi && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 duel-modal-scrim px-6 text-center pointer-events-auto"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="h-12 w-12 rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin"
            aria-hidden
          />
          <div>
            <p className="text-xl font-semibold text-white sm:text-2xl">Carregando duelo…</p>
            <p className="mt-2 max-w-sm text-sm text-slate-300">
              Sem conexão com o servidor. Reconectando; o duelo volta assim que os dados forem sincronizados.
            </p>
          </div>
        </div>
      )}
      
      <div className="w-full flex-1 min-h-0 flex flex-col relative z-10">
        {/* Header: Informações dos Duelistas - Modernizado */}
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col flex-shrink-0 mb-0.5 py-1 sm:mb-1 sm:py-1.5 bg-black/20 shadow-2xl lg:mb-0 lg:py-0 lg:bg-transparent lg:shadow-none"
        >
          <div className="flex gap-0 w-full min-w-0 items-stretch lg:hidden">
            {/* Mobile: oponente + timer + você — mesma faixa do topo */}
            <div className="flex flex-1 min-w-0 flex-col gap-1 px-2">
              <div className="flex items-stretch gap-1.5 min-w-0">
                {/* Card oponente (compacto) */}
                <div className="min-w-0 flex-1 flex items-center">
                  <motion.div
                    transition={{ duration: 0.2 }}
                    className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-red-400/35 bg-black/25 px-2 py-1.5 shadow-md"
                  >
                    <div className="min-w-0 flex-1 text-right">
                      <div className="break-words hyphens-auto text-[11px] font-bold text-red-300 leading-snug sm:text-xs">
                        {topPanelClanTag ? `|${topPanelClanTag}| ` : ''}{topPanelUser?.nickname || opponent?.nickname}
                      </div>
                      <motion.div
                        key={isSpectator ? myLifePoints : opponentLifePoints}
                        initial={{ scale: 1.08 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.25 }}
                        className="text-xs font-bold leading-tight text-red-200 sm:text-sm"
                      >
                        LP {(isSpectator ? myLifePoints : opponentLifePoints).toLocaleString()}
                      </motion.div>
                    </div>
                    <img
                      src={getProfileImageUrl(topPanelUser?.profileImage ?? opponent?.profileImage)}
                      alt=""
                      className="h-12 w-12 flex-shrink-0 rounded-lg border-2 border-red-400/70 object-cover sm:h-14 sm:w-14"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                  </motion.div>
                </div>
                {/* Tempo do turno + fase atual */}
                <div className="flex flex-shrink-0 flex-col items-center justify-center gap-1.5 px-0.5">
                  <div
                    className={`text-center text-[11px] font-bold uppercase leading-tight sm:text-xs ${
                      isMyTurn ? 'text-blue-200' : 'text-slate-400'
                    }`}
                  >
                    {isSpectator
                      ? (currentTurn === 1 ? `Turno: ${duelData?.player1?.nickname || 'P1'}` : `Turno: ${duelData?.player2?.nickname || 'P2'}`)
                      : isMyTurn
                        ? 'Seu turno'
                        : 'Oponente'}
                  </div>
                  <motion.div
                    className={`flex aspect-square min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border-2 px-1.5 font-mono text-base font-bold tabular-nums leading-none shadow-md sm:min-h-11 sm:min-w-11 sm:text-lg ${
                      isMyTurn
                        ? turnTimeLeft <= 10
                          ? 'border-red-400 bg-gradient-to-br from-red-950/90 to-red-900/70 text-red-100 shadow-red-500/30'
                          : 'border-blue-400 bg-gradient-to-br from-blue-950/90 to-indigo-900/70 text-blue-100 shadow-blue-500/25'
                        : 'border-slate-500 bg-gradient-to-br from-slate-800/90 to-slate-900/70 text-slate-200'
                    } ${turnTimeLeft >= 100 ? 'min-w-[2.85rem] sm:min-w-[3rem]' : ''}`}
                    animate={
                      isMyTurn && turnTimeLeft <= 10
                        ? {
                            scale: [1, 1.06, 1],
                            boxShadow: [
                              '0 0 10px rgba(239, 68, 68, 0.45)',
                              '0 0 18px rgba(239, 68, 68, 0.65)',
                              '0 0 10px rgba(239, 68, 68, 0.45)',
                            ],
                          }
                        : {}
                    }
                    transition={{ duration: 0.6, repeat: Infinity }}
                  >
                    <motion.span key={turnTimeLeft} initial={{ scale: 1.12 }} animate={{ scale: 1 }} className="select-none">
                      {turnTimeLeft}
                    </motion.span>
                  </motion.div>
                  {currentPhase && (
                    <div
                      className={`text-center font-semibold leading-tight text-slate-200 max-w-[5.5rem] ${
                        currentPhase === 'BATTLE' ? 'text-[12px] sm:text-sm text-amber-200/95' : 'text-[11px] sm:text-xs'
                      }`}
                    >
                      {currentPhase === 'DRAW'
                        ? 'Compras'
                        : currentPhase === 'STANDBY'
                          ? 'Apoio'
                          : currentPhase === 'MAIN1'
                            ? 'MP1'
                            : currentPhase === 'BATTLE'
                              ? 'Batalha'
                              : currentPhase === 'MAIN2'
                                ? 'MP2'
                                : currentPhase === 'END'
                                  ? 'Final'
                                  : currentPhase}
                    </div>
                  )}
                </div>
                {/* Card jogador local (compacto) */}
                <div className="min-w-0 flex-1 flex items-center">
                  <motion.div
                    transition={{ duration: 0.2 }}
                    className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-blue-400/35 bg-black/25 px-2 py-1.5 shadow-md"
                  >
                    <img
                      src={getProfileImageUrl(bottomPanelUser?.profileImage)}
                      alt=""
                      className="h-12 w-12 flex-shrink-0 rounded-lg border-2 border-blue-400/70 object-cover sm:h-14 sm:w-14"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="break-words hyphens-auto text-[11px] font-bold leading-snug text-blue-300 sm:text-xs">
                        {bottomPanelClanTag ? `|${bottomPanelClanTag}| ${bottomPanelUser?.nickname}` : bottomPanelUser?.nickname}
                      </div>
                      <motion.div
                        key={isSpectator ? opponentLifePoints : myLifePoints}
                        initial={{ scale: 1.08 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.25 }}
                        className="text-xs font-bold leading-tight text-blue-200 sm:text-sm"
                      >
                        LP {(isSpectator ? opponentLifePoints : myLifePoints).toLocaleString()}
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      <div ref={duelLayoutRowRef} className="flex gap-0 flex-1 min-h-0 min-w-0 overflow-hidden relative w-full">
          {/* Backdrop mobile: fecha o drawer ao clicar */}
          <div
            aria-hidden="true"
            className={`fixed inset-0 duel-modal-scrim z-40 transition-opacity duration-300 lg:hidden ${mobileChatOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={closeMobileDrawer}
          />
          {/* Botão abrir Chat/Logs no mobile */}
          <button
            type="button"
            onClick={() => {
              setMobileChatOpen(true);
              setMobilePanelTab('chat');
            }}
            className="fixed z-30 lg:hidden flex h-11 w-11 items-center justify-center rounded-xl border-2 border-purple-400/70 bg-purple-600/90 text-white shadow-lg touch-manipulation hover:bg-purple-500 right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
            aria-label="Abrir chat e logs"
          >
            <span className="text-lg">💬</span>
          </button>
          {/* Mobile: bottom sheet — largura total, altura limitada; não cobre campo nem mão */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat e log do duelo"
            className={`lg:hidden fixed inset-x-0 bottom-0 z-[45] flex max-h-[min(56vh,460px)] flex-col rounded-t-2xl border border-b-0 border-slate-600/50 bg-gray-950/98 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md transition-transform duration-300 ease-out ${
              mobileChatOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
            }`}
          >
            <div className="flex-shrink-0 flex justify-center pt-2 pb-1" aria-hidden>
              <div className="h-1 w-12 rounded-full bg-white/20" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border border-slate-700/40 bg-slate-900/30">
              <div className="flex w-full min-w-0 flex-shrink-0 items-center gap-2 overflow-hidden border-b border-slate-600/30 bg-slate-800/50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setMobilePanelTab('chat')}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                    mobilePanelTab === 'chat' ? 'bg-blue-500/25 text-blue-100' : 'text-slate-200 hover:bg-white/10'
                  }`}
                  aria-label="Mostrar chat"
                >
                  💬 Chat
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanelTab('logs')}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                    mobilePanelTab === 'logs' ? 'bg-purple-500/25 text-purple-100' : 'text-slate-200 hover:bg-white/10'
                  }`}
                  aria-label="Mostrar log de ações"
                >
                  📋 Log
                  {duelLogs.length > 0 && (
                    <span className="rounded-full bg-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-200">
                      {duelLogs.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeMobileDrawer}
                  className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg font-bold text-white transition-colors hover:bg-white/20 active:bg-white/30"
                  aria-label="Fechar chat e log"
                >
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {mobilePanelTab === 'chat' ? (
                  <DuelChat
                    embedded
                    hideHeader
                    messages={chatMessages}
                    onSendMessage={(message) => {
                      if (duelId && user?.id) {
                        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                        if (!isNaN(userId)) {
                          sendChatMessage(duelId, userId, message);
                        } else {
                          console.error('❌ ID de usuário inválido:', user.id);
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden">
                    <DuelLogs
                      embedded
                      hideHeader
                      logs={duelLogs}
                      currentUserId={
                        user?.id != null
                          ? (typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id))
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Painel Esquerdo: Chat e Logs — apenas desktop */}
          <motion.div 
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden lg:flex lg:relative lg:z-auto lg:h-full lg:max-h-[min(100%,calc(100dvh-5.5rem))] lg:min-h-0 lg:w-[clamp(220px,23vw,280px)] lg:max-w-[clamp(220px,23vw,280px)] lg:flex-shrink-0 lg:flex-col lg:gap-3 lg:overflow-hidden lg:border-r-0 lg:bg-transparent lg:pr-2 lg:pt-0"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {/* Chat um pouco mais baixo que antes (~40% altura); log ~60% — os dois visíveis */}
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              className="hidden min-h-0 min-w-0 basis-0 flex-[2] flex-col overflow-hidden rounded-xl border border-slate-700/30 bg-slate-900/20 shadow-lg lg:flex"
            >
              <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-600/30 bg-slate-800/50 px-3 py-2">
                <span className="text-lg" aria-hidden>
                  💬
                </span>
                <span className="truncate text-sm font-semibold text-white">Chat do Duelo</span>
                {chatMessages.length > 0 && (
                  <span className="ml-auto rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-200">
                    {chatMessages.length}
                  </span>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DuelChat
                  embedded
                  hideHeader
                  messages={chatMessages}
                  onSendMessage={(message) => {
                    if (duelId && user?.id) {
                      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                      if (!isNaN(userId)) {
                        sendChatMessage(duelId, userId, message);
                      } else {
                        console.error('❌ ID de usuário inválido:', user.id);
                      }
                    }
                  }}
                />
              </div>
            </motion.div>
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              className="hidden min-h-0 min-w-0 basis-0 flex-[3] flex-col overflow-hidden rounded-xl border border-slate-700/30 bg-slate-900/20 shadow-lg lg:flex"
            >
              <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-600/30 bg-slate-800/50 px-3 py-2">
                <span className="text-lg" aria-hidden>
                  📋
                </span>
                <span className="truncate text-sm font-semibold text-white">Log de Ações</span>
                {duelLogs.length > 0 && (
                  <span className="ml-auto rounded-full bg-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-200">
                    {duelLogs.length}
                  </span>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DuelLogs
                  embedded
                  hideHeader
                  logs={duelLogs}
                  currentUserId={
                    user?.id != null
                      ? (typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id))
                      : undefined
                  }
                />
              </div>
            </motion.div>
            </div>
            
            {/* Adicionar carta à mão - Apenas para ADMIN e MASTER */}
            {(user?.role === 'MASTER' || user?.role === 'ADMIN') && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="hidden w-full min-w-0 flex-shrink-0 lg:block"
              >
                <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-purple-500/45 bg-gradient-to-br from-purple-900/95 to-indigo-950/95 shadow-lg shadow-purple-950/30 backdrop-blur-md">
                  <div className="flex-shrink-0 border-b border-purple-600/40 bg-purple-950/50 px-3 py-2.5">
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-purple-100">
                      <span className="text-base" aria-hidden>
                        👑
                      </span>
                      Adicionar à mão
                    </h3>
                  </div>
                  <div className="flex w-full min-w-0 flex-col gap-2 p-3">
                    <label htmlFor="masterCardSearch" className="sr-only">
                      Nome ou parte do nome da carta
                    </label>
                    <input
                      type="text"
                      id="masterCardSearch"
                      autoComplete="off"
                      placeholder="Nome, trecho ou id (minúsculo ok)"
                      className="box-border w-full min-w-0 rounded-lg border border-purple-500/40 bg-black/35 px-3 py-2.5 text-sm text-white placeholder:text-purple-200/40 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/35"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const input = e.currentTarget as HTMLInputElement;
                        const cardName = input.value.trim();
                        if (cardName && duelId && user?.id) {
                          const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                          if (!isNaN(userId)) {
                            performAction(duelId, userId, 'MASTER_ADD_CARD_TO_HAND', { cardName });
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('masterCardSearch') as HTMLInputElement | null;
                        const cardName = input?.value.trim();
                        if (cardName && duelId && user?.id) {
                          const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                          if (!isNaN(userId)) {
                            performAction(duelId, userId, 'MASTER_ADD_CARD_TO_HAND', { cardName });
                            if (input) input.value = '';
                          }
                        }
                      }}
                      className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-purple-500 active:bg-purple-700"
                    >
                      Adicionar
                    </button>
                    <p className="text-[10px] leading-snug text-purple-200/65">
                      Busca ignora maiúsculas. Pode usar só parte do nome; se houver várias, escolhe a melhor
                      correspondência.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Arena Principal: campo + fases + mão escalados juntos para caber na coluna central */}
          <motion.div 
            ref={duelFieldContainerRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className={`flex-1 min-w-0 min-h-0 flex flex-col relative ${
              useScrollArenaLayout ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
            }`}
          >
            <div
              ref={arenaPlaymatViewportRef}
              className={
                useScrollArenaLayout
                  ? 'flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch justify-start px-0 pb-2 pt-4 sm:pt-5'
                  : 'flex min-h-0 min-w-0 flex-1 items-start justify-center px-0 pb-1 pt-2 sm:pt-3'
              }
            >
            <div
              style={
                useScrollArenaLayout
                  ? { flexShrink: 0, width: '100%', maxWidth: '100%' }
                  : arenaContentSize
                    ? {
                        width: arenaContentSize.w * arenaScale,
                        height: arenaContentSize.h * arenaScale,
                        flexShrink: 0,
                      }
                    : { flexShrink: 0 }
              }
              className="relative flex-shrink-0 overflow-visible"
            >
              <div
                ref={arenaContentRef}
                style={{
                  ...(!useScrollArenaLayout && arenaContentSize
                    ? {
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: arenaContentSize.w,
                        transform: `scale(${arenaScale})`,
                        transformOrigin: 'top left',
                      }
                    : {}),
                  flexShrink: 0,
                }}
                className="mt-1 flex w-full min-w-0 max-w-none flex-col items-stretch px-0 sm:mt-2 sm:px-1"
              >
            {/* Playmats (mão do oponente na sidebar direita) */}
            <div ref={arenaScaleWidthMeasureRef} className="w-full flex flex-col min-w-0 flex-shrink-0">
            {/* Espectador: mão do P1 face-up acima do campo superior */}
            {isSpectator && (
              <div className="mb-1 flex w-full min-w-0 flex-col gap-0.5 px-1 sm:px-2">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300/90">
                  Mão {duelData?.player1?.nickname || 'P1'} ({myHand.length})
                </p>
                {myHand.length === 0 ? (
                  <p className="px-1 text-xs text-slate-400">Vazia</p>
                ) : (
                  <div className="flex items-center gap-1 overflow-x-auto py-0.5 sm:gap-1.5">
                    {myHand.map((card: any, index: number) => (
                      <div
                        key={`spec-p1-hand-${card?.instanceId || index}-${card?.idCarta || card?.id || index}`}
                        className="flex-shrink-0 overflow-hidden rounded border-2 border-sky-400/50 shadow"
                        style={{ width: 56, aspectRatio: '59/86' }}
                        title={card?.name || card?.cardName || `Carta ${index + 1}`}
                      >
                        <CardImage card={card} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Área dos playmats — no mobile não cortar horizontalmente o campo */}
            <div className="flex flex-col overflow-x-visible overflow-y-visible lg:overflow-hidden pt-1 min-w-0 flex-shrink-0">
            <div className="overflow-x-visible overflow-y-visible lg:overflow-hidden min-w-0 flex-shrink-0">
            <DuelField 
              isOpponent={true}
              revealFaceDown={isSpectator}
              disabled={isSpectator}
              fieldCardVisualMultiplier={
                useScrollArenaLayout ? DUEL_FIELD_MOBILE_CARD_VISUAL_MULT : DUEL_FIELD_DESKTOP_CARD_VISUAL_MULT
              }
              deckCount={topFieldDeckCount} 
              handCount={topFieldHandCount}
              monsters={topFieldMonsters}
              spellTraps={topFieldSpellTraps}
              bannerOfCourageBonus={opponentBannerBonus}
              graveyard={topFieldGraveyard}
              extraDeck={topFieldExtraDeck}
              playmatImage={playmatTop}
              cardBackImage={skinTop}
              onGraveyardClick={() => setShowOpponentGraveyardModal(true)}
              onExtraDeckClick={() => setShowOpponentExtraDeckModal(true)}
              onMonsterClick={async (targetZoneIndex) => {
                if (isSpectator) return;
                if (attackingMonsterIndex !== null) {
                  // Validações - MESMAS do onMonsterDrop para garantir consistência
                  // Verificar se é o turno do jogador
                  if (!isMyTurn) {
                    setAttackingMonsterIndex(null);
                    return;
                  }
                  
                  // Verificar se está em uma fase que permite ataque (BATTLE, STANDBY ou MAIN1)
                  if (currentPhase !== 'BATTLE' && currentPhase !== 'STANDBY' && currentPhase !== 'MAIN1') {
                    setAttackingMonsterIndex(null);
                    return;
                  }
                  
                  // Verificar se o monstro atacante existe e está em posição de ataque
                  const attackerMonster = myMonsters[attackingMonsterIndex];
                  if (!attackerMonster || attackerMonster.position !== 'attack') {
                    setAttackingMonsterIndex(null);
                    return;
                  }
                  
                  // Verificar se o monstro não pode atacar neste turno (ex: ChaosSorcerer após usar efeito)
                  if (attackerMonster.cannotAttackThisTurn === true) {
                    setAttackingMonsterIndex(null);
                    return;
                  }
                  
                  // Verificar se o monstro já atacou neste turno
                  const monsterCardId = attackerMonster.idCarta || attackerMonster.id || attackerMonster.cardId;
                  const monsterName = (attackerMonster.name || attackerMonster.cardName || '').toLowerCase();
                  const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                            monsterCardId === 'matazathezapper' ||
                                            monsterName === 'mataza the zapper';
                  const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                           monsterCardId === 'cybertwindragon' ||
                                           monsterName === 'cyber twin dragon';
                  
                  const isBLS = (monsterCardId && String(monsterCardId).toLowerCase().includes('blacklustersoldier')) || (monsterName && monsterName.includes('black luster soldier'));
                  if (isMatazaTheZapper || isCyberTwinDragon) {
                    const attacksThisTurn = attackerMonster.attacksThisTurn || 0;
                    if (attacksThisTurn >= 2) {
                      setAttackingMonsterIndex(null);
                      return;
                    }
                  } else if (isBLS && !!attackerMonster.canAttackAgainThisTurn) {
                    const attacksThisTurn = attackerMonster.attacksThisTurn || 0;
                    if (attacksThisTurn >= 2) {
                      setAttackingMonsterIndex(null);
                      return;
                    }
                  } else {
                    if (attackerMonster.attackedThisTurn === true) {
                      setAttackingMonsterIndex(null);
                      return;
                    }
                  }
                  
                  // Se estiver em STANDBY ou MAIN1, mudar automaticamente para BATTLE antes de atacar
                  if ((currentPhase === 'STANDBY' || currentPhase === 'MAIN1') && isMyTurn) {
                    console.log(`🔄 [onMonsterClick] Tentativa de atacar na ${currentPhase} - mudando automaticamente para BATTLE`);
                    const socket = getSocket();
                    if (socket && socket.connected) {
                      socket.emit('goToPhase', { duelId, userId: user.id, targetPhase: 'BATTLE' });
                      // Aguardar um pouco para o backend processar a mudança de fase
                      await new Promise(resolve => setTimeout(resolve, 80));
                    } else {
                      alert('Erro: Socket não conectado. Não foi possível mudar a fase.');
                      setAttackingMonsterIndex(null);
                      return;
                    }
                  }
                  
                  // Processar ataque - EXATAMENTE a mesma lógica do onMonsterDrop
                  const targetIndex = targetZoneIndex === -1 || targetZoneIndex === null ? null : targetZoneIndex;

                  performAction(duelId, user.id, 'ATTACK', {
                    attackerZoneIndex: attackingMonsterIndex,
                    targetZoneIndex: targetIndex,
                  });
                  setAttackingMonsterIndex(null);
                }
              }}
              onMonsterDrop={async (attackerZoneIndex, targetZoneIndex) => {
                if (isSpectator) return;
                // Processar ataque via drag and drop - EXATAMENTE o mesmo fluxo do clique
                // Simular o comportamento de clicar no botão de ataque e depois no monstro alvo
                
                // Validações iniciais - mesmas do onAttackClick e onMonsterClick
                if (attackerZoneIndex === null || attackerZoneIndex === undefined) {
                  return;
                }
                
                // Verificar se é o turno do jogador e se pode atacar (mesmas condições do canAttack)
                if (!isMyTurn) {
                  return;
                }
                
                // Verificar se está em uma fase que permite ataque (BATTLE, STANDBY ou MAIN1)
                if (currentPhase !== 'BATTLE' && currentPhase !== 'STANDBY' && currentPhase !== 'MAIN1') {
                  return;
                }
                
                // Verificar se o monstro atacante existe e está em posição de ataque
                const attackerMonster = myMonsters[attackerZoneIndex];
                if (!attackerMonster || attackerMonster.position !== 'attack') {
                  return;
                }
                
                // Verificar se o monstro não pode atacar neste turno (ex: ChaosSorcerer após usar efeito)
                // (mesma validação do botão de ataque)
                if (attackerMonster.cannotAttackThisTurn === true) {
                  return;
                }
                
                // Verificar se o monstro já atacou neste turno
                // (mesma validação do drag no DuelField.tsx)
                const monsterCardId = attackerMonster.idCarta || attackerMonster.id || attackerMonster.cardId;
                const monsterName = (attackerMonster.name || attackerMonster.cardName || '').toLowerCase();
                const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                          monsterCardId === 'matazathezapper' ||
                                          monsterName === 'mataza the zapper';
                const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                         monsterCardId === 'cybertwindragon' ||
                                         monsterName === 'cyber twin dragon';
                
                const isBLSDrop = (monsterCardId && String(monsterCardId).toLowerCase().includes('blacklustersoldier')) || (monsterName && monsterName.includes('black luster soldier'));
                if (isMatazaTheZapper || isCyberTwinDragon) {
                  const attacksThisTurn = attackerMonster.attacksThisTurn || 0;
                  if (attacksThisTurn >= 2) return;
                } else if (isBLSDrop && !!attackerMonster.canAttackAgainThisTurn) {
                  const attacksThisTurn = attackerMonster.attacksThisTurn || 0;
                  if (attacksThisTurn >= 2) return;
                } else {
                  if (attackerMonster.attackedThisTurn === true) return;
                }
                
                // Se estiver em STANDBY ou MAIN1, mudar automaticamente para BATTLE antes de atacar
                // (mesma lógica do onAttackClick e onMonsterClick)
                if ((currentPhase === 'STANDBY' || currentPhase === 'MAIN1') && isMyTurn) {
                  console.log(`🔄 [onMonsterDrop] Tentativa de atacar na ${currentPhase} - mudando automaticamente para BATTLE`);
                  const socket = getSocket();
                  if (socket && socket.connected) {
                    socket.emit('goToPhase', { duelId, userId: user.id, targetPhase: 'BATTLE' });
                    // Aguardar um pouco para o backend processar a mudança de fase
                    await new Promise(resolve => setTimeout(resolve, 80));
                  } else {
                    alert('Erro: Socket não conectado. Não foi possível mudar a fase.');
                    return;
                  }
                }
                
                // Processar ataque - EXATAMENTE a mesma lógica do onMonsterClick
                const targetIndex = targetZoneIndex === -1 || targetZoneIndex === null ? null : targetZoneIndex;

                // Enviar ação de ataque (mesma lógica do onMonsterClick)
                performAction(duelId, user.id, 'ATTACK', {
                  attackerZoneIndex,
                  targetZoneIndex: targetIndex,
                });
                
                // Limpar o estado de ataque (mesmo comportamento do clique)
                setAttackingMonsterIndex(null);
              }}
              isSelectingTarget={attackingMonsterIndex !== null && currentPhase === 'BATTLE' && effectiveIsMyTurn}
              canAttack={currentPhase === 'BATTLE' && effectiveIsMyTurn}
              isMyTurn={effectiveIsMyTurn}
              currentPhase={currentPhase}
              isSelectingSpellTrapTarget={isSelectingMSTTarget && isMyTurn}
              isSelectingMonsterTarget={(isSelectingSnowmanEaterTarget || isSelectingChaosSorcererTarget) && isMyTurn}
              onCardClick={(card, zoneIndex) => {
                // Se estamos selecionando alvo para MST, processar escolha
                if (isSelectingMSTTarget && zoneIndex !== undefined) {
                  const targetPlayer = 'opponent'; // Campo do oponente
                  if (duelId && user?.id) {
                    performAction(duelId, user.id, 'MYSTICAL_SPACE_TYPHOON_CHOICE', {
                      targetPlayer,
                      targetZoneIndex: zoneIndex,
                    });
                    setIsSelectingMSTTarget(false);
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para SnowmanEater, processar escolha
                if (isSelectingSnowmanEaterTarget && zoneIndex !== undefined && card) {
                  // Verificar se o monstro está face-up (attack ou defense)
                  const isFaceUp = card.position === 'attack' || card.position === 'defense';
                  if (isFaceUp) {
                    const targetPlayer = 'opponent'; // Campo do oponente
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'SNOWMAN_EATER_CHOICE', {
                        targetPlayer,
                        targetZoneIndex: zoneIndex,
                      });
                      setIsSelectingSnowmanEaterTarget(false);
                    }
                  } else {
                    // Mostrar mensagem se tentar escolher um monstro face-down
                    alert('SnowmanEater só pode destruir monstros face-up (ataque ou defesa)');
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para ChaosSorcerer, processar escolha
                if (isSelectingChaosSorcererTarget && chaosSorcererMonsterZoneIndex !== null && zoneIndex !== undefined && card) {
                  // Verificar se o monstro está face-up (attack ou defense)
                  const isFaceUp = card.position === 'attack' || card.position === 'defense';
                  if (isFaceUp) {
                    const targetPlayer = 'opponent'; // Campo do oponente
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'CHAOS_SORCERER_EFFECT_CHOICE', {
                        targetPlayer,
                        targetZoneIndex: zoneIndex,
                      });
                      setIsSelectingChaosSorcererTarget(false);
                      setChaosSorcererMonsterZoneIndex(null);
                    }
                  } else {
                    // Mostrar mensagem se tentar escolher um monstro face-down
                    alert('ChaosSorcerer só pode banir monstros face-up (ataque ou defesa)');
                  }
                  return;
                }
                
                console.log('🔍 [DuelArena] Card clicked:', {
                  name: card?.name,
                  description: card?.description,
                  hasDescription: !!card?.description,
                  descriptionLength: card?.description?.length || 0,
                  allKeys: Object.keys(card || {})
                });
                setSelectedCardInfo(card);
              }}
            />
            </div>

            {/* Animação de Ataque - Centralizada no campo de duelo */}
            <AnimatePresence>
              {attackAnimation && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center z-[10000] pointer-events-none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                    pointerEvents: 'none'
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.8, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.8, y: 50 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="flex items-center gap-8 duel-modal-panel rounded-2xl p-8 border-2 border-yellow-400/50 shadow-2xl"
                  >
                    {/* Carta Atacante */}
                    <motion.div
                      initial={{ x: -100, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.1, duration: 0.5 }}
                      className="relative"
                      style={{ width: '150px', height: '219px' }}
                    >
                      <CardImage
                        card={attackAnimation.attackerCard}
                        className="w-full h-full rounded-lg border-2 border-yellow-400 shadow-lg"
                        fallback="/images/fundoCarta.webp"
                      />
                      <div className="absolute -bottom-6 left-0 right-0 text-center">
                        <div className="text-xs text-yellow-300 font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded">
                          ATACANTE
                        </div>
                      </div>
                    </motion.div>

                    {/* X */}
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
                      className="text-6xl font-bold text-red-500 drop-shadow-2xl"
                      style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.8)' }}
                    >
                      ✕
                    </motion.div>

                    {/* Carta Alvo ou Perfil do Duelista Alvo (Ataque Direto) */}
                    {attackAnimation.isDirectAttack ? (
                      <motion.div
                        initial={{ x: 100, opacity: 0, scale: 0.8 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="relative flex flex-col items-center justify-center"
                      >
                        <div className="relative">
                          <div className="rounded-full border-4 border-red-400 shadow-2xl overflow-hidden bg-gradient-to-br from-red-900/50 to-red-800/30 p-2">
                            <img
                              src={attackAnimation.targetProfileImage || DEFAULT_PROFILE_IMAGE_PATH}
                              alt="Duelista Alvo"
                              className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                              }}
                            />
                          </div>
                          <div className="absolute -bottom-4 left-0 right-0 text-center">
                            <div className="text-xs md:text-sm text-red-300 font-semibold bg-black/55 backdrop-blur-sm px-3 py-1 rounded">
                              ALVO
                            </div>
                          </div>
                        </div>
                        {/* Dano */}
                        <motion.div
                          initial={{ scale: 0, y: 20 }}
                          animate={{ scale: 1.2, y: 0 }}
                          transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                          className="absolute -bottom-12 md:-bottom-16 left-0 right-0 text-center"
                        >
                          <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-red-400 drop-shadow-lg bg-black/55 backdrop-blur-sm px-4 py-2 rounded-lg border-2 border-red-500">
                            -{attackAnimation.damage.toLocaleString()}
                          </div>
                        </motion.div>
                      </motion.div>
                    ) : attackAnimation.targetCard ? (
                      <motion.div
                        initial={{ x: 100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="relative"
                        style={{ width: '150px', height: '219px' }}
                      >
                        <CardImage
                          card={attackAnimation.targetCard}
                          className="w-full h-full rounded-lg border-2 border-red-400 shadow-lg"
                          fallback="/images/fundoCarta.webp"
                        />
                        <div className="absolute -bottom-6 left-0 right-0 text-center">
                          <div className="text-xs text-red-300 font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded">
                            ALVO
                          </div>
                        </div>
                        {/* Dano */}
                        <motion.div
                          initial={{ scale: 0, y: 20 }}
                          animate={{ scale: 1.2, y: 0 }}
                          transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                          className="absolute -bottom-8 left-0 right-0 text-center"
                        >
                          <div className="text-3xl font-bold text-red-400 drop-shadow-lg bg-black/55 backdrop-blur-sm px-4 py-2 rounded-lg border-2 border-red-500">
                            -{attackAnimation.damage.toLocaleString()}
                          </div>
                        </motion.div>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ x: 100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="relative flex flex-col items-center justify-center"
                        style={{ width: '150px', height: '219px' }}
                      >
                        <div className="w-full h-full bg-gradient-to-br from-red-900/50 to-red-800/30 rounded-lg border-2 border-red-400 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-4xl mb-2">⚔️</div>
                            <div className="text-sm text-red-300 font-bold">ATAQUE</div>
                          </div>
                        </div>
                        {/* Dano */}
                        <motion.div
                          initial={{ scale: 0, y: 20 }}
                          animate={{ scale: 1.2, y: 0 }}
                          transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                          className="absolute -bottom-8 left-0 right-0 text-center"
                        >
                          <div className="text-3xl font-bold text-red-400 drop-shadow-lg bg-black/55 backdrop-blur-sm px-4 py-2 rounded-lg border-2 border-red-500">
                            -{attackAnimation.damage.toLocaleString()}
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Meu Campo */}
            <div className="flex-1 min-h-0 overflow-x-visible overflow-y-hidden lg:overflow-hidden min-w-0">
            <DuelField 
              isOpponent={false}
              revealFaceDown={isSpectator}
              disabled={isSpectator}
              fieldCardVisualMultiplier={
                useScrollArenaLayout ? DUEL_FIELD_MOBILE_CARD_VISUAL_MULT : DUEL_FIELD_DESKTOP_CARD_VISUAL_MULT
              }
              deckCount={bottomFieldDeckCount} 
              handCount={bottomFieldHandCount}
              monsters={bottomFieldMonsters}
              spellTraps={isSpectator ? bottomFieldSpellTraps : filteredMySpellTraps}
              bannerOfCourageBonus={myBannerBonus}
              graveyard={bottomFieldGraveyard}
              extraDeck={bottomFieldExtraDeck}
              playmatImage={playmatBottom}
              cardBackImage={skinBottom}
              onSlotColumnWidthChange={handlePlayerFieldColumnWidth}
              onGraveyardClick={() => setShowGraveyardModal(true)}
              monsterDestroyedThisTurn={monsterDestroyedThisTurn}
              activatorLifePoints={isSpectator ? undefined : myLifePoints}
              onExtraDeckClick={() => setShowExtraDeckModal(true)}
              onAttackClick={async (zoneIndex) => {
                // Iniciar seleção de alvo (botão só aparece em BATTLE)
                setAttackingMonsterIndex(zoneIndex);
              }}
              canAttack={currentPhase === 'BATTLE' && effectiveIsMyTurn}
              onChangePosition={(zoneIndex, newPosition) => {
                // Mudar posição do monstro
                if (duelId && user?.id) {
                  performAction(duelId, user.id, 'CHANGE_POSITION', {
                    zoneIndex,
                    newPosition,
                  });
                }
              }}
              onBreakerRemoveCounter={(monsterZoneIndex) => {
                if (duelId && user?.id) {
                  setSelectedBreakerTarget(null);
                  setBreakerModalSpellTraps({
                    my: Array.isArray(mySpellTraps) ? [...mySpellTraps] : [],
                    opp: Array.isArray(opponentSpellTraps) ? [...opponentSpellTraps] : [],
                  });
                  setIsSelectingBreakerTarget(true);
                  setBreakerMonsterZoneIndex(monsterZoneIndex);
                }
              }}
              onActivateMonsterEffect={(monsterZoneIndex) => {
                if (hasActionInProgress) {
                  alert('Termine a invocação ou o efeito em andamento antes de usar outra carta.');
                  return;
                }
                // Verificar qual monstro está na zona para determinar qual efeito ativar
                const monster = myMonsters[monsterZoneIndex];
                if (!monster) return;
                
                const cardId = monster.idCarta || monster.id || monster.cardId;
                const cardName = (monster.name || monster.cardName || '').toLowerCase();
                
                // Verificar se é ChaosSorcerer
                const isChaosSorcerer = cardId === 'ChaosSorcerer' || 
                                       cardId === 'chaossorcerer' ||
                                       cardName === 'chaos sorcerer' ||
                                       (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer'));
                
                // Verificar se é Red-Eyes Darkness Metal Dragon
                const isRedEyesDarknessMetalDragon = cardId === 'RedEyesDarknessMetalDragon' ||
                                                     cardId === 'Red-EyesDarknessMetalDragon' ||
                                                     cardId === 'redeyesdarknessmetaldragon' ||
                                                     cardName === 'red-eyes darkness metal dragon' ||
                                                     cardName === 'red eyes darkness metal dragon' ||
                                                     (typeof cardId === 'string' && cardId.toLowerCase().includes('redeyesdarknessmetaldragon')) ||
                                                     (typeof cardName === 'string' && cardName.includes('red-eyes darkness metal dragon'));
                
                // Verificar se é Cyber-Stein
                const isCyberStein = cardId === 'CyberStein' || 
                                    cardId === 'cyberstein' ||
                                    cardId === 'Cyber-Stein' ||
                                    cardName === 'cyber-stein' ||
                                    cardName === 'cyber stein' ||
                                    (typeof cardId === 'string' && cardId.toLowerCase().includes('cyberstein'));
                
                // Verificar se é Exiled Force
                const isExiledForce = cardId === 'ExiledForce' ||
                                     cardId === 'exiledforce' ||
                                     cardId === 'Exiled-Force' ||
                                     cardName === 'exiled force' ||
                                     cardName === 'exiled-force' ||
                                     (typeof cardId === 'string' && cardId.toLowerCase().includes('exiledforce')) ||
                                     (typeof cardName === 'string' && cardName.includes('exiled force'));
                
                // Verificar se é Chaos Emperor Dragon
                const isChaosEmperorDragon = cardId === 'ChaosEmperorDragon' || 
                                            cardId === 'chaosemperordragon' ||
                                            cardId === 'Chaos-EmperorDragon' ||
                                            cardId === 'ChaosEmperor-Dragon' ||
                                            cardName === 'chaos emperor dragon' ||
                                            cardName === 'chaos-emperor dragon' ||
                                            cardName === 'chaosemperordragon' ||
                                            (typeof cardId === 'string' && cardId.toLowerCase().includes('chaosemperordragon')) ||
                                            (typeof cardName === 'string' && cardName.includes('chaos emperor dragon'));
                
                // Verificar se é Black Luster Soldier - Envoy of the Beginning
                const isBlackLusterSoldier = cardId === 'BlackLusterSoldierEnvoyOfTheBeginning' ||
                                            (typeof cardId === 'string' && cardId.toLowerCase().includes('blacklustersoldier')) ||
                                            (typeof cardName === 'string' && cardName.includes('black luster soldier'));
                
                // Obelisk the Tormentor: 1x por turno, escolher 2 monstros seus e destruir todos do oponente
                const isObelisk = /obelisk\s*the\s*tormentor/i.test(cardName || (monster.name || monster.cardName || ''));
                const obeliskCanUse = isObelisk && effectiveIsMyTurn && (obeliskEffectUsedTurn !== myTurnCounter) &&
                  myMonsters.filter((m: any) => m != null).length >= 2;
                
                if (duelId && user?.id) {
                  if (obeliskCanUse) {
                    setShowObeliskEffectModal(true);
                    setObeliskSelectedZones([]);
                    return;
                  }
                  if (isBlackLusterSoldier) {
                    performAction(duelId, user.id, 'START_BLS_EFFECT', { monsterZoneIndex });
                  } else if (isChaosSorcerer) {
                    // Ativar efeito do ChaosSorcerer
                    performAction(duelId, user.id, 'START_CHAOS_SORCERER_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isChaosEmperorDragon) {
                    // Ativar efeito do Chaos Emperor Dragon (não precisa de escolha, descarta todas as cartas automaticamente)
                    performAction(duelId, user.id, 'ACTIVATE_CHAOS_EMPEROR_DRAGON_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isRedEyesDarknessMetalDragon) {
                    // Ativar efeito do Red-Eyes Darkness Metal Dragon
                    performAction(duelId, user.id, 'START_RED_EYES_DARKNESS_METAL_DRAGON_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isCyberStein) {
                    // Ativar efeito do Cyber-Stein
                    performAction(duelId, user.id, 'START_CYBER_STEIN_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isExiledForce) {
                    // Ativar efeito do Exiled Force
                    performAction(duelId, user.id, 'START_EXILED_FORCE_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (
                    (() => {
                      const n = (monster.name || monster.cardName || '').toLowerCase();
                      const id = String(monster.idCarta || monster.id || monster.cardId || '').toLowerCase();
                      return (
                        n.includes('skilled dark magician') ||
                        n.includes('mago negro experiente') ||
                        id.includes('skilleddarkmagician') ||
                        id.includes('73752131')
                      );
                    })()
                  ) {
                    performAction(duelId, user.id, 'START_SKILLED_DARK_MAGICIAN_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else {
                    // Verificar se é Dark Armed Dragon
                    const monster = myMonsters[monsterZoneIndex];
                    if (monster) {
                      const monsterCardId = (monster.idCarta || monster.id || monster.cardId || '').toString().toLowerCase();
                      const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                      const isDarkArmedDragon = monsterCardId === 'darkarmeddragon' ||
                                                monsterCardId === 'dark-armeddragon' ||
                                                monsterCardId === 'darkarmed-dragon' ||
                                                monsterName === 'dark armed dragon' ||
                                                monsterName === 'dark-armed dragon' ||
                                                monsterName === 'darkarmeddragon' ||
                                                (typeof monsterCardId === 'string' && monsterCardId.includes('darkarmeddragon')) ||
                                                (typeof monsterName === 'string' && monsterName.includes('dark armed dragon'));
                      
                      if (isDarkArmedDragon) {
                        // Ativar efeito do Dark Armed Dragon
                        performAction(duelId, user.id, 'START_DARK_ARMED_DRAGON_EFFECT', {
                          monsterZoneIndex,
                        });
                      }
                    }
                  }
                }
              }}
              isMyTurn={effectiveIsMyTurn}
              currentPhase={currentPhase}
              currentTurn={currentTurn ?? undefined}
              turnCounter={duelData?.turnCounter ?? myTurnCounter ?? 1}
              positionChangedThisTurn={positionChangedThisTurn}
              onSpellTrapSlotClick={(zoneIndex) => {
                if (selectingSpellTrapSlot) {
                  handlePlaceCardOnField(
                    selectingSpellTrapSlot.card,
                    selectingSpellTrapSlot.position,
                    zoneIndex,
                    selectingSpellTrapSlot.card.type || selectingSpellTrapSlot.card.cardType
                  );
                  setSelectingSpellTrapSlot(null);
                }
              }}
              onSpellTrapDrop={async (card, zoneIndex, position, fromHandIndex) => {
                // Se estiver em STANDBY, mudar automaticamente para MAIN1
                if (currentPhase === 'STANDBY') {
                  console.log(`🔄 [onSpellTrapDrop] Tentativa de invocar na STANDBY - mudando automaticamente para MAIN1`);
                  const socket = getSocket();
                  if (socket && socket.connected) {
                    socket.emit('goToPhase', { duelId, userId: user.id, targetPhase: 'MAIN1' });
                    await new Promise(resolve => setTimeout(resolve, 80));
                  }
                }
                
                if (currentPhase === 'MAIN1' || currentPhase === 'MAIN2' || currentPhase === 'STANDBY') {
                  // Passar isDragged=true porque a carta foi arrastada, não clicada
                  handlePlaceCardOnField(card, position, zoneIndex, card.type || card.cardType, true, fromHandIndex);
                }
              }}
              onMonsterFromHandDrop={async (card, zoneIndex, position, fromHandIndex) => {
                // Se estiver em STANDBY, mudar automaticamente para MAIN1
                if (currentPhase === 'STANDBY') {
                  console.log(`🔄 [onMonsterFromHandDrop] Tentativa de invocar na STANDBY - mudando automaticamente para MAIN1`);
                  const socket = getSocket();
                  if (socket && socket.connected) {
                    socket.emit('goToPhase', { duelId, userId: user.id, targetPhase: 'MAIN1' });
                    await new Promise(resolve => setTimeout(resolve, 80));
                  }
                }
                
                // Invocar monstro em modo de ataque quando arrastado da mão
                // position já vem como 'attack' do DuelField
                if (currentPhase === 'MAIN1' || currentPhase === 'MAIN2' || currentPhase === 'STANDBY') {
                  // Passar isDragged=true porque a carta foi arrastada, não clicada
                  handlePlaceCardOnField(card, position, zoneIndex, card.type || card.cardType, true, fromHandIndex);
                }
              }}
              onEquipSpellDrop={(card, monsterZoneIndex, spellTrapZoneIndex) => {
                if (hasActionInProgress) {
                  alert('Termine a invocação ou o efeito em andamento antes de usar outra carta.');
                  return;
                }
                console.log('🔍 [DuelArena] onEquipSpellDrop chamado:', {
                  cardName: card.name || card.cardName,
                  monsterZoneIndex,
                  spellTrapZoneIndex,
                  duelId: !!duelId,
                  userId: user?.id,
                  currentPhase,
                  isMyTurn
                });
                
                // Verificar condições básicas
                if (!duelId || !user?.id) {
                  console.error('❌ [DuelArena] onEquipSpellDrop - duelId ou userId não encontrado');
                  alert('Erro: Duelo ou usuário não encontrado');
                  return;
                }
                
                // Verificar se está na fase correta
                if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2') {
                  console.warn('⚠️ [DuelArena] onEquipSpellDrop - não está na fase correta:', currentPhase);
                  alert('Você só pode equipar spells durante as fases MAIN1 ou MAIN2!');
                  return;
                }
                
                // Verificar se é o turno do jogador
                if (!isMyTurn) {
                  console.warn('⚠️ [DuelArena] onEquipSpellDrop - não é o turno do jogador');
                  alert('Você só pode equipar spells no seu turno!');
                  return;
                }
                
                if (spellTrapZoneIndex !== undefined) {
                  // Spell já está no campo, equipar diretamente
                  console.log('✅ [DuelArena] Equipando spell do campo:', {
                    spellTrapZoneIndex,
                    monsterZoneIndex
                  });
                  performAction(duelId, user.id, 'EQUIP_SPELL_FROM_FIELD', {
                    spellTrapZoneIndex,
                    monsterZoneIndex,
                  });
                } else {
                  // Spell está na mão, encontrar uma zona de spell/trap vazia
                  const emptySpellTrapIndex = mySpellTraps.findIndex((st: any) => st === null || st === undefined);
                  if (emptySpellTrapIndex === -1) {
                    alert('Não há zonas de spell/trap disponíveis!');
                    return;
                  }
                  
                  const cardId = card.idCarta || card.id || card.cardId;
                  if (!cardId) {
                    console.error('❌ [DuelArena] onEquipSpellDrop - cardId não encontrado');
                    alert('Erro: ID da carta não encontrado');
                    return;
                  }
                  
                  console.log('✅ [DuelArena] Equipando spell da mão:', {
                    cardId,
                    monsterZoneIndex,
                    spellTrapZoneIndex: emptySpellTrapIndex
                  });
                  performAction(duelId, user.id, 'EQUIP_SPELL', {
                    cardId,
                    monsterZoneIndex,
                    spellTrapZoneIndex: emptySpellTrapIndex,
                  });
                }
              }}
              isSelectingSpellTrapSlot={selectingSpellTrapSlot !== null && currentPhase !== 'BATTLE' && isMyTurn}
              isSelectingSpellTrapTarget={isSelectingMSTTarget && isMyTurn}
              isSelectingMonsterTarget={isSelectingSnowmanEaterTarget && isMyTurn}
              onCardClick={(card, zoneIndex) => {
                // Se estamos selecionando alvo para MST, processar escolha
                if (isSelectingMSTTarget && zoneIndex !== undefined) {
                  const targetPlayer = 'player'; // Campo do próprio jogador
                  if (duelId && user?.id) {
                    performAction(duelId, user.id, 'MYSTICAL_SPACE_TYPHOON_CHOICE', {
                      targetPlayer,
                      targetZoneIndex: zoneIndex,
                    });
                    setIsSelectingMSTTarget(false);
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para SnowmanEater, processar escolha
                if (isSelectingSnowmanEaterTarget && zoneIndex !== undefined && card) {
                  // Verificar se o monstro está face-up (attack ou defense)
                  const isFaceUp = card.position === 'attack' || card.position === 'defense';
                  if (isFaceUp) {
                    const targetPlayer = 'player'; // Campo do próprio jogador
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'SNOWMAN_EATER_CHOICE', {
                        targetPlayer,
                        targetZoneIndex: zoneIndex,
                      });
                      setIsSelectingSnowmanEaterTarget(false);
                    }
                  } else {
                    // Mostrar mensagem se tentar escolher um monstro face-down
                    alert('SnowmanEater só pode destruir monstros face-up (ataque ou defesa)');
                  }
                  return;
                }
                
                console.log('🔍 [DuelArena] Card clicked:', {
                  name: card?.name,
                  description: card?.description,
                  hasDescription: !!card?.description,
                  descriptionLength: card?.description?.length || 0,
                  allKeys: Object.keys(card || {})
                });
                setSelectedCardInfo(card);
              }}
              onActivateCard={(card, zoneIndex) => {
                const cardName = (card?.name || card?.cardName || '').toLowerCase();
                const cardIdStr = String(card?.idCarta || card?.id || card?.cardId || '').toLowerCase();
                const isRingOfDestruction =
                  cardName.includes('ring of destruction') ||
                  cardIdStr.includes('ringofdestruction') ||
                  cardIdStr.includes('83555666') ||
                  cardIdStr.includes('ygopro_83555666');
                const isTrap = card?.type === 'Trap' || card?.cardType === 'Trap';
                const globalTurnCounter = duelData?.turnCounter ?? myTurnCounter ?? 1;
                const ringSameTurnSetBlocked =
                  isRingOfDestruction &&
                  isTrap &&
                  card?.trapSetTurnCounter != null &&
                  Number(card.trapSetTurnCounter) === Number(globalTurnCounter);
                const canActivateSetSpellTrap =
                  !ringSameTurnSetBlocked &&
                  ((isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2')) ||
                    (isRingOfDestruction && isTrap && currentPhase === 'BATTLE'));

                if (duelId && user?.id && canActivateSetSpellTrap) {
                  // Verificar se há modal de escolha aberto (qualquer efeito que exija conclusão)
                  if (showOpponentHandRevealed || showGracefulCharityModal || showUnitedWeStandModal || showMagePowerModal || currentPendingChoice != null) {
                    alert('Você precisa completar a escolha pendente antes de fazer outras ações!');
                    return;
                  }
                  
                  performAction(duelId, user.id, 'ACTIVATE_SPELL_TRAP', {
                    cardId: card.idCarta || card.id || card.cardId,
                    cardName: card.name || card.cardName,
                    zoneIndex: zoneIndex,
                    position: 'face-up',
                    spellActivatedFromField: true,
                    originalSpellTrapPosition: card.position || 'set',
                  });
                }
              }}
            />
            </div>
            </div>
            </div>

            <div
              ref={duelBottomChromeRef}
              className="flex w-full min-w-0 max-w-full flex-shrink-0 flex-col items-stretch justify-end overflow-x-visible"
            >

            {/* Aviso de seleção de alvo de ataque */}
            {attackingMonsterIndex !== null && currentPhase === 'BATTLE' && effectiveIsMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-red-600/95 to-orange-600/95 text-white px-6 py-3 rounded-lg shadow-2xl border-2 border-red-400/70"
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">⚔️</span>
                  <div>
                    <p className="font-bold text-lg">Selecione o alvo do ataque</p>
                    <p className="text-sm opacity-90">
                      {opponentMonsters.some((m: any) => m !== null && m !== undefined)
                        ? 'Clique em um monstro do oponente para atacar'
                        : 'Clique em um monstro do oponente ou em um slot vazio para ataque direto'}
                    </p>
                  </div>
                  <button
                    onClick={() => setAttackingMonsterIndex(null)}
                    className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}

            {/* Aviso de seleção de slot de spell/trap */}
            {selectingSpellTrapSlot !== null && currentPhase !== 'BATTLE' && isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-green-600/95 to-purple-600/95 text-white px-6 py-3 rounded-lg shadow-2xl border-2 border-green-400/70"
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{selectingSpellTrapSlot.position === 'set' ? '📜' : '✨'}</span>
                  <div>
                    <p className="font-bold text-lg">Selecione um slot de Spell/Trap</p>
                    <p className="text-sm opacity-90">Clique em um slot vazio de Spell/Trap para colocar {selectingSpellTrapSlot.card.name}</p>
                  </div>
                  <button
                    onClick={() => setSelectingSpellTrapSlot(null)}
                    className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}

            {/* Aviso de seleção de alvo para efeito do ChaosSorcerer - REMOVIDO (agora usa modal) */}

            {/* Overlay de Fase - Aparece rapidamente quando muda */}
            <AnimatePresence>
              {showPhaseOverlay && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.3, y: -100 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.3, y: 100 }}
                  transition={{ 
                    duration: 0.25,
                    ease: [0.34, 1.56, 0.64, 1]
                  }}
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-slate-700/90 via-slate-600/90 to-slate-700/90 rounded-2xl border-2 border-slate-400/50 shadow-xl px-16 py-12 backdrop-blur-md"
                  >
                    <motion.h2 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                      className="text-6xl font-bold text-white text-center tracking-wider"
                    >
                      {phaseOverlayText}
                    </motion.h2>
                    {phaseOverlaySubtext && (
                      <motion.p 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: 0.1 }}
                        className="text-2xl text-slate-200 text-center mt-4 font-semibold"
                      >
                        {phaseOverlaySubtext}
                      </motion.p>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Animação de invocação do Slifer: substitui o background do duelo quando invocado */}
            <AnimatePresence>
              {showSliferAnimation && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="fixed inset-0 z-[10] flex items-center justify-center pointer-events-none"
                >
                  <img
                    src="/images/Animations/Slifer.gif"
                    alt="Slifer the Sky Dragon"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay de Invocação - Aparece rapidamente quando invoca */}
            <AnimatePresence>
              {showSummonOverlay && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.3, y: 100 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.3, y: -100 }}
                  transition={{ 
                    duration: 0.25,
                    ease: [0.34, 1.56, 0.64, 1]
                  }}
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-amber-600/90 via-orange-600/90 to-amber-600/90 rounded-2xl border-2 border-amber-400/50 shadow-xl px-16 py-12 backdrop-blur-md"
                  >
                    <motion.h2 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                      className="text-6xl font-bold text-white text-center tracking-wider"
                    >
                      SUMMON!
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.1 }}
                      className="text-2xl text-amber-100 text-center mt-4 font-semibold"
                    >
                      {summonCardName}
                    </motion.p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Faixa de ações: só reserva altura quando há botão (fases / roubar turno) */}
            {!isSpectator && (
              <div
                className={`flex w-full flex-shrink-0 flex-col items-center justify-center overflow-hidden px-0.5 sm:px-2 ${
                  effectiveIsMyTurn ||
                  (!effectiveIsMyTurn &&
                    turnTimeRemainingFromServer !== null &&
                    turnTimeRemainingFromServer <= 0)
                    ? 'min-h-[52px] gap-1 py-1 sm:min-h-[72px] sm:gap-2 sm:py-2'
                    : 'h-0 min-h-0 max-h-0 gap-0 py-0'
                }`}
              >
                {/* Mesma faixa visual das fases: roubar turno ou barra de fases */}
                {!effectiveIsMyTurn && turnTimeRemainingFromServer !== null && turnTimeRemainingFromServer <= 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex w-full max-w-3xl justify-center px-2"
                  >
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleStealTurn}
                      className="w-full max-w-sm flex items-center justify-center min-h-11 py-2.5 px-3 sm:py-3 sm:px-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base transition-all border border-amber-600/50 bg-gradient-to-r from-slate-900/90 via-red-950/40 to-slate-900/90 text-white shadow-md shadow-red-950/25 backdrop-blur-sm ring-1 ring-red-500/25 animate-pulse touch-manipulation"
                      title="Roubar turno"
                    >
                      ROUBAR TURNO
                    </motion.button>
                  </motion.div>
                )}

                {/* Fases do Jogo - só no seu turno */}
                {effectiveIsMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full max-w-4xl flex-nowrap justify-center items-center gap-0.5 overflow-x-auto overflow-y-hidden py-1 px-1 sm:gap-2.5 sm:py-2.5 sm:px-4 bg-gradient-to-r from-slate-900/90 via-amber-950/50 to-slate-900/90 rounded-lg sm:rounded-2xl border border-amber-600/50 shadow-md shadow-amber-950/20 backdrop-blur-sm [scrollbar-width:thin]"
              >
                {['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'].map((phase, index) => {
                  const phaseAbbreviations: { [key: string]: string } = {
                    DRAW: 'DP',
                    STANDBY: 'SBP',
                    MAIN1: 'MP1',
                    BATTLE: 'BP',
                    MAIN2: 'MP2',
                    END: 'EP'
                  };
                  
                  const phaseFullNames: { [key: string]: string } = {
                    DRAW: 'Draw Phase (Fase de Compras)',
                    STANDBY: 'Standby Phase (Fase de Apoio)',
                    MAIN1: 'Main Phase 1 (Fase Principal 1)',
                    BATTLE: 'Battle Phase (Fase de Batalha)',
                    MAIN2: 'Main Phase 2 (Fase Principal 2)',
                    END: 'End Phase (Fase Final)'
                  };
                  
                  const phases = ['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'];
                  const normCurrentPhase = normalizeDuelPhase(currentPhase);
                  const phaseIndex = phases.indexOf(normCurrentPhase);
                  const isActive = normCurrentPhase === phase;
                  const isPast = phaseIndex > index;
                  const isFuture = phaseIndex < index;
                  
                  // Primeiro turno só de quem começou o duelo (assento 1 ou 2), não após roubar turno (hasTurnChanged)
                  const globalTurnCounter = duelData?.turnCounter ?? myTurnCounter ?? 1;
                  const firstTurnSeat =
                    (duelData?.player1Field as { firstTurnPlayer?: number } | undefined)?.firstTurnPlayer ??
                    (duelData?.player2Field as { firstTurnPlayer?: number } | undefined)?.firstTurnPlayer;
                  const stolenTurnOccurred =
                    (duelData?.player1Field as { stolenTurnOccurred?: boolean } | undefined)?.stolenTurnOccurred === true ||
                    (duelData?.player2Field as { stolenTurnOccurred?: boolean } | undefined)?.stolenTurnOccurred === true;
                  const isFirstTurnOfStartingPlayer =
                    !stolenTurnOccurred &&
                    globalTurnCounter === 1 &&
                    isMyTurn &&
                    !hasTurnChanged &&
                    (firstTurnSeat === 1 || firstTurnSeat === 2
                      ? currentTurn === firstTurnSeat
                      : currentTurn === 1 && isPlayer1);
                  const isBattlePhaseDisabled = phase === 'BATTLE' && isFirstTurnOfStartingPlayer;
                  
                  // Função para ir diretamente para a fase clicada
                  const handlePhaseClick = async () => {
                    if (!duelId || !user?.id || phase === 'DRAW' || isPast || isBattlePhaseDisabled) return;
                    
                    const socket = getSocket();
                    if (!socket || !socket.connected) return;
                    
                    // Se clicou na fase atual, não fazer nada (exceto END)
                    if (isActive && phase !== 'END') {
                      return;
                    }
                    
                    // Se clicou na fase atual (END), descartar automaticamente e avançar turno
                    if (isActive && phase === 'END') {
                      // O backend vai descartar automaticamente se tiver mais de 6 cartas e avançar o turno
                      socket.emit('nextPhase', { duelId, userId: user.id });
                      return;
                    }
                    
                    // Se clicou em uma fase futura, ir diretamente para ela
                    if (isFuture) {
                      // Se é o primeiro turno do primeiro jogador e está tentando ir para BATTLE, ir para MAIN2
                      let targetPhase = phase;
                      if (isFirstTurnOfStartingPlayer && phase === 'BATTLE') {
                        targetPhase = 'MAIN2';
                      }
                      
                      // Chamar goToPhase para ir diretamente para a fase alvo
                      socket.emit('goToPhase', { duelId, userId: user.id, targetPhase });
                    }
                  };
                  
                  return (
                    <React.Fragment key={phase}>
                      {effectiveIsMyTurn ? (
                        <>
                          {phase === 'END' && isActive ? (
                            <motion.button
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleEndTurn()}
                              className="min-h-10 min-w-[6.5rem] px-2.5 py-2 sm:min-h-11 sm:min-w-[164px] sm:px-5 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-base transition-all border bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-300/90 shadow-sm shadow-green-500/40 hover:from-green-500 hover:to-emerald-500 cursor-pointer ring-1 ring-green-400/35 touch-manipulation"
                              title={myHand.length > 6 ? `Finalizar turno (${myHand.length - 6} cartas serão descartadas automaticamente)` : 'Finalizar turno e passar para o oponente'}
                            >
                              <span className="hidden sm:inline">✓ Finalizar turno</span>
                              <span className="sm:hidden">✓ Fim</span>
                            </motion.button>
                          ) : (
                            <motion.button
                              whileHover={!isPast && phase !== 'DRAW' && !isBattlePhaseDisabled ? { y: -1, scale: 1.03 } : {}}
                              whileTap={!isPast && phase !== 'DRAW' && !isBattlePhaseDisabled ? { scale: 0.95 } : {}}
                              onClick={handlePhaseClick}
                              disabled={isPast || phase === 'DRAW' || isBattlePhaseDisabled}
                              className={`min-h-10 min-w-10 px-2 py-2 sm:min-h-11 sm:min-w-[62px] sm:px-3 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-base transition-all border touch-manipulation ${
                                isBattlePhaseDisabled
                                  ? 'bg-black/30 text-white/40 border-white/10 cursor-not-allowed opacity-50'
                                  : isActive && phase === 'DRAW'
                                  ? 'bg-gradient-to-br from-sky-600 to-blue-800 text-white border-sky-400/80 shadow-lg shadow-blue-900/40 cursor-wait ring-1 ring-sky-400/50 animate-pulse'
                                  : isActive && phase === 'BATTLE'
                                  ? 'bg-gradient-to-br from-red-600 to-rose-900 text-white border-red-400/90 shadow-xl shadow-red-600/40 hover:from-red-500 hover:to-rose-800 cursor-pointer ring-2 ring-red-400/60'
                                  : isActive
                                  ? 'bg-gradient-to-br from-slate-600 to-slate-800 text-white border-amber-500/50 shadow-lg shadow-black/30 hover:from-slate-500 hover:to-slate-700 cursor-pointer ring-1 ring-amber-500/40'
                                  : isFuture
                                  ? 'bg-gradient-to-br from-amber-600 to-orange-700 text-white border-amber-400/80 shadow-lg shadow-amber-900/40 hover:from-amber-500 hover:to-orange-600 cursor-pointer ring-1 ring-amber-400/50'
                                  : isPast
                                  ? 'bg-black/30 text-white/40 border-white/10 cursor-not-allowed opacity-50'
                                  : 'bg-black/30 text-white/40 border-white/10 cursor-not-allowed opacity-50'
                              }`}
                              title={
                                isBattlePhaseDisabled
                                  ? 'Você não pode atacar no primeiro turno do jogo'
                                  : isPast 
                                  ? 'Fase já passada' 
                                  : phase === 'DRAW' 
                                  ? 'Processando automaticamente...' 
                                  : isFuture
                                  ? `Avançar para ${phaseFullNames[phase]}`
                                  : phaseFullNames[phase]
                              }
                            >
                              {phaseAbbreviations[phase]}
                            </motion.button>
                          )}
                        </>
                      ) : null}
                      {index < 5 && (
                        <div className="hidden sm:flex items-center">
                          <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                            isPast ? 'bg-emerald-500' : isActive ? 'bg-amber-300 animate-pulse' : 'bg-amber-600/45'
                          }`} />
                          {isFuture && (
                            <div className="w-10 h-2 bg-gradient-to-r from-amber-500/60 to-transparent rounded-full" />
                          )}
                          {!isFuture && !isActive && !isPast && (
                            <div className="w-10 h-2 bg-slate-700/30 rounded-full" />
                          )}
                          {isPast && (
                            <div className="w-10 h-2 bg-emerald-500/55 rounded-full" />
                          )}
                          {isActive && (
                            <div className="w-10 h-2 bg-gradient-to-r from-amber-400/60 to-transparent rounded-full" />
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </motion.div>
                )}
              </div>
            )}

            {/* Mão inferior: jogador = minha mão; espectador = mão do P2 (face-up) */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="relative mt-1 flex w-full min-w-0 max-w-full flex-shrink-0 flex-col justify-center overflow-x-hidden overflow-y-visible md:overflow-y-hidden px-1 py-0.5 sm:mt-2 sm:px-2 sm:py-1"
              style={{ 
                paddingTop: useScrollArenaLayout ? '4px' : '6px',
                paddingBottom: useScrollArenaLayout ? '14px' : '4px',
                maxWidth: '100%',
                height: handRowFixedHeightPx,
                minHeight: handRowFixedHeightPx,
                maxHeight: handRowFixedHeightPx,
              }}
              onClick={(e) => {
                if (isSpectator) return;
                // Fechar zoom se clicar fora das cartas
                if (e.target === e.currentTarget) {
                  setZoomedCard(null);
                  setSelectedCardForField(null);
                }
              }}
            >
              {isSpectator ? (
                opponentHand.length === 0 ? (
                  <div className="flex h-full min-h-0 w-full flex-col items-center justify-center text-center text-slate-400">
                    <p className="text-sm font-bold text-amber-200/90">
                      Mão {duelData?.player2?.nickname || 'P2'}: vazia
                    </p>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 w-full flex-col gap-0.5">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
                      Mão {duelData?.player2?.nickname || 'P2'} ({opponentHand.length})
                    </p>
                    <div className="flex h-full min-h-0 w-full items-center justify-start gap-1 overflow-x-auto overflow-y-hidden px-2 py-0.5 sm:gap-2 sm:px-4">
                      {opponentHand.map((card: any, index: number) => (
                        <div
                          key={`spec-p2-hand-${card?.instanceId || index}-${card?.idCarta || card?.id || index}`}
                          className="flex-shrink-0 overflow-hidden rounded-lg border-2 border-amber-400/50 shadow-md"
                          style={
                            handCardWidthPx != null
                              ? { width: Math.min(handCardWidthPx, 96), aspectRatio: '59/86' }
                              : { width: 72, aspectRatio: '59/86' }
                          }
                          title={card?.name || card?.cardName || `Carta ${index + 1}`}
                        >
                          <CardImage card={card} className="h-full w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : myHand.length === 0 ? (
                <div className="flex h-full min-h-0 w-full flex-col items-center justify-center px-2 text-center text-slate-300">
                  <p className="text-lg font-bold">Nenhuma carta na mão</p>
                  <p className="text-sm text-slate-400 mt-2">Deck: {myDeck.length} cartas restantes</p>
                </div>
              ) : (
                <div 
                  data-hand-container 
                  className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto overflow-y-visible md:overflow-y-hidden overscroll-x-contain px-2 py-0 touch-pan-x sm:gap-3 sm:px-3" 
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(255, 255, 255, 0.35) rgba(0,0,0,0.2)',
                    maxWidth: '100%',
                    WebkitOverflowScrolling: 'touch',
                  }}
                  onWheel={(e) => {
                    const container = e.currentTarget;
                    const { scrollLeft, scrollWidth, clientWidth } = container;
                    const canScrollX = scrollWidth > clientWidth + 1;
                    if (!canScrollX) return;
                    // Roda vertical → scroll horizontal; shift+roda também
                    const dy = e.deltaY;
                    const dx = e.deltaX;
                    if (Math.abs(dx) >= Math.abs(dy)) {
                      return;
                    }
                    const atStart = scrollLeft <= 0;
                    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
                    const goingLeft = dy < 0;
                    const goingRight = dy > 0;
                    if ((atStart && goingLeft) || (atEnd && goingRight)) {
                      return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    container.scrollLeft += dy;
                  }}
                >
                {(() => {
                  // Log todas as cartas na mão para debug do Dark Armed Dragon
                  const darkArmedDragonInHand = myHand.find((c: any) => {
                    if (!c) return false;
                    const name = (c?.name || c?.cardName || '').toLowerCase().trim();
                    const idCarta = (c?.idCarta || '').toLowerCase().trim();
                    // Verificação exata - deve ser exatamente "Dark Armed Dragon"
                    const isDarkArmedDragon = name === 'dark armed dragon' || name === 'dark-armed dragon' ||
                           idCarta === 'darkarmeddragon' || idCarta === 'dark-armeddragon' || idCarta === 'darkarmed-dragon' ||
                           idCarta === 'darkarmeddragon';
                    if (isDarkArmedDragon) {
                      console.log('🔍 [Dark Armed Dragon] Dark Armed Dragon encontrado na mão:', {
                        name: c.name || c.cardName,
                        idCarta: c.idCarta,
                        id: c.id,
                        cardId: c.cardId,
                        fullCard: c
                      });
                    }
                    return isDarkArmedDragon;
                  });
                  return null;
                })()}
                {myHand.map((card: any, index: number) => {
                  const uniqueKey = card.instanceId
                    ? `my-hand-${card.instanceId}`
                    : `my-hand-${index}-${card.idCarta || card.id || card.cardId || index}`;
                  const cardType = card.type || card.cardType;
                  const isSpellOrTrap = cardType === 'Spell' || cardType === 'Trap';
                  const isMonster = cardType === 'Monster';
                  const canDrag = isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2' || currentPhase === 'STANDBY') && (isMonster || isSpellOrTrap);
                  
                  return (
                  <motion.div
                    key={uniqueKey}
                    data-hand-card-index={index}
                    initial={{ y: 100, opacity: 0, rotate: -5 }}
                    animate={{
                      y: 0,
                      opacity: 1,
                      rotate: 0,
                    }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
                    className={`relative flex-shrink-0 overflow-visible transition-all ${
                      handCardWidthPx != null
                        ? ''
                        : 'aspect-[59/86] w-[144px] min-[400px]:w-[160px] min-[520px]:w-[178px] min-[768px]:w-[200px] lg:w-[216px] xl:w-[232px]'
                    } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                    style={
                      handCardWidthPx != null
                        ? {
                            width: useScrollArenaLayout ? Math.max(handCardWidthPx, 80) : handCardWidthPx,
                            aspectRatio: '59 / 86',
                          }
                        : undefined
                    }
                    title={card.name || `Carta ${index + 1}`}
                    draggable={canDrag}
                    onDragStartCapture={(e) => {
                      if (canDrag) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData(
                          'application/json',
                          JSON.stringify({ card, handIndex: index }),
                        );
                        const el = e.currentTarget as HTMLElement;
                        const rect = el.getBoundingClientRect();
                        const dw = rect.width;
                        const dh = rect.height;
                        const dragImage = el.cloneNode(true) as HTMLElement;
                        dragImage.style.position = 'absolute';
                        dragImage.style.top = '-1000px';
                        dragImage.style.width = `${dw}px`;
                        dragImage.style.height = `${dh}px`;
                        document.body.appendChild(dragImage);
                        e.dataTransfer.setDragImage(dragImage, dw / 2, dh / 2);
                        setTimeout(() => document.body.removeChild(dragImage), 0);
                      }
                    }}
                    onDragEndCapture={() => {
                      // O estado de arrastar é limpo pelo fim do gesto.
                    }}
                      onClick={(e) => {
                      e.stopPropagation();
                      // Ao clicar, mostrar informações da carta
                      console.log('🔍 [DuelArena] Hand card clicked:', {
                        name: card?.name,
                        description: card?.description,
                        hasDescription: !!card?.description,
                        descriptionLength: card?.description?.length || 0,
                        allKeys: Object.keys(card || {})
                      });
                      setSelectedCardInfo(card);
                      setSelectedCardForField(null); // Limpar seleção
                    }}
                  >
                    <CardImage
                      card={card}
                      className="w-full h-full"
                      fallback="/images/fundoCarta.webp"
                    />
                    
                    {/* Botões de ação - Mostra botões de invocar */}
                    {(() => {
                      const isZoomed = zoomedCard && isSameCard(zoomedCard, card);
                      const shouldShow = isMyTurn && !isZoomed;
                      const cardType = card.type || card.cardType;
                      const isMonster = cardType === 'Monster';
                      const isSpellOrTrap = cardType === 'Spell' || cardType === 'Trap';
                      
                      if (!shouldShow) return null;
                      
                      // Mostrar botões normais de invocar
                      if (isMonster || isSpellOrTrap) {
                        return (
                          <div 
                            className="absolute left-0.5 -top-1.5 z-50 flex max-w-[min(100%,calc(100%-4px))] flex-nowrap items-center justify-start gap-0.5 overflow-x-auto overflow-y-visible rounded-sm bg-black/5 px-px py-px [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pointer-events-auto sm:left-1 sm:top-1 sm:max-w-none sm:gap-2 sm:overflow-visible sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0"
                            style={{ 
                              zIndex: 10000,
                              transform: `scale(${handActionOverlayScale})`,
                              transformOrigin: 'top left',
                            }}
                          >
                            {isMonster ? (
                              <>
                                {(() => {
                                  // Nível: suportar card.level, card.card?.level e card.cardLevel (estruturas diferentes da mão/API)
                                  const cardLevel = Number(card.level ?? card.card?.level ?? card.cardLevel ?? 0) || 0;
                                  // Permitir invocação em MAIN1, MAIN2 ou STANDBY (STANDBY muda automaticamente para MAIN1)
                                  const isInMainPhase = (currentPhase === 'MAIN1' || currentPhase === 'MAIN2' || currentPhase === 'STANDBY');
                                  const availableMonstersCount = myMonsters.filter(m => m !== null && m !== undefined).length;
                                  
                                  // Debug: Log quando não pode invocar
                                  if (!isInMainPhase && isMonster) {
                                    console.log(`🔍 [DuelArena] Não está em fase principal - currentPhase: ${currentPhase}, isInMainPhase: ${isInMainPhase}`);
                                  }
                                  
                                  // Verificar se é Dark Armed Dragon (não pode ser invocado normalmente)
                                  const cardIdCarta = card.idCarta || card.id || card.cardId || '';
                                  const cardName = (card.name || card.cardName || '').toLowerCase().trim();
                                  // Verificação exata - deve ser exatamente "Dark Armed Dragon" ou variações exatas do ID
                                  const isDarkArmedDragon = cardIdCarta === 'DarkArmedDragon' ||
                                                          cardIdCarta === 'darkarmeddragon' ||
                                                          cardIdCarta === 'Dark-ArmedDragon' ||
                                                          cardIdCarta === 'DarkArmed-Dragon' ||
                                                          cardName === 'dark armed dragon' ||
                                                          cardName === 'dark-armed dragon';
                                  
                                  // Se for Dark Armed Dragon, não mostrar botões de invocação normal aqui
                                  // (será tratado mais abaixo com verificação de 3 Dark no cemitério)
                                  // NÃO retornar null aqui - deixar o código continuar para mostrar o botão de invocação especial
                                  // if (isDarkArmedDragon) {
                                  //   return null; // Não mostrar botões de invocação normal
                                  // }
                                  
                                  // Verificar se é Swift Gaia The Fierce Knight
                                  const isSwiftGaia = cardIdCarta.toLowerCase().includes('swiftgaiathefierceknight') || 
                                                      card.name?.toLowerCase().includes('swift gaia') ||
                                                      card.name?.toLowerCase().includes('swiftgaia');
                                  const isOnlyCardInHand = myHand.length === 1;
                                  const canSummonSwiftGaiaWithoutTribute = isSwiftGaia && isOnlyCardInHand;
                                  
                                  // Determinar quantos tributos são necessários
                                  let requiredTributes = 0;
                                  if (cardLevel >= 7) {
                                    requiredTributes = 2;
                                  } else if (cardLevel >= 5) {
                                    requiredTributes = 1;
                                  }
                                  const isSlifer = /slifer\s*the\s*sky\s*dragon/i.test((card.name || card.cardName || ''));
                                  const isObelisk = /obelisk\s*the\s*tormentor/i.test((card.name || card.cardName || ''));
                                  if (isSlifer || isObelisk) requiredTributes = 3;
                                  
                                  // Se é Swift Gaia e único card na mão, não precisa de tributo
                                  if (canSummonSwiftGaiaWithoutTribute) {
                                    requiredTributes = 0;
                                  }
                                  
                                  // Verificar se pode invocar (sem tributo ou com tributos disponíveis)
                                  // IMPORTANTE: Sempre mostrar os botões, mesmo quando normalSummonUsed é true
                                  // Eles ficarão desabilitados para indicar que não pode mais invocar
                                  const canSummonWithoutTribute = (cardLevel <= 4 || canSummonSwiftGaiaWithoutTribute) && !normalSummonUsed && isInMainPhase;
                                  const canSummonWithTribute = requiredTributes > 0 && !normalSummonUsed && isInMainPhase && availableMonstersCount >= requiredTributes;
                                  const canSummon = canSummonWithoutTribute || canSummonWithTribute;
                                  
                                  // isDisabled será true quando normalSummonUsed é true, mas os botões ainda devem aparecer
                                  // SEMPRE mostrar os botões quando isMonster é true, independente de isDisabled
                                  const isDisabled = !canSummon;
                                  
                                  const handleSummonClick = async (position: 'attack' | 'defense' | 'set') => {
                                    if (hasActionInProgress) {
                                      alert('Termine a invocação ou o efeito em andamento antes de usar outra carta.');
                                      return;
                                    }
                                    // Se estiver em STANDBY, mudar automaticamente para MAIN1
                                    if (currentPhase === 'STANDBY') {
                                      console.log(`🔄 [handleSummonClick] Tentativa de invocar na STANDBY - mudando automaticamente para MAIN1`);
                                      const socket = getSocket();
                                      if (socket && socket.connected) {
                                        socket.emit('goToPhase', { duelId, userId: user.id, targetPhase: 'MAIN1' });
                                        await new Promise(resolve => setTimeout(resolve, 80));
                                      } else {
                                        alert('Erro: Socket não conectado. Não foi possível mudar a fase.');
                                        return;
                                      }
                                    }
                                    
                                    if (isDisabled) {
                                      if (normalSummonUsed) {
                                        alert('Você já usou sua invocação normal neste turno!');
                                      } else if (requiredTributes > 0 && availableMonstersCount < requiredTributes) {
                                        alert(`Você precisa de ${requiredTributes} monstro(s) no campo para tributar, mas só tem ${availableMonstersCount}!`);
                                      } else {
                                        alert('Você só pode invocar monstros nas fases principais!');
                                      }
                                      return;
                                    }
                                    
                                    // Só exigir zona vazia quando NÃO for invocação por tributo (por tributo, as zonas são liberadas ao escolher os monstros)
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (requiredTributes === 0 && emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Se precisa de tributo, mostrar modal (pode abrir mesmo com 5 monstros - ao tributar, libera zona)
                                    if (requiredTributes > 0) {
                                      setTributeModalData({
                                        card,
                                        position,
                                        requiredTributes,
                                        handIndex: index,
                                      });
                                      setShowTributeModal(true);
                                      if (isSlifer) {
                                        if (sliferAnimationTimeoutRef.current) clearTimeout(sliferAnimationTimeoutRef.current);
                                        setShowSliferAnimation(true);
                                        sliferAnimationTimeoutRef.current = setTimeout(() => {
                                          setShowSliferAnimation(false);
                                          sliferAnimationTimeoutRef.current = null;
                                        }, 4500);
                                      }
                                    } else {
                                      // Invocação normal sem tributo - acionar animação antes
                                      // Atualizar estado local imediatamente para que os botões fiquem desabilitados
                                      setNormalSummonUsed(true);
                                      await triggerCardPlacementAnimation(card, emptyZoneIndex, true, index);
                                      performAction(duelId, user.id, 'SUMMON_MONSTER', {
                                        cardId: card.id || card.cardId || card.idCarta,
                                        cardName: card.name,
                                        zoneIndex: emptyZoneIndex,
                                        position,
                                      });
                                      setZoomedCard(null);
                                    }
                                  };
                                  
                                  // Verificar se é Cyber Dragon e se pode ser invocado por invocação especial
                                  const cardIdCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
                                  const isCyberDragon = cardName === 'cyberdragon' || 
                                                       cardName === 'cyber dragon' ||
                                                       cardIdCheck === 'cyberdragon' ||
                                                       cardIdCheck.includes('cyberdragon');
                                  
                                  // Verificar se é uma carta Chaos que requer invocação especial (ChaosSorcerer, ChaosEmperorDragon, BlackLusterSoldierEnvoyOfTheBeginning)
                                  // O backend usa isExactCard que compara idCarta.toLowerCase().trim() e também verifica o nome
                                  const cardIdForCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase().trim();
                                  const cardNameForCheck = (card.name || card.cardName || '').toLowerCase().trim();
                                  
                                  // Função auxiliar para verificar se corresponde (similar ao isExactCard do backend)
                                  const matchesCard = (idToCheck: string, nameToCheck: string, targetId: string, targetNameVariations: string[]) => {
                                    // Verificar por ID exato ou se contém
                                    if (idToCheck === targetId.toLowerCase() || idToCheck.includes(targetId.toLowerCase()) || targetId.toLowerCase().includes(idToCheck)) {
                                      return true;
                                    }
                                    // Verificar por nome (exato ou contém)
                                    for (const nameVar of targetNameVariations) {
                                      const nameVarLower = nameVar.toLowerCase();
                                      if (nameToCheck === nameVarLower || nameToCheck.includes(nameVarLower) || nameVarLower.includes(nameToCheck)) {
                                        return true;
                                      }
                                    }
                                    // Verificar se o nome corresponde ao padrão do backend (converte "ChaosSorcerer" -> "chaos sorcerer")
                                    const targetNameFromId = targetId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
                                    if (nameToCheck === targetNameFromId || nameToCheck.includes(targetNameFromId) || targetNameFromId.includes(nameToCheck)) {
                                      return true;
                                    }
                                    return false;
                                  };
                                  
                                  // Verificar se é uma das cartas Chaos (usando a mesma lógica do backend isExactCard)
                                  const isChaosSorcerer = matchesCard(
                                    cardIdForCheck,
                                    cardNameForCheck,
                                    'chaossorcerer',
                                    ['chaos sorcerer', 'chaossorcerer']
                                  );
                                  const isChaosEmperorDragon = matchesCard(
                                    cardIdForCheck,
                                    cardNameForCheck,
                                    'chaosemperordragon',
                                    ['chaos emperor dragon', 'chaosemperordragon']
                                  );
                                  const isBlackLusterSoldier = matchesCard(
                                    cardIdForCheck,
                                    cardNameForCheck,
                                    'blacklustersoldierenvoyofthebeginning',
                                    ['black luster soldier envoy of the beginning', 'blacklustersoldierenvoyofthebeginning', 'black luster soldier']
                                  ) || (typeof cardIdForCheck === 'string' && cardIdForCheck.includes('blacklustersoldier'));
                                  const isChaosCard = isChaosSorcerer || isChaosEmperorDragon || isBlackLusterSoldier;
                                  
                                  // Verificar se é Red-Eyes Darkness Metal Dragon
                                  const isRedEyesDarknessMetalDragon = cardIdForCheck === 'redeyesdarknessmetaldragon' ||
                                                                       cardIdForCheck === 'red-eyesdarknessmetaldragon' ||
                                                                       cardIdForCheck === 'redeyesdarknessmetaldragon' ||
                                                                       cardNameForCheck === 'red-eyes darkness metal dragon' ||
                                                                       cardNameForCheck === 'red eyes darkness metal dragon' ||
                                                                       cardNameForCheck.includes('red-eyes darkness metal dragon') ||
                                                                       (typeof cardIdForCheck === 'string' && cardIdForCheck.toLowerCase().includes('redeyesdarknessmetaldragon')) ||
                                                                       (typeof cardNameForCheck === 'string' && cardNameForCheck.includes('red-eyes darkness metal dragon'));
                                  
                                  // Verificação exata como no backend (isExactCard)
                                  // Log se detectou carta Chaos
                                  if (isChaosCard) {
                                    const cardType = isChaosSorcerer ? 'ChaosSorcerer' : 
                                                    isChaosEmperorDragon ? 'ChaosEmperorDragon' : 
                                                    'BlackLusterSoldierEnvoyOfTheBeginning';
                                    console.log(`✅ [DuelArena] ${cardType} DETECTADO!`, {
                                      cardIdForCheck,
                                      cardNameForCheck,
                                      isChaosSorcerer,
                                      isChaosEmperorDragon,
                                      isBlackLusterSoldier
                                    });
                                  }
                                  
                                  // Debug: Log para verificar se detectou carta Chaos
                                  if (isChaosCard) {
                                    const cardType = isChaosSorcerer ? 'ChaosSorcerer' : 
                                                    isChaosEmperorDragon ? 'ChaosEmperorDragon' : 
                                                    'BlackLusterSoldierEnvoyOfTheBeginning';
                                    console.log(`✅ [DuelArena] ${cardType} DETECTADO!`, {
                                      cardName: cardNameForCheck,
                                      cardIdCheck,
                                      cardIdForCheck,
                                      myGraveyardLength: myGraveyard.length,
                                      currentPhase,
                                      isMyTurn
                                    });
                                  } else {
                                    // Log se não detectou - pode ajudar a identificar o problema
                                    if (cardName.includes('chaos') || cardName.includes('sorcerer') || 
                                        cardIdCheck.includes('chaos') || cardIdCheck.includes('sorcerer')) {
                                      console.log('⚠️ [DuelArena] Carta parece ser ChaosSorcerer mas não foi detectada:', {
                                        cardName,
                                        cardIdCheck,
                                        cardIdForCheck,
                                        idCarta: card.idCarta,
                                        id: card.id,
                                        cardId: card.cardId
                                      });
                                    }
                                  }
                                  
                                  // Condições para invocação especial: oponente tem pelo menos 1 monstro E jogador não tem nenhum
                                  const opponentMonstersCount = opponentMonsters.filter((m: any) => m !== null && m !== undefined).length;
                                  const playerMonstersCount = myMonsters.filter((m: any) => m !== null && m !== undefined).length;
                                  const canSpecialSummonCyberDragon = isCyberDragon && 
                                                                      opponentMonstersCount >= 1 && 
                                                                      playerMonstersCount === 0 &&
                                                                      (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                                      isMyTurn;
                                  
                                  // Para ChaosSorcerer, o botão sempre aparece - o backend valida as condições ao abrir o modal
                                  
                                  const handleSpecialSummonCyberDragon = async (position: 'attack' | 'defense') => {
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Acionar animação antes de invocar
                                    await triggerCardPlacementAnimation(card, emptyZoneIndex, true, index);
                                    performAction(duelId, user.id, 'SPECIAL_SUMMON_CYBER_DRAGON', {
                                      cardId: card.id || card.cardId || card.idCarta,
                                      cardName: card.name,
                                      zoneIndex: emptyZoneIndex,
                                      position,
                                    });
                                    setZoomedCard(null);
                                  };
                                  
                                  const handleSpecialSummonChaosSorcerer = async () => {
                                    console.log('🔍 [handleSpecialSummonChaosSorcerer] Iniciando invocação especial do ChaosSorcerer');
                                    
                                    // Verificar se há zona vazia (mas não invocar ainda - só quando confirmar no modal)
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Priorizar instanceId (único), depois idCarta, id, cardId
                                    const cardIdToSend = card.instanceId || card.idCarta || card.id || card.cardId;
                                    console.log('🔍 [handleSpecialSummonChaosSorcerer] Enviando ação para abrir modal:', {
                                      actionType: 'START_CHAOS_SORCERER_SUMMON',
                                      cardId: cardIdToSend,
                                      instanceId: card.instanceId,
                                      idCarta: card.idCarta,
                                      id: card.id,
                                      cardName: card.name || card.cardName,
                                      duelId,
                                      userId: user.id,
                                      emptyZoneIndex
                                    });
                                    
                                    // NÃO remover a carta da mão ainda - apenas abrir o modal
                                    // A carta só será removida quando o usuário confirmar no modal
                                    performAction(duelId, user.id, 'START_CHAOS_SORCERER_SUMMON', {
                                      cardId: cardIdToSend,
                                    });
                                    setZoomedCard(null);
                                  };

                                  const handleSpecialSummonRedEyesDarknessMetalDragon = async () => {
                                    console.log('🔍 [handleSpecialSummonRedEyesDarknessMetalDragon] Iniciando invocação especial');
                                    
                                    // Verificar se há zona vazia (mas não invocar ainda - só quando confirmar no modal)
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Priorizar instanceId (único), depois idCarta, id, cardId (mesma ordem do ChaosSorcerer)
                                    const cardIdToSend = card.instanceId || card.idCarta || card.id || card.cardId;
                                    console.log('🔍 [handleSpecialSummonRedEyesDarknessMetalDragon] Enviando ação para abrir modal:', {
                                      actionType: 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON',
                                      cardId: cardIdToSend,
                                      instanceId: card.instanceId,
                                      idCarta: card.idCarta,
                                      id: card.id,
                                      cardName: card.name || card.cardName,
                                      duelId,
                                      userId: user.id,
                                      emptyZoneIndex
                                    });
                                    
                                    // NÃO remover a carta da mão ainda - apenas abrir o modal
                                    performAction(duelId, user.id, 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON', {
                                      cardId: cardIdToSend,
                                    });
                                    setZoomedCard(null);
                                  };

                                  // Se for uma carta Chaos, não mostrar botões de invocação normal (só invocação especial)
                                  // O botão sempre aparece - o backend valida as condições ao abrir o modal
                                  if (isChaosCard) {
                                    const cardDisplayName = isChaosSorcerer ? 'ChaosSorcerer' : 
                                                           isChaosEmperorDragon ? 'ChaosEmperorDragon' : 
                                                           'BlackLusterSoldierEnvoyOfTheBeginning';
                                    return (
                                      <>
                                        {/* Botão de Invocação Especial de cartas Chaos - sempre visível */}
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonChaosSorcerer();
                                          }}
                                          className="h-9 w-9 sm:h-10 sm:w-10 border rounded-lg flex items-center justify-center transition-all shadow-md bg-black/35 border-purple-400/70 cursor-pointer touch-manipulation"
                                          title={`Invocação Especial - ${cardDisplayName} - Bane 1 LIGHT e 1 DARK do cemitério - Não conta como invocação normal`}
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-2.5 h-2.5 sm:w-6 sm:h-6 object-contain"
                                          />
                                        </motion.button>
                                      </>
                                    );
                                  }

                                  // Verificar se é Dark Armed Dragon - verificação exata
                                  // Usar cardIdCarta e cardName que já foram declarados anteriormente (linha ~4374-4375), ou cardIdForCheck/cardNameForCheck se disponíveis
                                  // Verificação exata - deve ser exatamente "Dark Armed Dragon" ou variações exatas do ID
                                  // IMPORTANTE: cardIdCarta e cardName já foram definidos anteriormente, então podemos usá-los aqui
                                  const isDarkArmedDragonCheck = isDarkArmedDragon || // Reutilizar verificação anterior
                                                                 (cardIdCarta === 'DarkArmedDragon' ||
                                                                  cardIdCarta === 'darkarmeddragon' ||
                                                                  cardIdCarta === 'Dark-ArmedDragon' ||
                                                                  cardIdCarta === 'DarkArmed-Dragon' ||
                                                                  cardName === 'dark armed dragon' ||
                                                                  cardName === 'dark-armed dragon' ||
                                                                  (cardIdForCheck === 'darkarmeddragon' ||
                                                                   cardIdForCheck === 'dark-armeddragon' ||
                                                                   cardIdForCheck === 'darkarmed-dragon' ||
                                                                   cardNameForCheck === 'dark armed dragon' ||
                                                                   cardNameForCheck === 'dark-armed dragon'));
                                  
                                  // Log para verificar se Dark Armed Dragon está sendo detectado
                                  // Verificar se é potencialmente Dark Armed Dragon
                                  const mightBeDarkArmedDragon = cardName === 'dark armed dragon' || 
                                                                  cardName === 'dark-armed dragon' || 
                                                                  cardIdCarta.toLowerCase() === 'darkarmeddragon' || 
                                                                  cardIdForCheck === 'darkarmeddragon' ||
                                                                  (cardIdCarta.toLowerCase().includes('dark') && cardName.includes('dragon'));
                                  
                                  if (mightBeDarkArmedDragon) {
                                    console.log('🔍 [Dark Armed Dragon] Possível Dark Armed Dragon detectado:', {
                                      isDarkArmedDragon: isDarkArmedDragon,
                                      isDarkArmedDragonCheck: isDarkArmedDragonCheck,
                                      cardIdCarta: cardIdCarta,
                                      cardName: cardName,
                                      cardIdForCheck: cardIdForCheck,
                                      cardNameForCheck: cardNameForCheck,
                                      fullCard: card
                                    });
                                  }

                                  // Se for Red-Eyes Darkness Metal Dragon, não mostrar botões de invocação normal (só invocação especial)
                                  if (isRedEyesDarknessMetalDragon) {
                                    // Verificar se a própria carta é do Tipo Dragão
                                    const cardRace = (card.race || card.cardRace || '').toString().toUpperCase().trim();
                                    const isDragonType = cardRace === 'DRAGON' || cardRace === 'DRAGÃO' || cardRace.includes('DRAGON');
                                    
                                    if (!isDragonType) {
                                      return null; // Não mostrar botão se a carta não for do tipo Dragon
                                    }
                                    
                                    // Verificar se há monstros do Tipo Dragão face-up no campo
                                    const hasDragonFaceUp = myMonsters.some((monster: any) => {
                                      if (!monster || monster === null) return false;
                                      // Verificar se está face-up
                                      if (monster.position !== 'attack' && monster.position !== 'defense') return false;
                                      // Verificar se é do Tipo Dragão
                                      const race = (monster.race || monster.cardRace || '').toString().toUpperCase().trim();
                                      return race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
                                    });
                                    
                                    // Só mostrar o botão se houver pelo menos um Dragon face-up
                                    if (!hasDragonFaceUp) {
                                      return null;
                                    }
                                    
                                    return (
                                      <>
                                        {/* Botão de Invocação Especial do Red-Eyes Darkness Metal Dragon - aparece apenas quando há Dragon face-up */}
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonRedEyesDarknessMetalDragon();
                                          }}
                                          className="h-9 w-9 sm:h-10 sm:w-10 border rounded-lg flex items-center justify-center transition-all shadow-md bg-black/35 border-red-400/70 cursor-pointer touch-manipulation"
                                          title="Invocação Especial - Red-Eyes Darkness Metal Dragon - Bane 1 monstro do Tipo Dragão face-up que você controla"
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-2.5 h-2.5 sm:w-6 sm:h-6 object-contain"
                                          />
                                        </motion.button>
                                      </>
                                    );
                                  }

                                  // Se for Dark Armed Dragon, não mostrar botões de invocação normal (só invocação especial)
                                  if (isDarkArmedDragonCheck) {
                                    console.log('✅ [Dark Armed Dragon] Carta detectada como Dark Armed Dragon:', {
                                      cardIdCarta,
                                      cardName,
                                      cardIdForCheck,
                                      cardNameForCheck,
                                      isMyTurn,
                                      currentPhase
                                    });
                                    
                                    // Verificar se é o turno do jogador e está na fase principal
                                    if (!isMyTurn) {
                                      console.log('⚠️ [Dark Armed Dragon] Não é o turno do jogador');
                                      return null;
                                    }
                                    
                                    if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2') {
                                      console.log('⚠️ [Dark Armed Dragon] Não está na fase principal:', currentPhase);
                                      return null;
                                    }
                                    
                                    // Verificar se há exatamente 3 monstros Dark no cemitério
                                    // IMPORTANTE: Conta TODOS os monstros Dark, mesmo que tenham o mesmo nome
                                    // Cada carta no cemitério é contada separadamente, independente do nome
                                    const graveyardToCheck = myGraveyard || [];
                                    console.log('🔍 [Dark Armed Dragon] Verificando cemitério:', {
                                      graveyardLength: graveyardToCheck.length,
                                      graveyard: graveyardToCheck.map((c: any) => ({
                                        name: c?.name || c?.cardName,
                                        type: c?.type || c?.cardType,
                                        attribute: c?.attribute || c?.cardAttribute
                                      }))
                                    });
                                    
                                    const darkMonstersInGraveyard = graveyardToCheck.filter((c: any) => {
                                      if (!c) return false;
                                      const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
                                      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
                                      if (!isMonster) {
                                        console.log('🔍 [Dark Armed Dragon] Carta não é monstro:', {
                                          name: c?.name || c?.cardName,
                                          type: cardType
                                        });
                                        return false;
                                      }
                                      
                                      // Verificar atributo de múltiplas formas
                                      const attributeRaw = c.attribute || c.cardAttribute || c.card?.attribute || c.card?.cardAttribute || '';
                                      const attribute = String(attributeRaw).toUpperCase().trim();
                                      
                                      // Verificar se é Dark - aceitar DARK, TREVAS, DARKNESS, ou qualquer string que contenha DARK
                                      const isDark = attribute === 'DARK' || 
                                                    attribute === 'TREVAS' ||
                                                    attribute === 'DARKNESS' ||
                                                    attribute === 'DARK ATTRIBUTE' ||
                                                    (typeof attribute === 'string' && attribute.includes('DARK'));
                                      
                                      if (!isDark) {
                                        console.log('⚠️ [Dark Armed Dragon] Carta não é Dark:', {
                                          name: c?.name || c?.cardName,
                                          attribute: attribute,
                                          attributeRaw: attributeRaw,
                                          fullCard: c
                                        });
                                      } else {
                                        console.log('✅ [Dark Armed Dragon] Monstro Dark encontrado:', {
                                          name: c?.name || c?.cardName,
                                          attribute: attribute
                                        });
                                      }
                                      
                                      return isDark;
                                    });
                                    
                                    console.log('🔍 [Dark Armed Dragon] Monstros Dark encontrados:', {
                                      count: darkMonstersInGraveyard.length,
                                      monsters: darkMonstersInGraveyard.map((c: any) => ({
                                        name: c?.name || c?.cardName,
                                        attribute: c?.attribute || c?.cardAttribute
                                      }))
                                    });
                                    
                                    // Só mostrar o botão se houver exatamente 3 Dark no cemitério
                                    if (darkMonstersInGraveyard.length !== 3) {
                                      console.log('⚠️ [Dark Armed Dragon] Não há exatamente 3 Dark no cemitério:', darkMonstersInGraveyard.length);
                                      return null;
                                    }
                                    
                                    console.log('✅ [Dark Armed Dragon] Condições atendidas - mostrando botão de invocação especial');
                                    
                                    const handleSpecialSummonDarkArmedDragon = async () => {
                                      console.log('🔍 [handleSpecialSummonDarkArmedDragon] Iniciando invocação especial');
                                      
                                      // Verificar se há zona vazia
                                      const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                      if (emptyZoneIndex === -1) {
                                        alert('Todas as zonas de monstro estão ocupadas!');
                                        return;
                                      }
                                      
                                      const cardIdToSend = card.instanceId || card.idCarta || card.id || card.cardId;
                                      console.log('🔍 [handleSpecialSummonDarkArmedDragon] Enviando ação para invocação especial:', {
                                        actionType: 'START_DARK_ARMED_DRAGON_SUMMON',
                                        cardId: cardIdToSend,
                                        instanceId: card.instanceId,
                                        idCarta: card.idCarta,
                                        id: card.id,
                                        cardName: card.name || card.cardName,
                                        duelId,
                                        userId: user.id,
                                        emptyZoneIndex
                                      });
                                      
                                      performAction(duelId, user.id, 'START_DARK_ARMED_DRAGON_SUMMON', {
                                        cardId: cardIdToSend,
                                      });
                                      setZoomedCard(null);
                                    };
                                    
                                    return (
                                      <>
                                        {/* Botão de Invocação Especial do Dark Armed Dragon - aparece apenas quando há exatamente 3 Dark no cemitério */}
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonDarkArmedDragon();
                                          }}
                                          className="h-9 w-9 sm:h-10 sm:w-10 border rounded-lg flex items-center justify-center transition-all shadow-md bg-black/35 border-purple-400/70 cursor-pointer touch-manipulation"
                                          title="Invocação Especial - Dark Armed Dragon - Requer exatamente 3 monstros Dark no cemitério - Invoca em modo de ataque"
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-2.5 h-2.5 sm:w-6 sm:h-6 object-contain"
                                          />
                                        </motion.button>
                                      </>
                                    );
                                  }

                                  return (
                                    <>
                                      {/* Invocação Especial do Cyber Dragon: sempre em Ataque; no mesmo turno pode mudar para Defesa pelo botão no monstro */}
                                      {canSpecialSummonCyberDragon && (
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonCyberDragon('attack');
                                          }}
                                          className="h-9 w-9 sm:h-10 sm:w-10 border rounded-lg flex items-center justify-center transition-all shadow-md bg-black/35 border-red-400/70 cursor-pointer touch-manipulation"
                                          title={`Invocação Especial em Ataque (ATK: ${card.atk || 0}) - Não conta como invocação normal. No mesmo turno você pode mudar para Defesa pelo monstro no campo.`}
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Invocação Especial" 
                                            className="w-2.5 h-2.5 sm:w-6 sm:h-6 object-contain"
                                          />
                                        </motion.button>
                                      )}
                                      
                                      {/* Ícones de invocação normal (Ataque, Set). Para Cyber Dragon: mostrar também quando puder invocar por tributo (ex.: tem monstro no campo) */}
                                      {(!isCyberDragon || canSummonWithTribute) && (
                                      <>
                                      {/* Botão de Invocação Normal em Ataque (face-up) */}
                                      <motion.button
                                        whileHover={!isDisabled ? { y: -2 } : {}}
                                        whileTap={!isDisabled ? { scale: 0.9 } : {}}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSummonClick('attack');
                                        }}
                                        disabled={isDisabled}
                                        className={`h-9 w-9 shrink-0 rounded-lg border sm:h-10 sm:w-10 flex items-center justify-center transition-all shadow-md touch-manipulation ${
                                          isDisabled
                                            ? 'bg-black/30 border-gray-500/50 cursor-not-allowed opacity-50'
                                            : 'bg-black/30 border-red-400/70 cursor-pointer'
                                        }`}
                                        title={isDisabled 
                                          ? (normalSummonUsed 
                                              ? 'Você já usou sua invocação normal neste turno' 
                                              : requiredTributes > 0 && availableMonstersCount < requiredTributes
                                                ? `Precisa de ${requiredTributes} tributo(s), mas só tem ${availableMonstersCount} monstro(s)`
                                                : 'Só pode invocar nas fases principais')
                                          : canSummonSwiftGaiaWithoutTribute
                                            ? `Invocar em Ataque (ATK: ${card.atk || 0}) - Pode ser invocado sem tributo (único card na mão)`
                                            : requiredTributes > 0
                                              ? `Invocar em Ataque com tributo (ATK: ${card.atk || 0}) - Tributar ${requiredTributes} monstro(s) no campo`
                                              : `Invocar em Ataque (ATK: ${card.atk || 0}) - Invocação Normal`}
                                      >
                                        <img 
                                          src="/images/Duelo/Ataque.png" 
                                          alt="Ataque" 
                                          className="h-5 w-5 shrink-0 object-contain sm:h-6 sm:w-6 pointer-events-none"
                                        />
                                      </motion.button>
                                      
                                      {/* Set (Invocar face-down em defesa) - conta como invocação normal */}
                                      <motion.button
                                        whileHover={!isDisabled ? { y: -2 } : {}}
                                        whileTap={!isDisabled ? { scale: 0.9 } : {}}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSummonClick('set');
                                        }}
                                        disabled={isDisabled}
                                        className={`h-9 w-9 shrink-0 rounded-lg border sm:h-10 sm:w-10 flex items-center justify-center transition-all shadow-md touch-manipulation ${
                                          isDisabled
                                            ? 'bg-black/30 border-gray-500/50 cursor-not-allowed opacity-50'
                                            : 'bg-black/30 border-blue-400/70 cursor-pointer'
                                        }`}
                                        title={isDisabled 
                                          ? (normalSummonUsed 
                                              ? 'Você já usou sua invocação normal neste turno' 
                                              : requiredTributes > 0 && availableMonstersCount < requiredTributes
                                                ? `Precisa de ${requiredTributes} tributo(s), mas só tem ${availableMonstersCount} monstro(s)`
                                                : 'Só pode invocar nas fases principais')
                                          : canSummonSwiftGaiaWithoutTribute
                                            ? `Set (Face-down em Defesa) - Pode ser invocado sem tributo (único card na mão)`
                                            : requiredTributes > 0
                                              ? `Set com tributo (Face-down em Defesa) - Tributar ${requiredTributes} monstro(s) no campo`
                                              : `Set (Face-down em Defesa) - DEF: ${card.def || 0}`}
                                      >
                                        <span className="text-sm leading-none sm:text-base">🛡️</span>
                                      </motion.button>
                                      </>
                                      )}
                                    </>
                                  );
                                })()}
                              </>
                            ) : (
                              <>
                                {/* Botão "Ativar" - apenas para Spell cards (ativar da mão) */}
                                {(cardType === 'Spell' || card.type === 'Spell' || card.cardType === 'Spell') && (() => {
                                  // Verificar se é Last Will
                                  const cardId = (card.id || card.cardId || card.idCarta || '').toLowerCase();
                                  const cardName = (card.name || card.cardName || '').toLowerCase();
                                  const isLastWill = cardId.includes('lastwill') || cardName.includes('last will');
                                  
                                  // Para Last Will, verificar se um monstro foi destruído neste turno
                                  if (isLastWill && !monsterDestroyedThisTurn) {
                                    return null; // Não mostrar botão se Last Will e nenhum monstro foi destruído
                                  }

                                  const lpCostHand = getSpellActivationLpCost(card);
                                  const cannotPayLpHand =
                                    lpCostHand != null && myLifePoints < lpCostHand;
                                  const equipFromHand = isSpellEquipCard(card);
                                  const noEquipTargetHand =
                                    equipFromHand &&
                                    countMonstersEligibleForEquipSpell(myMonsters) < 1;
                                  const cannotActivateSpellHand = cannotPayLpHand || noEquipTargetHand;
                                  
                                  return (
                                  <motion.button
                                    whileHover={cannotActivateSpellHand ? {} : { y: -2 }}
                                    whileTap={cannotActivateSpellHand ? {} : { scale: 0.9 }}
                                    disabled={cannotActivateSpellHand}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (cannotPayLpHand) return;
                                      if (noEquipTargetHand) {
                                        alert(
                                          'Não há monstro no campo com a face para cima para equipar (é necessário pelo menos um alvo válido).',
                                        );
                                        return;
                                      }
                                      
                                      // Verificar se a carta precisa de modal antes de revelar
                                      // Essas cartas não vão para o campo - vão direto para o cemitério após ativação
                                      const cardName = (card.name || card.cardName || '').toLowerCase().replace(/\s+/g, '');
                                      const cardId = (card.id || card.cardId || card.idCarta || '').toLowerCase();
                                      const needsModal = 
                                        cardName.includes('mysticalspacetyphoon') ||
                                        cardId.includes('mysticalspacetyphoon') ||
                                        cardName.includes('monsterreborn') ||
                                        cardName.includes('changeofheart') ||
                                        cardName.includes('braincontrol') ||
                                        cardName.includes('soultaker') ||
                                        cardId.includes('soultaker') ||
                                        cardName.includes('lightningstorm') ||
                                        cardId.includes('lightningstorm') ||
                                        cardName.includes('snowmaneater') ||
                                        cardName.includes('lastwill') ||
                                        cardId.includes('lastwill');
                                      
                                      if (needsModal) {
                                        // Carta precisa de modal - não precisa de zona vazia (não vai para o campo)
                                        // Enviar zoneIndex como null ou undefined - o backend vai ignorar
                                        performAction(duelId, user.id, 'ACTIVATE_SPELL_TRAP', {
                                          cardId: card.id || card.cardId || card.idCarta,
                                          cardName: card.name,
                                          zoneIndex: null, // null porque não vai para o campo
                                          position: 'face-up',
                                          instanceId: card.instanceId,
                                          spellActivatedFromField: false,
                                        });
                                        setZoomedCard(null);
                                      } else {
                                        // Carta normal - precisa de zona vazia
                                        const emptyZoneIndex = mySpellTraps.findIndex(s => s === null || s === undefined);
                                        if (emptyZoneIndex !== -1) {
                                          // Acionar animação antes de ativar
                                          await triggerCardPlacementAnimation(card, emptyZoneIndex, false, index);
                                          // Ativar Spell da mão (vai direto para face-up)
                                          performAction(duelId, user.id, 'ACTIVATE_SPELL_TRAP', {
                                            cardId: card.id || card.cardId || card.idCarta,
                                            cardName: card.name,
                                            zoneIndex: emptyZoneIndex,
                                            position: 'face-up',
                                            instanceId: card.instanceId,
                                            spellActivatedFromField: false,
                                          });
                                          setZoomedCard(null);
                                        } else {
                                          alert('Todas as zonas de spell/trap estão ocupadas!');
                                        }
                                      }
                                    }}
                                    className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center transition-all border shadow-md touch-manipulation ${
                                      cannotActivateSpellHand
                                        ? 'cursor-not-allowed border-gray-500/50 bg-black/40 opacity-45 shadow-none'
                                        : 'cursor-pointer border-green-400/70 bg-gradient-to-br from-green-600/90 to-green-700/90 shadow-green-500/40 hover:from-green-500 hover:to-green-600 hover:shadow-green-500/50'
                                    }`}
                                    title={
                                      cannotPayLpHand && lpCostHand != null
                                        ? `Precisa de pelo menos ${lpCostHand} LP para ativar`
                                        : noEquipTargetHand
                                          ? 'É necessário um monstro com a face para cima no campo para ativar esta Equip Spell'
                                          : 'Ativar Spell (da mão)'
                                    }
                                  >
                                    <span className="text-sm sm:text-base leading-none">✨</span>
                                  </motion.button>
                                  );
                                })()}
                                
                                {/* Botão "Setar" - para Spell e Trap cards (colocar no campo em set) */}
                                <motion.button
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Encontrar primeiro slot vazio à esquerda
                                    const emptyZoneIndex = mySpellTraps.findIndex(s => s === null || s === undefined);
                                    if (emptyZoneIndex !== -1) {
                                      handlePlaceCardOnField(card, 'set', emptyZoneIndex, cardType, false, index);
                                      setZoomedCard(null);
                                    } else {
                                      alert('Todas as zonas de spell/trap estão ocupadas!');
                                    }
                                  }}
                                  className="h-9 w-9 sm:h-10 sm:w-10 bg-gradient-to-br from-purple-600/90 to-purple-700/90 hover:from-purple-500 hover:to-purple-600 border border-purple-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-md shadow-purple-500/40 hover:shadow-purple-500/50 touch-manipulation"
                                  title={cardType === 'Trap' || card.type === 'Trap' || card.cardType === 'Trap' 
                                    ? "Setar Trap (só pode ser setada, não ativada manualmente)" 
                                    : "Setar Spell (pode ser ativada depois)"}
                                >
                                  <span className="text-sm sm:text-base leading-none">📜</span>
                                </motion.button>
                              </>
                            )}
                          </div>
                        );
                      }
                      
                      return null;
                    })()}
                  </motion.div>
                );
              })}
              </div>
            )}
            </motion.div>
            </div>
            </div>
          </div>
            </div>
          </motion.div>

          {/* Sidebar direita: turno/fase/timer + cards dos duelistas */}
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden lg:flex h-full max-h-[min(100%,calc(100dvh-5.5rem))] min-h-0 w-[clamp(220px,23vw,280px)] max-w-[clamp(220px,23vw,280px)] flex-shrink-0 flex-col overflow-x-hidden border-l border-white/10 bg-transparent pt-2 pl-1.5 pr-1.5 xl:pl-2 xl:pr-2 pb-0 [scrollbar-width:thin]"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
            {/* Card Oponente */}
            <div className="flex-shrink-0 flex items-center justify-center">
              <motion.div transition={{ duration: 0.2 }} className="flex items-center gap-2 sm:gap-3 bg-transparent px-2.5 sm:px-3 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-red-400/30 shadow-lg flex-shrink-0 w-full">
                <div className="text-right min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-bold text-red-300 break-words hyphens-auto leading-snug">{topPanelClanTag ? `|${topPanelClanTag}| ` : ''}{topPanelUser?.nickname || opponent?.nickname}</div>
                  <motion.div key={isSpectator ? myLifePoints : opponentLifePoints} initial={{ scale: 1.2 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }} className="text-red-200 font-bold text-base sm:text-lg">LP: {(isSpectator ? myLifePoints : opponentLifePoints).toLocaleString()}</motion.div>
                </div>
                <motion.img whileHover={{ rotate: -5 }} src={getProfileImageUrl(topPanelUser?.profileImage ?? opponent?.profileImage)} alt="" className="w-14 h-14 xl:w-[4.5rem] xl:h-[4.5rem] rounded-xl border-2 border-red-400/70 object-cover shadow-lg flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                <motion.div className="flex flex-col items-center bg-transparent px-2 py-1.5 rounded-lg border-2 border-white/20 flex-shrink-0"><div className="text-white/70 text-[9px] font-bold">LV</div><div className="text-white text-base font-bold">{(topPanelUser as any)?.level ?? (opponent as any)?.level ?? 1}</div></motion.div>
              </motion.div>
            </div>
            {/* Mão do oponente na sidebar: só cartas reveladas; senão badge de contagem */}
            {!isSpectator && showOpponentHandRevealed && (cardEffectType === 'forcefulSentry' || cardEffectType === 'confiscation') && opponentHandRevealed.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-shrink-0 flex-wrap justify-end gap-1 py-1.5 overflow-y-visible w-full"
              >
                {opponentHandRevealed.map((card: any, index: number) => {
                  const uniqueKey = `opp-hand-sidebar-${index}-${card.idCarta || card.id || card.cardId || index}`;
                  return (
                    <motion.div
                      key={uniqueKey}
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: index * 0.04, type: 'spring', stiffness: 200 }}
                      className="w-[36px] h-[50px] flex-shrink-0 relative cursor-default"
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded border-2 border-yellow-400/80 shadow-lg shadow-yellow-500/50"
                      />
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
            {!isSpectator && !(showOpponentHandRevealed && (cardEffectType === 'forcefulSentry' || cardEffectType === 'confiscation')) && opponentHand.length > 0 && (
              <div className="flex flex-shrink-0 justify-end px-1 py-1">
                <span className="rounded-md border border-red-400/40 bg-red-950/40 px-2 py-1 text-[11px] font-semibold text-red-200">
                  Mão: {opponentHand.length}
                </span>
              </div>
            )}
            {isSpectator && (
              <div className="flex flex-shrink-0 flex-col items-end gap-1 px-1 py-1">
                <span className="rounded-md border border-sky-400/40 bg-sky-950/40 px-2 py-1 text-[11px] font-semibold text-sky-200">
                  P1 mão: {myHand.length}
                </span>
                <span className="rounded-md border border-amber-400/40 bg-amber-950/40 px-2 py-1 text-[11px] font-semibold text-amber-200">
                  P2 mão: {opponentHand.length}
                </span>
              </div>
            )}
            {/* Timer: compacto — sem comer toda a altura da sidebar */}
            <div className="flex flex-shrink-0 flex-col items-center justify-center gap-1.5 py-2">
              <div
                className={`text-center text-xs font-bold uppercase leading-snug tracking-wide sm:text-sm ${
                  isMyTurn ? 'text-blue-200' : 'text-slate-400'
                }`}
              >
                {isSpectator
                  ? (currentTurn === 1 ? `Turno: ${duelData.player1?.nickname || 'P1'}` : `Turno: ${duelData.player2?.nickname || 'P2'}`)
                  : (isMyTurn ? 'Seu turno' : 'Oponente')}
              </div>
              <div className="flex flex-col items-center gap-1">
                <motion.div
                  className={`flex aspect-square min-h-[3rem] min-w-[3rem] shrink-0 items-center justify-center rounded-xl border-2 px-2 font-mono text-2xl font-bold tabular-nums leading-none shadow-lg xl:min-h-[3.25rem] xl:min-w-[3.25rem] xl:text-[1.65rem] ${
                    isMyTurn
                      ? turnTimeLeft <= 10
                        ? 'border-red-400 bg-gradient-to-br from-red-950/90 to-red-900/70 text-red-100 shadow-red-500/40'
                        : 'border-blue-400 bg-gradient-to-br from-blue-950/90 to-indigo-900/70 text-blue-100 shadow-blue-500/35'
                      : 'border-slate-500 bg-gradient-to-br from-slate-800/90 to-slate-900/70 text-slate-200'
                  } ${turnTimeLeft >= 100 ? 'min-w-[3.5rem] xl:min-w-[3.75rem]' : ''}`}
                  animate={isMyTurn && turnTimeLeft <= 10 ? {
                    scale: [1, 1.06, 1],
                    boxShadow: [
                      '0 0 12px rgba(239, 68, 68, 0.45)',
                      '0 0 24px rgba(239, 68, 68, 0.7)',
                      '0 0 12px rgba(239, 68, 68, 0.45)',
                    ],
                  } : {}}
                  transition={{ duration: 0.6, repeat: Infinity }}
                >
                  <motion.span key={turnTimeLeft} initial={{ scale: 1.1 }} animate={{ scale: 1 }} className="select-none">
                    {turnTimeLeft}
                  </motion.span>
                </motion.div>
                {currentPhase && (
                  <div
                    className={`text-center font-semibold leading-snug ${
                      currentPhase === 'BATTLE'
                        ? 'text-base text-amber-200/95 xl:text-lg'
                        : 'text-sm text-slate-200 xl:text-[0.95rem]'
                    }`}
                  >
                    {currentPhase === 'DRAW' ? 'Compras' :
                      currentPhase === 'STANDBY' ? 'Apoio' :
                      currentPhase === 'MAIN1' ? 'MP1' :
                      currentPhase === 'BATTLE' ? 'Batalha' :
                      currentPhase === 'MAIN2' ? 'MP2' :
                      currentPhase === 'END' ? 'Final' : currentPhase}
                  </div>
                )}
              </div>
            </div>
            {/* Contagem da sua mão (a mão jogável fica no centro) */}
            {!isSpectator && myHand.length > 0 && (
              <div className="flex flex-shrink-0 justify-start px-1 py-1">
                <span className="rounded-md border border-blue-400/40 bg-blue-950/40 px-2 py-1 text-[11px] font-semibold text-blue-200">
                  Mão: {myHand.length}
                </span>
              </div>
            )}
            {/* Card seu */}
            <div className="flex-shrink-0 -mt-1 flex items-center justify-center">
              <motion.div transition={{ duration: 0.2 }} className="w-full">
                <motion.div transition={{ duration: 0.2 }} className="flex items-center gap-2 sm:gap-3 bg-transparent px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border-2 border-blue-400/30 shadow-lg flex-shrink-0 w-full">
                  <motion.div className="flex flex-col items-center bg-transparent px-2 py-1.5 rounded-lg border-2 border-white/20 flex-shrink-0"><div className="text-white/70 text-[9px] font-bold">LV</div><div className="text-white text-base font-bold">{bottomPanelUser?.level ?? user?.level ?? 1}</div></motion.div>
                  <motion.img whileHover={{ rotate: 5 }} src={getProfileImageUrl(bottomPanelUser?.profileImage)} alt="" className="w-14 h-14 xl:w-[4.5rem] xl:h-[4.5rem] rounded-xl border-2 border-blue-400/70 object-cover shadow-lg flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold text-blue-300 break-words hyphens-auto leading-snug">{bottomPanelClanTag ? `|${bottomPanelClanTag}| ${bottomPanelUser?.nickname}` : bottomPanelUser?.nickname}</div>
                    <motion.div key={isSpectator ? opponentLifePoints : myLifePoints} initial={{ scale: 1.2 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }} className="text-blue-200 font-bold text-base sm:text-lg">LP: {(isSpectator ? opponentLifePoints : myLifePoints).toLocaleString()}</motion.div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
            </div>
          </motion.div>
      </div>

      {/* Aviso de Descarte (quando está na fase END com mais de 6 cartas) */}
      {currentPhase === 'END' && !isSpectator && isMyTurn && myHand.length > 6 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-yellow-600 to-orange-600 text-white px-6 py-3 rounded-xl border-2 border-yellow-400 shadow-2xl ">
          <p className="text-lg font-bold text-center">
            ⚠️ Você tem {myHand.length} cartas na mão! {myHand.length - 6} carta(s) serão descartadas automaticamente ao finalizar o turno.
          </p>
        </div>
      )}

      {/* Modal do Extra Deck */}
      {showExtraDeckModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] duel-modal-scrim"
        >
          <div className="bg-black/30 rounded-2xl border-2 border-purple-500/50 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Extra Deck
              </h2>
              <button
                onClick={() => setShowExtraDeckModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-purple-400">{myExtraDeck.length}</span>
            </p>

            {myExtraDeck.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Extra Deck vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {myExtraDeck.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`extra-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Extra Deck card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg shadow-lg hover:shadow-xl transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal do Extra Deck do Oponente */}
      {showOpponentExtraDeckModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] duel-modal-scrim"
        >
          <div className="bg-black/30 rounded-2xl border-2 border-purple-500/50 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Extra Deck do Oponente
              </h2>
              <button
                onClick={() => setShowOpponentExtraDeckModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-purple-400">{opponentExtraDeck.length}</span>
            </p>

            {opponentExtraDeck.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Extra Deck vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {opponentExtraDeck.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`opponent-extra-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Opponent Extra Deck card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg shadow-lg hover:shadow-xl transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal do Cemitério do Oponente */}
      {showOpponentGraveyardModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] duel-modal-scrim"
        >
          <div className="bg-black/30 rounded-2xl border-2 border-white/20 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Cemitério do Oponente (GY)
              </h2>
              <button
                onClick={() => setShowOpponentGraveyardModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-yellow-400">{opponentGraveyard.length}</span>
            </p>

            {opponentGraveyard.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Cemitério vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {opponentGraveyard.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`opponent-gy-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Opponent Graveyard card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg border-2 border-purple-500/30 transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Seção de Cartas Banidas do Oponente */}
            <div className="mt-8 pt-8 border-t border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">
                Cartas Banidas do Oponente (Banished)
              </h3>
              <p className="text-slate-300 mb-6 text-center">
                Total de cartas banidas: <span className="font-bold text-red-400">{opponentBanished.length}</span>
              </p>

              {opponentBanished.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-lg">Nenhuma carta banida</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {opponentBanished.map((card, index) => {
                    const cardId = card.id || card.cardId || card.idCarta;
                    return (
                      <motion.div
                        key={`opponent-banished-${index}-${cardId}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="relative cursor-pointer aspect-[59/86]"
                        onClick={() => {
                          console.log('🔍 [DuelArena] Opponent Banished card clicked:', {
                            name: card?.name,
                            description: card?.description,
                            hasDescription: !!card?.description,
                            descriptionLength: card?.description?.length || 0,
                            allKeys: Object.keys(card || {})
                          });
                          setSelectedCardInfo(card);
                        }}
                      >
                        <CardImage
                          card={card}
                          className="w-full h-full rounded-lg border-2 border-red-500/50 transition-all opacity-80"
                          fallback="/images/fundoCarta.webp"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal do Cemitério */}
      {showGraveyardModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] duel-modal-scrim"
        >
          <div className="bg-black/30  rounded-2xl border-2 border-white/20 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Cemitério (GY)
              </h2>
              <button
                onClick={() => setShowGraveyardModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-yellow-400">{myGraveyard.length}</span>
            </p>

            {myGraveyard.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Cemitério vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {myGraveyard.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  const cardName = (card.name || card.cardName || '').toLowerCase();
                  const isElectromagneticTurtle = cardName.includes('electromagnetic turtle') || 
                                                   cardName.includes('tartaruga eletromagn') ||
                                                   cardId === 'ElectromagneticTurtle' ||
                                                   cardId === 'YGOPRO_34710660';
                  const canActivateTurtle = isElectromagneticTurtle && 
                                            !isMyTurn && 
                                            currentPhase === 'BATTLE' && 
                                            !(duelData?.player1Field?.electromagneticTurtleUsedThisDuel || duelData?.player2Field?.electromagneticTurtleUsedThisDuel);
                  
                  return (
                    <motion.div
                      key={`gy-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Graveyard card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg border-2 border-purple-500/30 transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                      {canActivateTurtle && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (duelId && user?.id) {
                              performAction(duelId, user.id, 'ACTIVATE_ELECTROMAGNETIC_TURTLE', {
                                graveyardIndex: index,
                              });
                              setShowGraveyardModal(false);
                            }
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-green-600/90 hover:bg-green-500/95 text-white font-bold text-xs rounded-lg transition-all"
                        >
                          ⚡ Ativar
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Seção de Cartas Banidas */}
            <div className="mt-8 pt-8 border-t border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">
                Cartas Banidas (Banished)
              </h3>
              <p className="text-slate-300 mb-6 text-center">
                Total de cartas banidas: <span className="font-bold text-red-400">{myBanished.length}</span>
              </p>

              {myBanished.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-lg">Nenhuma carta banida</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {myBanished.map((card, index) => {
                    const cardId = card.id || card.cardId || card.idCarta;
                    return (
                      <motion.div
                        key={`banished-${index}-${cardId}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="relative cursor-pointer aspect-[59/86]"
                        onClick={() => {
                          console.log('🔍 [DuelArena] Banished card clicked:', {
                            name: card?.name,
                            description: card?.description,
                            hasDescription: !!card?.description,
                            descriptionLength: card?.description?.length || 0,
                            allKeys: Object.keys(card || {})
                          });
                          setSelectedCardInfo(card);
                        }}
                      >
                        <CardImage
                          card={card}
                          className="w-full h-full rounded-lg border-2 border-red-500/50 transition-all opacity-80"
                          fallback="/images/fundoCarta.webp"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confiscation - Seleção de Carta do Oponente */}
      <AnimatePresence mode="wait">
        {showOpponentHandRevealed && cardEffectType === 'confiscation' && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 10000, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
            onClick={(e) => {
              // Não fechar o modal ao clicar no overlay - o usuário deve selecionar uma carta
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-transparent rounded-2xl border-2 border-red-500/50 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      ✨ Confiscation Ativada
                    </h2>
                    <p className="text-red-400 text-sm font-semibold">
                      Selecione uma carta do oponente para enviar ao cemitério
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Cartas na mão:</p>
                    <p className="text-xl font-bold text-yellow-400">{opponentHandRevealed.length}</p>
                  </div>
                </div>

                {/* Grid de Cartas */}
                {opponentHandRevealed.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">O oponente não tem cartas na mão</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          console.log('🎯 Confiscation: Continuando sem cartas');
                          // Completar efeito mesmo sem cartas
                          performAction(duelId, user.id, 'CONFISCATION_CHOICE', {
                            chosenCardIndex: -1,
                          });
                          // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                          // O modal será fechado automaticamente quando pendingChoice for null
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Continuar
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-4">
                    {opponentHandRevealed.map((card: any, index: number) => {
                      const uniqueKey = `confiscation-card-${index}-${card.idCarta || card.id || card.cardId || index}`;
                      return (
                        <motion.div
                          key={uniqueKey}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          onClick={() => {
                            // Enviar carta direto para o cemitério
                            if (duelId && user?.id) {
                              const cardInstanceId = card.instanceId;
                              if (!cardInstanceId) {
                                console.error(`❌ Confiscation: Carta não tem instanceId:`, card);
                                return;
                              }
                              console.log(`🎯 Confiscation: Carta selecionada: ${card.name || card.cardName} (instanceId: ${cardInstanceId})`);
                              
                              // Enviar escolha para o backend usando instanceId
                              performAction(duelId, user.id, 'CONFISCATION_CHOICE', {
                                instanceId: cardInstanceId,
                              });
                              
                              // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                              // O modal será fechado automaticamente quando pendingChoice for null
                            }
                          }}
                          className="relative cursor-pointer group"
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className="relative aspect-[59/86] rounded-lg overflow-hidden border-3 border-yellow-400/50 shadow-lg transition-all group-hover:border-yellow-400 group-hover:shadow-2xl">
                            <CardImage
                              card={card}
                              className="w-full h-full object-cover"
                              fallback="/images/fundoCarta.webp"
                            />
                            {/* Overlay de seleção */}
                            <div className="absolute inset-0 bg-yellow-400/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                Enviar ao Cemitério
                              </div>
                            </div>
                          </div>
                          {/* Nome da carta abaixo */}
                          <div className="mt-1 text-center">
                            <p className="text-white text-xs font-semibold truncate px-1">
                              {card.name || card.cardName || 'Carta Desconhecida'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Instruções */}
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-white text-center text-sm">
                    <span className="font-bold text-yellow-400">💡 Dica:</span> Clique em uma carta acima para enviá-la ao cemitério do oponente
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de The Forceful Sentry - Seleção de Carta do Oponente */}
      <AnimatePresence mode="wait">
        {showOpponentHandRevealed && cardEffectType === 'forcefulSentry' && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 10000, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-transparent rounded-2xl border-2 border-blue-500/50 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      ⚔️ The Forceful Sentry Ativada
                    </h2>
                    <p className="text-blue-400 text-sm font-semibold">
                      Selecione uma carta do oponente para retornar ao deck (será embaralhado)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Cartas na mão:</p>
                    <p className="text-xl font-bold text-yellow-400">{opponentHandRevealed.length}</p>
                  </div>
                </div>

                {/* Grid de Cartas */}
                {opponentHandRevealed.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">O oponente não tem cartas na mão</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          console.log('🎯 The Forceful Sentry: Continuando sem cartas');
                          // Completar efeito mesmo sem cartas (enviar instanceId vazio)
                          performAction(duelId, user.id, 'FORCEFUL_SENTRY_CHOICE', {
                            instanceId: '',
                          });
                          // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                          // O modal será fechado automaticamente quando pendingChoice for null
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Continuar
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-4">
                    {opponentHandRevealed.map((card: any, index: number) => {
                      const uniqueKey = `forceful-sentry-card-${index}-${card.idCarta || card.id || card.cardId || index}`;
                      return (
                        <motion.div
                          key={uniqueKey}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          onClick={() => {
                            // Enviar carta de volta para o deck
                            if (duelId && user?.id) {
                              const cardInstanceId = card.instanceId;
                              if (!cardInstanceId) {
                                console.error(`❌ ForcefulSentry: Carta não tem instanceId:`, card);
                                return;
                              }
                              console.log(`🎯 The Forceful Sentry: Carta selecionada: ${card.name || card.cardName} (instanceId: ${cardInstanceId})`);
                              
                              // Enviar escolha para o backend usando instanceId
                              performAction(duelId, user.id, 'FORCEFUL_SENTRY_CHOICE', {
                                instanceId: cardInstanceId,
                              });
                              
                              // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                              // O modal será fechado automaticamente quando pendingChoice for null
                            }
                          }}
                          className="relative cursor-pointer group"
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className="relative aspect-[59/86] rounded-lg overflow-hidden border-3 border-yellow-400/50 shadow-lg transition-all group-hover:border-yellow-400 group-hover:shadow-2xl">
                            <CardImage
                              card={card}
                              className="w-full h-full object-cover"
                              fallback="/images/fundoCarta.webp"
                            />
                            {/* Overlay de seleção */}
                            <div className="absolute inset-0 bg-blue-400/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-blue-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                Retornar ao Deck
                              </div>
                            </div>
                          </div>
                          {/* Nome da carta abaixo */}
                          <div className="mt-1 text-center">
                            <p className="text-white text-xs font-semibold truncate px-1">
                              {card.name || card.cardName || 'Carta Desconhecida'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Instruções */}
                <div className="mt-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg">
                  <p className="text-white text-center text-sm">
                    <span className="font-bold text-yellow-400">💡 Dica:</span> Clique em uma carta acima para retorná-la ao deck do oponente (o deck será embaralhado)
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de GracefulCharity - Seleção de 2 Cartas para Descartar */}
      {showGracefulCharityModal && (
        <div
          id="graceful-charity-overlay"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 duel-modal-scrim"
          style={{ 
            zIndex: 10000,
            pointerEvents: 'auto',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          } as React.CSSProperties}
        >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-transparent rounded-2xl border-2 border-green-500/50 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      ✨ Graceful Charity Ativada
                    </h2>
                    <p className="text-green-400 text-sm font-semibold">
                      Selecione 2 cartas da sua mão para descartar
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Cartas selecionadas:</p>
                    <p className="text-xl font-bold text-yellow-400">{selectedGracefulCharityCards.length} / 2</p>
                  </div>
                </div>

                {/* Grid de Cartas */}
                {gracefulCharityHand.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">Você não tem cartas na mão</p>
                    <p className="text-sm text-yellow-400">Aguardando processamento...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-4">
                      {gracefulCharityHand.map((card: any, index: number) => {
                        const cardInstanceId = card.instanceId || `card-${index}`;
                        const uniqueKey = `graceful-charity-card-${index}-${cardInstanceId}`;
                        const isSelected = selectedGracefulCharityCards.includes(cardInstanceId);
                        
                        return (
                          <motion.div
                            key={uniqueKey}
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() => {
                              if (isSelected) {
                                // Desmarcar carta
                                setSelectedGracefulCharityCards(prev => prev.filter(id => id !== cardInstanceId));
                              } else {
                                // Marcar carta (máximo 2)
                                if (selectedGracefulCharityCards.length < 2) {
                                  setSelectedGracefulCharityCards(prev => [...prev, cardInstanceId]);
                                }
                              }
                            }}
                            className={`relative cursor-pointer group ${isSelected ? 'ring-4 ring-green-400' : ''}`}
                            whileHover={{ scale: 1.05, zIndex: 10 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <div className={`relative aspect-[59/86] rounded-lg overflow-hidden border-3 shadow-lg transition-all ${
                              isSelected 
                                ? 'border-green-400 shadow-green-400/50' 
                                : 'border-yellow-400/50 group-hover:border-yellow-400 group-hover:shadow-2xl'
                            }`}>
                              <CardImage
                                card={card}
                                className="w-full h-full object-cover"
                                fallback="/images/fundoCarta.webp"
                              />
                              {/* Overlay de seleção */}
                              {isSelected && (
                                <div className="absolute inset-0 bg-green-400/50 flex items-center justify-center">
                                  <div className="bg-green-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                    Selecionada
                                  </div>
                                </div>
                              )}
                              {!isSelected && (
                                <div className="absolute inset-0 bg-yellow-400/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                    Selecionar
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Nome da carta abaixo */}
                            <div className="mt-1 text-center">
                              <p className="text-white text-xs font-semibold truncate px-1">
                                {card.name || card.cardName || 'Carta Desconhecida'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Botão de confirmar */}
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => {
                          if (duelId && user?.id && selectedGracefulCharityCards.length === 2) {
                            console.log(`🎯 GracefulCharity: Descartando cartas com instanceIds:`, selectedGracefulCharityCards);
                            
                            // Limpar seleção e fechar modal imediatamente após enviar
                            const instanceIdsToDiscard = [...selectedGracefulCharityCards];
                            setSelectedGracefulCharityCards([]);
                            
                            performAction(duelId, user.id, 'GRACEFUL_CHARITY_CHOICE', {
                              instanceIdsToDiscard: instanceIdsToDiscard,
                            });
                            
                            // Fechar modal imediatamente após enviar (o backend confirmará via duelUpdate)
                            // Usar setTimeout para garantir que o performAction seja enviado primeiro
                            setTimeout(() => {
                              console.log(`✅ GracefulCharity: Fechando modal após enviar escolha`);
                              setShowGracefulCharityModal(false);
                              setGracefulCharityHand([]);
                            }, 100);
                          }
                        }}
                        disabled={selectedGracefulCharityCards.length !== 2}
                        className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                          selectedGracefulCharityCards.length === 2
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {selectedGracefulCharityCards.length === 2 
                          ? '✅ Descartar 2 Cartas' 
                          : `Selecione ${2 - selectedGracefulCharityCards.length} carta(s) para descartar`}
                      </button>
                    </div>
                  </>
                )}

                {/* Instruções */}
                <div className="mt-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
                  <p className="text-white text-center text-sm">
                    <span className="font-bold text-yellow-400">💡 Dica:</span> Selecione 2 cartas acima para descartá-las ao cemitério
                  </p>
                </div>
              </div>
            </motion.div>
        </div>
      )}

      {/* Modal de MonsterReborn */}
      <AnimatePresence>
        {showMonsterRebornModal && monsterRebornData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-purple-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-purple-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                      Monster Reborn
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro do seu cemitério ou do cemitério do oponente para reviver
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMonsterRebornModal(false);
                      setMonsterRebornData(null);
                      setSelectedMonsterReborn(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Meu Cemitério */}
                {monsterRebornData.playerGraveyard.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Meu Cemitério</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {monsterRebornData.playerGraveyard.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `player-${monster.graveyardIndex || index}-${index}`;
                        const isSelected = selectedMonsterReborn?.graveyard === 'player' && 
                                          selectedMonsterReborn?.index === index &&
                                          (selectedMonsterReborn.instanceId === monster.instanceId || 
                                           selectedMonsterReborn.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`player-graveyard-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMonsterReborn({ 
                                graveyard: 'player', 
                                index,
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full"
                              fallback="/images/fundoCarta.webp"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {monster.name || 'Monstro'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Seção: Cemitério do Oponente */}
                {monsterRebornData.opponentGraveyard.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Cemitério do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {monsterRebornData.opponentGraveyard.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `opponent-${monster.graveyardIndex || index}-${index}`;
                        const isSelected = selectedMonsterReborn?.graveyard === 'opponent' && 
                                          selectedMonsterReborn?.index === index &&
                                          (selectedMonsterReborn.instanceId === monster.instanceId || 
                                           selectedMonsterReborn.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`opponent-graveyard-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMonsterReborn({ 
                                graveyard: 'opponent', 
                                index,
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full"
                              fallback="/images/fundoCarta.webp"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {monster.name || 'Monstro'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mensagem se não houver monstros */}
                {monsterRebornData.playerGraveyard.length === 0 && monsterRebornData.opponentGraveyard.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros nos cemitérios para reviver</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMonsterRebornModal(false);
                        setMonsterRebornData(null);
                        setSelectedMonsterReborn(null);
                      }}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {monsterRebornData.playerGraveyard.length > 0 || monsterRebornData.opponentGraveyard.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMonsterRebornModal(false);
                        setMonsterRebornData(null);
                        setSelectedMonsterReborn(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (duelId && user?.id && selectedMonsterReborn) {
                          console.log(`🎯 MonsterReborn: Revivendo monstro:`, selectedMonsterReborn);
                          
                          performAction(duelId, user.id, 'MONSTER_REBORN_CHOICE', {
                            chosenMonster: selectedMonsterReborn,
                          });
                          
                          // Resetar estados
                          setShowMonsterRebornModal(false);
                          setMonsterRebornData(null);
                          setSelectedMonsterReborn(null);
                        }
                      }}
                      disabled={!selectedMonsterReborn}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                        selectedMonsterReborn
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white cursor-pointer'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedMonsterReborn ? '✅ Reviver Monstro' : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Premature Burial - escolher 1 monstro do próprio cemitério */}
      <AnimatePresence>
        {showPrematureBurialModal && prematureBurialGraveyard.length > 0 && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {}}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-amber-900/30 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-amber-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6 border-b-2 border-amber-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
                      Premature Burial
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro do seu cemitério para reviver em modo de ataque (Premature Burial será equipada ao monstro)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowPrematureBurialModal(false);
                      setPrematureBurialGraveyard([]);
                      setSelectedPrematureBurialIndex(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-4">Meu Cemitério</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {prematureBurialGraveyard.map((monster: any, index: number) => {
                      const isSelected = selectedPrematureBurialIndex === index;
                      return (
                        <motion.div
                          key={`premature-burial-gy-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedPrematureBurialIndex(index)}
                          className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                            isSelected ? 'border-amber-400 ring-4 ring-amber-400/50 shadow-lg shadow-amber-500/50' : 'border-gray-600 hover:border-amber-500/50'
                          }`}
                          style={{ width: '120px', height: '175px' }}
                        >
                          <CardImage card={monster} className="w-full h-full" fallback="/images/fundoCarta.webp" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-amber-400/30 flex items-center justify-center">
                              <div className="bg-amber-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">Selecionado</div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 right-1 text-center">
                            <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                              {monster.name || 'Monstro'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowPrematureBurialModal(false);
                      setPrematureBurialGraveyard([]);
                      setSelectedPrematureBurialIndex(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (duelId && user?.id && selectedPrematureBurialIndex !== null) {
                        performAction(duelId, user.id, 'PREMATURE_BURIAL_CHOICE', {
                          chosenMonster: { index: selectedPrematureBurialIndex },
                        });
                        setShowPrematureBurialModal(false);
                        setPrematureBurialGraveyard([]);
                        setSelectedPrematureBurialIndex(null);
                      }
                    }}
                    disabled={selectedPrematureBurialIndex === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                      selectedPrematureBurialIndex !== null
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedPrematureBurialIndex !== null ? '✅ Reviver e Equipar' : 'Selecione um monstro'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Autonomous Action Unit - escolher 1 monstro do cemitério do oponente */}
      <AnimatePresence>
        {showAutonomousActionUnitModal && autonomousActionUnitGraveyard.length > 0 && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {}}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-amber-900/30 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-amber-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6 border-b-2 border-amber-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
                      Autonomous Action Unit
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Você pagou 1500 LP. Escolha um monstro do cemitério do oponente para reviver no seu campo em ataque (equipado com esta carta). Se a carta ou o monstro for destruído, ambos são destruídos.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowAutonomousActionUnitModal(false);
                      setAutonomousActionUnitGraveyard([]);
                      setSelectedAutonomousActionUnitIndex(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-4">Cemitério do Oponente</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {autonomousActionUnitGraveyard.map((monster: any, index: number) => {
                      const isSelected = selectedAutonomousActionUnitIndex === index;
                      return (
                        <motion.div
                          key={`autonomous-action-unit-gy-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedAutonomousActionUnitIndex(index)}
                          className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                            isSelected ? 'border-amber-400 ring-4 ring-amber-400/50 shadow-lg shadow-amber-500/50' : 'border-gray-600 hover:border-amber-500/50'
                          }`}
                          style={{ width: '120px', height: '175px' }}
                        >
                          <CardImage card={monster} className="w-full h-full" fallback="/images/fundoCarta.webp" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-amber-400/30 flex items-center justify-center">
                              <div className="bg-amber-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">Selecionado</div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 right-1 text-center">
                            <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                              {monster.name || 'Monstro'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowAutonomousActionUnitModal(false);
                      setAutonomousActionUnitGraveyard([]);
                      setSelectedAutonomousActionUnitIndex(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (duelId && user?.id && selectedAutonomousActionUnitIndex !== null) {
                        performAction(duelId, user.id, 'AUTONOMOUS_ACTION_UNIT_CHOICE', {
                          chosenMonsterIndex: selectedAutonomousActionUnitIndex,
                        });
                        setShowAutonomousActionUnitModal(false);
                        setAutonomousActionUnitGraveyard([]);
                        setSelectedAutonomousActionUnitIndex(null);
                      }
                    }}
                    disabled={selectedAutonomousActionUnitIndex === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                      selectedAutonomousActionUnitIndex !== null
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedAutonomousActionUnitIndex !== null ? '✅ Reviver e Equipar' : 'Selecione um monstro'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Animação de carta saindo da mão para o campo */}
      <AnimatePresence>
        {cardPlacementAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-[10000]"
            style={{ zIndex: 10000 }}
          >
            <motion.div
              initial={{
                x: cardPlacementAnimation.fromPosition.x,
                y: cardPlacementAnimation.fromPosition.y,
                width: cardPlacementAnimation.fromPosition.width,
                height: cardPlacementAnimation.fromPosition.height,
                scale: 1,
                rotate: 0,
              }}
              animate={{
                x: cardPlacementAnimation.toPosition.x,
                y: cardPlacementAnimation.toPosition.y,
                width: cardPlacementAnimation.toPosition.width,
                height: cardPlacementAnimation.toPosition.height,
                scale: 1,
                rotate: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.8,
              }}
              transition={{
                duration: 0.25,
                ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
              }}
              style={{
                position: 'fixed',
                transform: 'translate(-50%, -50%)',
                zIndex: 10001,
              }}
            >
              <CardImage
                card={cardPlacementAnimation.card}
                className="w-full h-full object-cover rounded-lg shadow-2xl"
                style={{
                  filter: 'drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5))',
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Invocação Especial Chaos (Chaos Sorcerer / Chaos Emperor Dragon / Black Luster Soldier) */}
      <AnimatePresence>
        {showChaosSorcererModal && chaosSorcererData && (() => {
          const cardId = (chaosSorcererData?.cardId ?? '').toString();
          const rawName = chaosSorcererData?.cardName || 'Carta Chaos';
          const idLower = cardId.toLowerCase();
          const nameLower = typeof rawName === 'string' ? rawName.toLowerCase().replace(/\s+/g, '') : '';
          const isCED = idLower === 'chaosemperordragon' || nameLower === 'chaosemperordragon' || nameLower.includes('chaosemperordragon');
          const isChaosSorcerer = idLower === 'chaossorcerer' || nameLower === 'chaossorcerer';
          const isBLS = idLower.includes('blacklustersoldier') || nameLower.includes('blacklustersoldier') || nameLower.includes('envoy of the beginning');
          const displayName = isCED ? 'Chaos Emperor Dragon' : isChaosSorcerer ? 'Chaos Sorcerer' : isBLS ? 'Black Luster Soldier - Envoy of the Beginning' : rawName;
          return (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher os monstros
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="duel-modal-panel rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-purple-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
                      {displayName} - Invocação Especial
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro LIGHT e 1 monstro DARK do seu cemitério para banir
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowChaosSorcererModal(false);
                      setChaosSorcererData(null);
                      setSelectedLightMonster(null);
                      setSelectedDarkMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-2xl font-bold transition-colors hover:scale-110 transform px-2"
                  >
                    X
                  </button>
                </div>

                {/* Seção: Monstros LIGHT */}
                {chaosSorcererData.lightMonsters.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-yellow-400 mb-4">Monstros LIGHT</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {chaosSorcererData.lightMonsters.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `light-${monster.graveyardIndex}-${index}` || `light-${index}`;
                        const isSelected = selectedLightMonster?.arrayIndex === index && 
                                          (selectedLightMonster.instanceId === monster.instanceId || 
                                           selectedLightMonster.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`light-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedLightMonster({
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex,
                                arrayIndex: index
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                                : 'border-gray-600 hover:border-yellow-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                                OK
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Seção: Monstros DARK */}
                {chaosSorcererData.darkMonsters.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">Monstros DARK</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {chaosSorcererData.darkMonsters.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `dark-${monster.graveyardIndex}-${index}` || `dark-${index}`;
                        const isSelected = selectedDarkMonster?.arrayIndex === index && 
                                          (selectedDarkMonster.instanceId === monster.instanceId || 
                                           selectedDarkMonster.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`dark-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDarkMonster({
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex,
                                arrayIndex: index
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                OK
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {chaosSorcererData.lightMonsters.length === 0 && chaosSorcererData.darkMonsters.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros LIGHT ou DARK no cemitério</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowChaosSorcererModal(false);
                        setChaosSorcererData(null);
                        setSelectedLightMonster(null);
                        setSelectedDarkMonster(null);
                      }}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {chaosSorcererData.lightMonsters.length > 0 && chaosSorcererData.darkMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowChaosSorcererModal(false);
                        setChaosSorcererData(null);
                        setSelectedLightMonster(null);
                        setSelectedDarkMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700/80 hover:bg-gray-600/80 text-white rounded-lg font-bold transition-colors backdrop-blur-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (duelId && user?.id && selectedLightMonster !== null && selectedDarkMonster !== null) {
                          const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                          if (emptyZoneIndex === -1) {
                            alert('Todas as zonas de monstro estão ocupadas!');
                            return;
                          }
                          
                          setShowChaosSorcererModal(false);
                          
                          const cardId = chaosSorcererData.cardId || '';
                          const cardName = chaosSorcererData?.cardName || 'Carta Chaos';
                          const cardNameLower = cardName.toLowerCase();
                          const isChaosEmperorDragon = cardId === 'ChaosEmperorDragon' || 
                                                      cardId === 'chaosemperordragon' ||
                                                      cardId === 'Chaos-EmperorDragon' ||
                                                      cardId === 'ChaosEmperor-Dragon' ||
                                                      cardNameLower === 'chaos emperor dragon' ||
                                                      cardNameLower === 'chaos-emperor dragon' ||
                                                      cardNameLower === 'chaosemperordragon' ||
                                                      (typeof cardId === 'string' && cardId.toLowerCase().includes('chaosemperordragon')) ||
                                                      (typeof cardNameLower === 'string' && cardNameLower.includes('chaos emperor dragon'));
                          const isChaosSorcerer = cardId === 'ChaosSorcerer' || 
                                                  cardId === 'chaossorcerer' ||
                                                  cardNameLower === 'chaos sorcerer' ||
                                                  cardNameLower === 'chaossorcerer' ||
                                                  (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer')) ||
                                                  (typeof cardNameLower === 'string' && cardNameLower.includes('chaos sorcerer'));
                          const isBlackLusterSoldier = cardId === 'BlackLusterSoldierEnvoyOfTheBeginning' ||
                                                      cardId === 'blacklustersoldierenvoyofthebeginning' ||
                                                      cardId === 'Black-LusterSoldierEnvoyOfTheBeginning' ||
                                                      cardNameLower === 'black luster soldier - envoy of the beginning' ||
                                                      cardNameLower === 'black luster soldier envoy of the beginning' ||
                                                      cardNameLower === 'blacklustersoldierenvoyofthebeginning' ||
                                                      (typeof cardId === 'string' && cardId.toLowerCase().includes('blacklustersoldierenvoyofthebeginning')) ||
                                                      (typeof cardNameLower === 'string' && cardNameLower.includes('black luster soldier'));
                          
                          // Se for uma dessas cartas Chaos, sempre invocar em ataque sem mostrar modal
                          // Caso contrário, mostrar popup para escolher posição
                          let position: 'attack' | 'defense';
                          if (isChaosEmperorDragon || isChaosSorcerer || isBlackLusterSoldier) {
                            position = 'attack';
                          } else {
                            position = window.confirm(`✨ Invocar ${displayName} em Posição de ATAQUE?\n\nOK = Ataque\nCancelar = Defesa`) ? 'attack' : 'defense';
                          }
                          
                          // Obter os monstros selecionados com seus identificadores únicos
                          const selectedLightMonsterData = chaosSorcererData.lightMonsters[selectedLightMonster.arrayIndex];
                          const selectedDarkMonsterData = chaosSorcererData.darkMonsters[selectedDarkMonster.arrayIndex];
                          
                          console.log(`🎯 [ChaosSorcerer Modal] Confirmando invocação - Banindo monstros LIGHT (índice ${selectedLightMonster.arrayIndex}, instanceId: ${selectedLightMonster.instanceId}) e DARK (índice ${selectedDarkMonster.arrayIndex}, instanceId: ${selectedDarkMonster.instanceId}), posição: ${position}`);
                          
                          // Enviar ação para banir monstros e invocar
                          // Usar instanceId ou graveyardIndex para identificar cada carta única
                          performAction(duelId, user.id, 'CHAOS_SORCERER_SUMMON_CHOICE', {
                            cardId: chaosSorcererData.cardId,
                            lightMonsterIndex: selectedLightMonster.arrayIndex,
                            darkMonsterIndex: selectedDarkMonster.arrayIndex,
                            lightMonsterInstanceId: selectedLightMonster.instanceId || selectedLightMonsterData?.instanceId,
                            darkMonsterInstanceId: selectedDarkMonster.instanceId || selectedDarkMonsterData?.instanceId,
                            lightMonsterGraveyardIndex: selectedLightMonster.graveyardIndex || selectedLightMonsterData?.graveyardIndex,
                            darkMonsterGraveyardIndex: selectedDarkMonster.graveyardIndex || selectedDarkMonsterData?.graveyardIndex,
                            zoneIndex: emptyZoneIndex,
                            position,
                          });
                          
                          // Resetar estados do modal
                          setChaosSorcererData(null);
                          setSelectedLightMonster(null);
                          setSelectedDarkMonster(null);
                          
                          // A carta será removida da mão e os monstros serão banidos pelo backend
                        }
                      }}
                      disabled={selectedLightMonster === null || selectedDarkMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                        selectedLightMonster !== null && selectedDarkMonster !== null
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white cursor-pointer'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedLightMonster !== null && selectedDarkMonster !== null ? `Invocar ${displayName}` : 'Selecione 1 LIGHT e 1 DARK'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* Modal de Monster Reincarnation - Descartar Carta da Mão */}
      <AnimatePresence>
        {showMonsterReincarnationDiscardModal && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher uma carta
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                      Monster Reincarnation
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Descartar 1 carta da sua mão
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMonsterReincarnationDiscardModal(false);
                      setMonsterReincarnationHand([]);
                      setSelectedMonsterReincarnationCard(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Grid de Cartas */}
                {monsterReincarnationHand.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">Você não tem cartas na mão</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 mb-6">
                    {monsterReincarnationHand.map((card: any, index: number) => {
                      const cardInstanceId = card.instanceId || `card-${index}`;
                      const uniqueKey = `monster-reincarnation-discard-card-${index}-${cardInstanceId}`;
                      const isSelected = selectedMonsterReincarnationCard === cardInstanceId;
                      
                      return (
                        <motion.div
                          key={uniqueKey}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          onClick={() => {
                            setSelectedMonsterReincarnationCard(cardInstanceId);
                          }}
                          className={`relative cursor-pointer group ${
                            isSelected ? 'ring-4 ring-yellow-500 scale-105' : 'hover:scale-105'
                          } transition-all duration-200`}
                        >
                          <img
                            src={
                              getCardImageDisplayUrl(getAllCardImagePaths(card)[0] ?? '') ||
                              card.imageUrl ||
                              card.cardImage ||
                              '/card-back.jpg'
                            }
                            alt={card.name || card.cardName || 'Carta'}
                            className="w-full h-auto rounded-lg shadow-lg"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-yellow-500/30 rounded-lg flex items-center justify-center">
                              <div className="bg-yellow-500 text-white px-3 py-1 rounded-full font-bold text-sm">
                                Selecionada
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-end gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMonsterReincarnationDiscardModal(false);
                      setMonsterReincarnationHand([]);
                      setSelectedMonsterReincarnationCard(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (duelId && user?.id && selectedMonsterReincarnationCard) {
                        console.log(`🎯 Monster Reincarnation: Descartando carta:`, selectedMonsterReincarnationCard);
                        
                        performAction(duelId, user.id, 'MONSTER_REINCARNATION_DISCARD_CHOICE', {
                          instanceIdToDiscard: selectedMonsterReincarnationCard,
                        });
                        
                        // Fechar modal de descarte (o modal de cemitério será aberto pelo backend)
                        setShowMonsterReincarnationDiscardModal(false);
                        setMonsterReincarnationHand([]);
                        setSelectedMonsterReincarnationCard(null);
                      }
                    }}
                    disabled={!selectedMonsterReincarnationCard}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                      selectedMonsterReincarnationCard
                        ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedMonsterReincarnationCard ? '✅ Descartar Carta' : 'Selecione uma carta'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Dark Magician of Chaos — End Phase */}
      <AnimatePresence>
        {showDmocEndPhaseModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-indigo-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-indigo-500/50 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-indigo-300 mb-1">Dark Magician of Chaos</h2>
              <p className="text-gray-300 text-sm mb-4">
                End Phase: escolha 1 Magia do seu cemitério para adicionar à mão (opcional, 1x por turno).
              </p>
              {dmocSpellOptions.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">Nenhuma magia no cemitério</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                  {dmocSpellOptions.map((spell: any) => {
                    const isSelected = selectedDmocSpellIndex === spell.index;
                    return (
                      <button
                        key={`dmoc-spell-${spell.index}`}
                        type="button"
                        onClick={() => setSelectedDmocSpellIndex(spell.index)}
                        className={`relative rounded-lg overflow-hidden border-2 transition ${
                          isSelected ? 'border-indigo-400 scale-105' : 'border-transparent hover:border-indigo-600/60'
                        }`}
                      >
                        <img
                          src={
                            getCardImageDisplayUrl(getAllCardImagePaths(spell)[0] ?? '') ||
                            spell.cardImage ||
                            '/card-back.jpg'
                          }
                          alt={spell.name || 'Magia'}
                          className="w-full h-auto"
                        />
                        <p className="absolute bottom-0 inset-x-0 text-[10px] duel-modal-scrim text-white truncate px-1 py-0.5">
                          {spell.name || 'Magia'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'DARK_MAGICIAN_OF_CHAOS_SKIP', {});
                    }
                    setShowDmocEndPhaseModal(false);
                    setDmocSpellOptions([]);
                    setSelectedDmocSpellIndex(null);
                  }}
                >
                  Pular
                </button>
                <button
                  type="button"
                  disabled={selectedDmocSpellIndex === null}
                  className={`px-5 py-2 rounded-lg font-semibold ${
                    selectedDmocSpellIndex !== null
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (duelId && user?.id && selectedDmocSpellIndex !== null) {
                      performAction(duelId, user.id, 'DARK_MAGICIAN_OF_CHAOS_CHOICE', {
                        graveyardIndex: selectedDmocSpellIndex,
                      });
                      setShowDmocEndPhaseModal(false);
                      setDmocSpellOptions([]);
                      setSelectedDmocSpellIndex(null);
                    }
                  }}
                >
                  Adicionar à mão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Magician's Rod — busca no deck */}
      <AnimatePresence>
        {showMagiciansRodSearchModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-purple-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-purple-500/50 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-purple-300 mb-1">Magician&apos;s Rod</h2>
              <p className="text-gray-300 text-sm mb-4">
                Adicione 1 Magia/Armadilha do Deck que liste &quot;Mago Negro&quot; no texto (opcional, 1x por turno).
              </p>
              {magiciansRodDeckOptions.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">Nenhuma carta válida no deck</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                  {magiciansRodDeckOptions.map((card: any) => {
                    const isSelected = selectedMagiciansRodDeckIndex === card.deckIndex;
                    return (
                      <button
                        key={`rod-deck-${card.deckIndex}`}
                        type="button"
                        onClick={() => setSelectedMagiciansRodDeckIndex(card.deckIndex)}
                        className={`relative rounded-lg overflow-hidden border-2 transition ${
                          isSelected ? 'border-purple-400 scale-105' : 'border-transparent hover:border-purple-600/60'
                        }`}
                      >
                        <img
                          src={
                            getCardImageDisplayUrl(getAllCardImagePaths(card)[0] ?? '') ||
                            card.cardImage ||
                            '/card-back.jpg'
                          }
                          alt={card.name || 'Carta'}
                          className="w-full h-auto"
                        />
                        <p className="absolute bottom-0 inset-x-0 text-[10px] duel-modal-scrim text-white truncate px-1 py-0.5">
                          {card.name || 'Carta'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'MAGICIAN_S_ROD_SEARCH_SKIP', {});
                    }
                    setShowMagiciansRodSearchModal(false);
                    setMagiciansRodDeckOptions([]);
                    setSelectedMagiciansRodDeckIndex(null);
                  }}
                >
                  Pular
                </button>
                <button
                  type="button"
                  disabled={selectedMagiciansRodDeckIndex === null}
                  className={`px-5 py-2 rounded-lg font-semibold ${
                    selectedMagiciansRodDeckIndex !== null
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (duelId && user?.id && selectedMagiciansRodDeckIndex !== null) {
                      performAction(duelId, user.id, 'MAGICIAN_S_ROD_SEARCH_CHOICE', {
                        deckIndex: selectedMagiciansRodDeckIndex,
                      });
                      setShowMagiciansRodSearchModal(false);
                      setMagiciansRodDeckOptions([]);
                      setSelectedMagiciansRodDeckIndex(null);
                    }
                  }}
                >
                  Adicionar à mão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Berfomet Search */}
      <AnimatePresence>
        {showBerfometSearchModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-orange-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-orange-500/50 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-orange-300 mb-1">Berfomet</h2>
              <p className="text-gray-300 text-sm mb-4">
                Você pode adicionar 1 &quot;Gazelle the King of Mythical Beasts&quot; do Deck à sua mão (opcional).
              </p>
              {berfometDeckOptions.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">Nenhuma Gazelle no deck</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                  {berfometDeckOptions.map((card: any) => {
                    const isSelected = selectedBerfometDeckIndex === card.deckIndex;
                    return (
                      <button
                        key={`berfomet-${card.deckIndex}`}
                        type="button"
                        onClick={() => setSelectedBerfometDeckIndex(card.deckIndex)}
                        className={`relative rounded-lg overflow-hidden border-2 transition ${
                          isSelected ? 'border-orange-400 scale-105' : 'border-transparent hover:border-orange-600/60'
                        }`}
                      >
                        <img
                          src={
                            getCardImageDisplayUrl(getAllCardImagePaths(card)[0] ?? '') ||
                            card.cardImage ||
                            '/card-back.jpg'
                          }
                          alt={card.name || 'Gazelle'}
                          className="w-full h-auto"
                        />
                        <p className="absolute bottom-0 inset-x-0 text-[10px] duel-modal-scrim text-white truncate px-1 py-0.5">
                          {card.name || 'Gazelle'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'BERFOMET_SEARCH_SKIP', {});
                    }
                    setShowBerfometSearchModal(false);
                    setBerfometDeckOptions([]);
                    setSelectedBerfometDeckIndex(null);
                  }}
                >
                  Pular
                </button>
                <button
                  type="button"
                  disabled={selectedBerfometDeckIndex === null}
                  className={`px-5 py-2 rounded-lg font-semibold ${
                    selectedBerfometDeckIndex !== null
                      ? 'bg-orange-600 hover:bg-orange-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (duelId && user?.id && selectedBerfometDeckIndex !== null) {
                      performAction(duelId, user.id, 'BERFOMET_SEARCH_CHOICE', {
                        deckIndex: selectedBerfometDeckIndex,
                      });
                      setShowBerfometSearchModal(false);
                      setBerfometDeckOptions([]);
                      setSelectedBerfometDeckIndex(null);
                    }
                  }}
                >
                  Adicionar à mão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Magician's Salvation — Set Eternal Soul */}
      <AnimatePresence>
        {showMagiciansSalvationEternalSoulModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-amber-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-amber-500/50 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-amber-300 mb-1">Magician&apos;s Salvation</h2>
              <p className="text-gray-300 text-sm mb-4">
                Você pode Baixar 1 &quot;Eternal Soul&quot; diretamente do Deck (opcional).
              </p>
              {magiciansSalvationDeckOptions.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">Nenhuma Eternal Soul no deck</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                  {magiciansSalvationDeckOptions.map((card: any) => {
                    const isSelected = selectedMagiciansSalvationDeckIndex === card.deckIndex;
                    return (
                      <button
                        key={`salvation-es-${card.deckIndex}`}
                        type="button"
                        onClick={() => setSelectedMagiciansSalvationDeckIndex(card.deckIndex)}
                        className={`relative rounded-lg overflow-hidden border-2 transition ${
                          isSelected ? 'border-amber-400 scale-105' : 'border-transparent hover:border-amber-600/60'
                        }`}
                      >
                        <img
                          src={
                            getCardImageDisplayUrl(getAllCardImagePaths(card)[0] ?? '') ||
                            card.cardImage ||
                            '/card-back.jpg'
                          }
                          alt={card.name || 'Eternal Soul'}
                          className="w-full h-auto"
                        />
                        <p className="absolute bottom-0 inset-x-0 text-[10px] duel-modal-scrim text-white truncate px-1 py-0.5">
                          {card.name || 'Eternal Soul'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'MAGICIAN_S_SALVATION_ETERNAL_SOUL_SKIP', {});
                    }
                    setShowMagiciansSalvationEternalSoulModal(false);
                    setMagiciansSalvationDeckOptions([]);
                    setSelectedMagiciansSalvationDeckIndex(null);
                  }}
                >
                  Pular
                </button>
                <button
                  type="button"
                  disabled={selectedMagiciansSalvationDeckIndex === null}
                  className={`px-5 py-2 rounded-lg font-semibold ${
                    selectedMagiciansSalvationDeckIndex !== null
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (duelId && user?.id && selectedMagiciansSalvationDeckIndex !== null) {
                      performAction(duelId, user.id, 'MAGICIAN_S_SALVATION_ETERNAL_SOUL_CHOICE', {
                        deckIndex: selectedMagiciansSalvationDeckIndex,
                      });
                      setShowMagiciansSalvationEternalSoulModal(false);
                      setMagiciansSalvationDeckOptions([]);
                      setSelectedMagiciansSalvationDeckIndex(null);
                    }
                  }}
                >
                  Baixar Eternal Soul
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Magician's Salvation — par DM/DMG do GY */}
      <AnimatePresence>
        {showMagiciansSalvationPairModal && magiciansSalvationPairData && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-amber-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-amber-500/50 shadow-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-amber-300 mb-1">Magician&apos;s Salvation</h2>
              <p className="text-gray-300 text-sm mb-4">
                Invocar Especial do cemitério{' '}
                <span className="text-amber-200 font-semibold">
                  {magiciansSalvationPairData.pairName || 'o monstro'}
                </span>{' '}
                (nome diferente de {magiciansSalvationPairData.targetName || 'o monstro alvo'})?
              </p>
              <div className="flex justify-center mb-6">
                <div className="w-28 rounded-lg overflow-hidden border-2 border-amber-500/60">
                  <img
                    src={
                      getCardImageDisplayUrl(
                        getAllCardImagePaths({
                          cardImage: magiciansSalvationPairData.pairCardImage,
                          idCarta: magiciansSalvationPairData.pairIdCarta,
                        })[0] ?? '',
                      ) ||
                      magiciansSalvationPairData.pairCardImage ||
                      '/card-back.jpg'
                    }
                    alt={magiciansSalvationPairData.pairName || 'Monstro'}
                    className="w-full h-auto"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'MAGICIAN_S_SALVATION_PAIR_SKIP', {});
                    }
                    setShowMagiciansSalvationPairModal(false);
                    setMagiciansSalvationPairData(null);
                  }}
                >
                  Pular
                </button>
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'MAGICIAN_S_SALVATION_PAIR_CHOICE', {});
                      setShowMagiciansSalvationPairModal(false);
                      setMagiciansSalvationPairData(null);
                    }
                  }}
                >
                  Invocar do cemitério
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Skilled Dark Magician */}
      <AnimatePresence>
        {showSkilledDarkMagicianModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-violet-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-violet-500/50 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-violet-300 mb-1">Skilled Dark Magician</h2>
              <p className="text-gray-300 text-sm mb-4">
                Tributar este card (3 Marcadores): escolha 1 Dark Magician da mão, Deck ou GY para Invocar Especial.
              </p>
              {skilledDarkMagicianOptions.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">Nenhum Dark Magician disponível</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                  {skilledDarkMagicianOptions.map((opt: any) => {
                    const isSelected =
                      selectedSkilledDarkMagician?.source === opt.source &&
                      selectedSkilledDarkMagician?.index === opt.index;
                    return (
                      <button
                        key={`skilled-dm-${opt.source}-${opt.index}`}
                        type="button"
                        onClick={() =>
                          setSelectedSkilledDarkMagician({ source: opt.source, index: opt.index })
                        }
                        className={`relative rounded-lg overflow-hidden border-2 transition ${
                          isSelected ? 'border-violet-400 scale-105' : 'border-transparent hover:border-violet-600/60'
                        }`}
                      >
                        <img
                          src={
                            getCardImageDisplayUrl(getAllCardImagePaths(opt)[0] ?? '') ||
                            opt.cardImage ||
                            '/card-back.jpg'
                          }
                          alt={opt.name || 'Dark Magician'}
                          className="w-full h-auto"
                        />
                        <p className="absolute bottom-0 inset-x-0 text-[10px] duel-modal-scrim text-white truncate px-1 py-0.5">
                          {opt.name || 'Dark Magician'} ({opt.source})
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'SKILLED_DARK_MAGICIAN_SKIP', {});
                    }
                    setShowSkilledDarkMagicianModal(false);
                    setSkilledDarkMagicianOptions([]);
                    setSelectedSkilledDarkMagician(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!selectedSkilledDarkMagician}
                  className={`px-5 py-2 rounded-lg font-semibold ${
                    selectedSkilledDarkMagician
                      ? 'bg-violet-600 hover:bg-violet-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (duelId && user?.id && selectedSkilledDarkMagician) {
                      performAction(duelId, user.id, 'SKILLED_DARK_MAGICIAN_CHOICE', {
                        source: selectedSkilledDarkMagician.source,
                        index: selectedSkilledDarkMagician.index,
                      });
                      setShowSkilledDarkMagicianModal(false);
                      setSkilledDarkMagicianOptions([]);
                      setSelectedSkilledDarkMagician(null);
                    }
                  }}
                >
                  Tributar e Invocar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Magician's Rod — reciclagem do GY */}
      <AnimatePresence>
        {showMagiciansRodGyModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-br from-gray-900/90 via-violet-950/80 to-gray-900/90 backdrop-blur-lg rounded-2xl border-2 border-violet-500/50 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-violet-300 mb-1">Magician&apos;s Rod</h2>
              <p className="text-gray-300 text-sm mb-4">
                Ofereça como Tributo 1 monstro Mago; adicione Magician&apos;s Rod do cemitério à mão (opcional, 1x por turno).
              </p>
              {magiciansRodTributeOptions.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">Nenhum monstro Mago no campo</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                  {magiciansRodTributeOptions.map((m: any) => {
                    const isSelected = selectedMagiciansRodTribute === m.zoneIndex;
                    return (
                      <button
                        key={`rod-tribute-${m.zoneIndex}`}
                        type="button"
                        onClick={() => setSelectedMagiciansRodTribute(m.zoneIndex)}
                        className={`relative rounded-lg overflow-hidden border-2 transition ${
                          isSelected ? 'border-violet-400 scale-105' : 'border-transparent hover:border-violet-600/60'
                        }`}
                      >
                        <img
                          src={
                            getCardImageDisplayUrl(getAllCardImagePaths(m)[0] ?? '') ||
                            m.cardImage ||
                            '/card-back.jpg'
                          }
                          alt={m.name || 'Mago'}
                          className="w-full h-auto"
                        />
                        <p className="absolute bottom-0 inset-x-0 text-[10px] duel-modal-scrim text-white truncate px-1 py-0.5">
                          {m.name || 'Mago'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'MAGICIAN_S_ROD_GY_SKIP', {});
                    }
                    setShowMagiciansRodGyModal(false);
                    setMagiciansRodTributeOptions([]);
                    setSelectedMagiciansRodTribute(null);
                  }}
                >
                  Pular
                </button>
                <button
                  type="button"
                  disabled={selectedMagiciansRodTribute === null}
                  className={`px-5 py-2 rounded-lg font-semibold ${
                    selectedMagiciansRodTribute !== null
                      ? 'bg-violet-600 hover:bg-violet-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    if (duelId && user?.id && selectedMagiciansRodTribute !== null) {
                      performAction(duelId, user.id, 'MAGICIAN_S_ROD_GY_CHOICE', {
                        tributeZoneIndex: selectedMagiciansRodTribute,
                      });
                      setShowMagiciansRodGyModal(false);
                      setMagiciansRodTributeOptions([]);
                      setSelectedMagiciansRodTribute(null);
                    }
                  }}
                >
                  Tributar e recuperar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMonsterReincarnationGraveyardModal && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                      Monster Reincarnation
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro do seu cemitério para devolver à sua mão
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMonsterReincarnationGraveyardModal(false);
                      setMonsterReincarnationGraveyard([]);
                      setSelectedMonsterReincarnationMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Grid de Monstros */}
                {monsterReincarnationGraveyard.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">Não há monstros no seu cemitério</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 mb-6">
                    {monsterReincarnationGraveyard.map((monster: any, index: number) => {
                      const uniqueKey = `monster-reincarnation-graveyard-${index}-${monster.idCarta || monster.id || monster.cardId || index}`;
                      const isSelected = selectedMonsterReincarnationMonster === index;
                      
                      return (
                        <motion.div
                          key={uniqueKey}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          onClick={() => {
                            setSelectedMonsterReincarnationMonster(index);
                          }}
                          className={`relative cursor-pointer group ${
                            isSelected ? 'ring-4 ring-yellow-500 scale-105' : 'hover:scale-105'
                          } transition-all duration-200`}
                        >
                          <img
                            src={
                              getCardImageDisplayUrl(getAllCardImagePaths(monster)[0] ?? '') ||
                              monster.imageUrl ||
                              monster.cardImage ||
                              '/card-back.jpg'
                            }
                            alt={monster.name || monster.cardName || 'Monstro'}
                            className="w-full h-auto rounded-lg shadow-lg"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-yellow-500/30 rounded-lg flex items-center justify-center">
                              <div className="bg-yellow-500 text-white px-3 py-1 rounded-full font-bold text-sm">
                                Selecionado
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                            <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                              {monster.name || monster.cardName || 'Monstro'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-end gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMonsterReincarnationGraveyardModal(false);
                      setMonsterReincarnationGraveyard([]);
                      setSelectedMonsterReincarnationMonster(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (duelId && user?.id && selectedMonsterReincarnationMonster !== null) {
                        console.log(`🎯 Monster Reincarnation: Escolhendo monstro do cemitério:`, selectedMonsterReincarnationMonster);
                        
                        performAction(duelId, user.id, 'MONSTER_REINCARNATION_GRAVEYARD_CHOICE', {
                          graveyardIndex: selectedMonsterReincarnationMonster,
                        });
                        
                        // Resetar estados
                        setShowMonsterReincarnationGraveyardModal(false);
                        setMonsterReincarnationGraveyard([]);
                        setSelectedMonsterReincarnationMonster(null);
                      }
                    }}
                    disabled={selectedMonsterReincarnationMonster === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                      selectedMonsterReincarnationMonster !== null
                        ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedMonsterReincarnationMonster !== null ? '✅ Devolver à Mão' : 'Selecione um monstro'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de ChangeOfHeart */}
      <AnimatePresence>
        {showChangeOfHeartModal && changeOfHeartData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 9999, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent rounded-2xl border-2 border-pink-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
            >
              <div className="p-8 bg-transparent">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-pink-500/30 pb-4 bg-transparent">
                  <div className="bg-transparent">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-pink-400 to-pink-600 bg-clip-text text-transparent">
                      Change of Heart
                    </h2>
                    <p className="text-white/90 mt-2 bg-transparent">
                      Escolha um monstro do campo do oponente para controlar durante este turno (qualquer posição)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowChangeOfHeartModal(false);
                      setChangeOfHeartData(null);
                      setSelectedChangeOfHeartMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros do Oponente */}
                {changeOfHeartData.opponentMonsters.length > 0 ? (
                  <div className="mb-6 bg-transparent">
                    <h3 className="text-2xl font-bold text-white/90 mb-4 bg-transparent">Monstros do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {changeOfHeartData.opponentMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined && monster.zoneIndex !== null ? monster.zoneIndex : index;
                        const isSelected = selectedChangeOfHeartMonster === realZoneIndex;
                        
                        // Debug: verificar se zoneIndex está presente
                        if (index === 0) {
                          console.log('🔍 [ChangeOfHeart Modal] Primeiro monstro:', {
                            monster,
                            zoneIndex: monster.zoneIndex,
                            realZoneIndex,
                            index
                          });
                        }
                        const isFaceDown = monster.position === 'set';
                        const isDefense = monster.position === 'defense';
                                                
                        // Para monstros em defesa ou face down, precisamos rotacionar 90 graus
                        // Carta padrão: 120px x 175px (largura x altura)
                        // Após rotação: 175px x 120px (largura x altura)
                        // Container precisa ser 175px x 175px para não cortar
                        const needsRotation = isDefense || isFaceDown;
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        
                        return (
                          <motion.div
                            key={`opponent-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('🖱️ [ChangeOfHeart] Clicou no monstro:', {
                                realZoneIndex,
                                monster: monster.name || monster.cardName,
                                zoneIndex: monster.zoneIndex
                              });
                              setSelectedChangeOfHeartMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-pink-400 ring-4 ring-pink-400/50 shadow-lg shadow-pink-500/50'
                                : 'border-gray-600 hover:border-pink-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              {isFaceDown ? (
                                // Monstro face down: mostrar sleeve da carta do oponente
                                <div
                                  className="w-full h-full"
                                  style={{
                                    backgroundImage: `url(${opponentSkinImageUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                  }}
                                />
                              ) : (
                                // Monstro face up: mostrar imagem da carta
                                <CardImage
                                  card={monster}
                                  className="w-full h-full"
                                  fallback="/images/fundoCarta.webp"
                                />
                              )}
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-pink-400/20 flex items-center justify-center pointer-events-none rounded-xl backdrop-blur-sm">
                                <div className="bg-pink-400/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg font-bold text-sm border border-pink-300/50">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/40 backdrop-blur-sm px-2 py-1 rounded truncate border border-white/20">
                                {isFaceDown ? 'Monstro Face Down' : (monster.name || monster.cardName || 'Monstro')}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/80 bg-transparent">
                    <p className="text-lg bg-transparent">Não há monstros no campo do oponente para controlar</p>
                    <button
                      onClick={() => {
                        setShowChangeOfHeartModal(false);
                        setChangeOfHeartData(null);
                        setSelectedChangeOfHeartMonster(null);
                      }}
                      className="mt-4 bg-pink-600/70 hover:bg-pink-700/80 backdrop-blur-sm text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm border border-pink-400/50"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {changeOfHeartData.opponentMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6 bg-transparent">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowChangeOfHeartModal(false);
                        setChangeOfHeartData(null);
                        setSelectedChangeOfHeartMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700/60 hover:bg-gray-600/70 backdrop-blur-sm text-white rounded-lg font-bold transition-colors border border-gray-500/50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedChangeOfHeartMonster !== null && duelId && user?.id) {
                          console.log('✨ [ChangeOfHeart] Enviando escolha:', selectedChangeOfHeartMonster);
                          performAction(duelId, user.id, 'CHANGE_OF_HEART_CHOICE', {
                            chosenMonsterZoneIndex: selectedChangeOfHeartMonster,
                          });
                          
                          // Resetar estados
                          setShowChangeOfHeartModal(false);
                          setChangeOfHeartData(null);
                          setSelectedChangeOfHeartMonster(null);
                        }
                      }}
                      disabled={selectedChangeOfHeartMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm border ${
                        selectedChangeOfHeartMonster !== null
                          ? 'bg-pink-600/70 hover:bg-pink-700/80 backdrop-blur-sm text-white border-pink-400/50'
                          : 'bg-gray-600/60 text-gray-400 cursor-not-allowed border-gray-500/50'
                      }`}
                    >
                      {selectedChangeOfHeartMonster !== null 
                        ? 'Controlar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Chaos Sorcerer Effect */}
      <AnimatePresence>
        {showChaosSorcererEffectModal && chaosSorcererEffectData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 9999, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent rounded-2xl border-2 border-indigo-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
            >
              <div className="p-8 bg-transparent">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-indigo-500/30 pb-4 bg-transparent">
                  <div className="bg-transparent">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-600 bg-clip-text text-transparent">
                      Chaos Sorcerer - Efeito
                    </h2>
                    <p className="text-white/90 mt-2 bg-transparent">
                      Escolha 1 monstro face-up do campo para banir (você não poderá atacar neste turno)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowChaosSorcererEffectModal(false);
                      setChaosSorcererEffectData(null);
                      setSelectedChaosSorcererEffectMonster(null);
                      setIsSelectingChaosSorcererTarget(false);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Disponíveis */}
                {chaosSorcererEffectData.availableMonsters && chaosSorcererEffectData.availableMonsters.length > 0 ? (
                  <div className="mb-6 bg-transparent">
                    {/* Separar monstros do oponente e do próprio jogador */}
                    {(() => {
                      const opponentMonsters = chaosSorcererEffectData.availableMonsters.filter((m: any) => m.player === 'opponent');
                      const playerMonsters = chaosSorcererEffectData.availableMonsters.filter((m: any) => m.player === 'player');
                      
                      return (
                        <>
                          {/* Seção: Monstros do Oponente (em cima) */}
                          {opponentMonsters.length > 0 && (
                            <div className="mb-8 bg-transparent">
                              <h3 className="text-2xl font-bold text-red-400/90 mb-4 bg-transparent">Monstros do Oponente</h3>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {opponentMonsters.map((monsterData: any, index: number) => {
                        const { monster, zoneIndex, player } = monsterData;
                        const isSelected = selectedChaosSorcererEffectMonster?.zoneIndex === zoneIndex && 
                                         selectedChaosSorcererEffectMonster?.player === player;
                        const isFaceDown = monster.position === 'set';
                        const isDefense = monster.position === 'defense';
                                                const needsRotation = isDefense || isFaceDown;
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        
                        return (
                          <motion.div
                            key={`chaos-sorcerer-monster-${player}-${zoneIndex}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('🖱️ [ChaosSorcererEffect] Clicou no monstro:', {
                                zoneIndex,
                                player,
                                monster: monster.name || monster.cardName
                              });
                              setSelectedChaosSorcererEffectMonster({ zoneIndex, player });
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-indigo-400 ring-4 ring-indigo-400/50 shadow-lg shadow-indigo-500/50'
                                : 'border-gray-600 hover:border-indigo-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              {isFaceDown ? (
                                <div
                                  className="w-full h-full"
                                  style={{
                                    backgroundImage: `url(${player === 'opponent' ? opponentSkinImageUrl : mySkinImageUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                  }}
                                />
                              ) : (
                                <CardImage
                                  card={monster}
                                  className="w-full h-full"
                                  fallback="/images/fundoCarta.webp"
                                />
                              )}
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-indigo-400/20 flex items-center justify-center pointer-events-none rounded-xl backdrop-blur-sm">
                                <div className="bg-indigo-400/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg font-bold text-sm border border-indigo-300/50">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/40 backdrop-blur-sm px-2 py-1 rounded truncate border border-white/20">
                                {isFaceDown ? 'Monstro Face Down' : (monster.name || monster.cardName || 'Monstro')}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                              </div>
                            </div>
                          )}

                          {/* Seção: Monstros do Próprio Jogador (em baixo) */}
                          {playerMonsters.length > 0 && (
                            <div className="mb-6 bg-transparent">
                              <h3 className="text-2xl font-bold text-blue-400/90 mb-4 bg-transparent">Seus Monstros</h3>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {playerMonsters.map((monsterData: any, index: number) => {
                                  const { monster, zoneIndex, player } = monsterData;
                                  const isSelected = selectedChaosSorcererEffectMonster?.zoneIndex === zoneIndex && 
                                                   selectedChaosSorcererEffectMonster?.player === player;
                                  const isFaceDown = monster.position === 'set';
                                  const isDefense = monster.position === 'defense';
                                                                    const needsRotation = isDefense || isFaceDown;
                                  const cardWidth = '120px';
                                  const cardHeight = '175px';
                                  const containerSize = needsRotation ? '175px' : '120px';
                                  const containerHeight = needsRotation ? '175px' : '175px';
                                  
                                  return (
                                    <motion.div
                                      key={`chaos-sorcerer-monster-${player}-${zoneIndex}-${index}`}
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('🖱️ [ChaosSorcererEffect] Clicou no monstro:', {
                                          zoneIndex,
                                          player,
                                          monster: monster.name || monster.cardName
                                        });
                                        setSelectedChaosSorcererEffectMonster({ zoneIndex, player });
                                      }}
                                      className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                                        isSelected
                                          ? 'border-indigo-400 ring-4 ring-indigo-400/50 shadow-lg shadow-indigo-500/50'
                                          : 'border-gray-600 hover:border-indigo-500/50'
                                      }`}
                                      style={{ 
                                        width: containerSize, 
                                        height: containerHeight,
                                        overflow: 'visible',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                    >
                                      <div
                                        className="relative"
                                        style={{
                                          width: cardWidth,
                                          height: cardHeight,
                                          transform: needsRotation ? 'rotate(90deg)' : 'none',
                                          transformOrigin: 'center center',
                                          overflow: 'hidden',
                                          borderRadius: '8px',
                                        }}
                                      >
                                        {isFaceDown ? (
                                          <div
                                            className="w-full h-full"
                                            style={{
                                              backgroundImage: `url(${player === 'opponent' ? opponentSkinImageUrl : mySkinImageUrl})`,
                                              backgroundSize: 'cover',
                                              backgroundPosition: 'center',
                                              backgroundRepeat: 'no-repeat',
                                            }}
                                          />
                                        ) : (
                                          <CardImage
                                            card={monster}
                                            className="w-full h-full"
                                            fallback="/images/fundoCarta.webp"
                                          />
                                        )}
                                      </div>
                                      {isSelected && (
                                        <div className="absolute inset-0 bg-indigo-400/20 flex items-center justify-center pointer-events-none rounded-xl backdrop-blur-sm">
                                          <div className="bg-indigo-400/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg font-bold text-sm border border-indigo-300/50">
                                            Selecionado
                                          </div>
                                        </div>
                                      )}
                                      <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                                        <p className="text-white text-xs font-semibold bg-black/40 backdrop-blur-sm px-2 py-1 rounded truncate border border-white/20">
                                          {isFaceDown ? 'Monstro Face Down' : (monster.name || monster.cardName || 'Monstro')}
                                        </p>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/80 bg-transparent">
                    <p className="text-lg bg-transparent">Não há monstros face-up no campo para banir</p>
                    <button
                      onClick={() => {
                        setShowChaosSorcererEffectModal(false);
                        setChaosSorcererEffectData(null);
                        setSelectedChaosSorcererEffectMonster(null);
                        setIsSelectingChaosSorcererTarget(false);
                      }}
                      className="mt-4 bg-indigo-600/70 hover:bg-indigo-700/80 backdrop-blur-sm text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm border border-indigo-400/50"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {chaosSorcererEffectData.availableMonsters && chaosSorcererEffectData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6 bg-transparent">
                    <button
                      onClick={() => {
                        setShowChaosSorcererEffectModal(false);
                        setChaosSorcererEffectData(null);
                        setSelectedChaosSorcererEffectMonster(null);
                        setIsSelectingChaosSorcererTarget(false);
                      }}
                      className="px-8 py-3 bg-gray-700/60 hover:bg-gray-600/70 backdrop-blur-sm text-white rounded-lg font-bold transition-colors border border-gray-500/50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedChaosSorcererEffectMonster && duelId && user?.id && chaosSorcererEffectData.monsterZoneIndex !== undefined) {
                          console.log('✨ [ChaosSorcererEffect] Enviando escolha:', {
                            monsterZoneIndex: chaosSorcererEffectData.monsterZoneIndex,
                            targetPlayer: selectedChaosSorcererEffectMonster.player,
                            targetZoneIndex: selectedChaosSorcererEffectMonster.zoneIndex
                          });
                          performAction(duelId, user.id, 'CHAOS_SORCERER_EFFECT_CHOICE', {
                            monsterZoneIndex: chaosSorcererEffectData.monsterZoneIndex,
                            targetPlayer: selectedChaosSorcererEffectMonster.player,
                            targetZoneIndex: selectedChaosSorcererEffectMonster.zoneIndex,
                          });
                          
                          // Resetar estados
                          setShowChaosSorcererEffectModal(false);
                          setChaosSorcererEffectData(null);
                          setSelectedChaosSorcererEffectMonster(null);
                          setIsSelectingChaosSorcererTarget(false);
                        }
                      }}
                      disabled={selectedChaosSorcererEffectMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm border ${
                        selectedChaosSorcererEffectMonster !== null
                          ? 'bg-indigo-600/70 hover:bg-indigo-700/80 backdrop-blur-sm text-white border-indigo-400/50'
                          : 'bg-gray-600/60 text-gray-400 cursor-not-allowed border-gray-500/50'
                      }`}
                    >
                      {selectedChaosSorcererEffectMonster !== null 
                        ? 'Banir Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Black Luster Soldier - Envoy of the Beginning: escolher efeito 1 (banir) ou 2 (segundo ataque) */}
      <AnimatePresence>
        {showBlsEffectModal && blsEffectData && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim" style={{ pointerEvents: 'auto', zIndex: 9999 }} onClick={(e) => e.stopPropagation()}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="duel-modal-panel rounded-2xl border-2 border-amber-500/50 shadow-2xl max-w-2xl w-full overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-amber-400">Black Luster Soldier - Envoy of the Beginning</h2>
                <button onClick={() => { setShowBlsEffectModal(false); setBlsEffectData(null); setBlsEffectChoice(null); setSelectedBlsEffectMonster(null); }} className="text-gray-400 hover:text-red-400 text-2xl font-bold">✕</button>
              </div>
              <p className="text-gray-300 mb-4">Uma vez por turno, escolha 1 efeito para ativar:</p>
              {blsEffectChoice === null ? (
                <div className="flex flex-col gap-3">
                  <button onClick={() => setBlsEffectChoice(1)} className="p-4 rounded-xl border-2 border-amber-500/50 bg-amber-900/30 hover:bg-amber-800/40 text-left text-white">
                    <span className="font-bold text-amber-400">Efeito 1:</span> Escolha 1 monstro no campo; bana-o. Este card não pode atacar no turno em que este efeito for ativado.
                  </button>
                  <button onClick={() => {
                    if (duelId && user?.id && blsEffectData.monsterZoneIndex !== undefined) {
                      performAction(duelId, user.id, 'BLS_EFFECT_CHOICE', { monsterZoneIndex: blsEffectData.monsterZoneIndex, effectNumber: 2 });
                      setShowBlsEffectModal(false);
                      setBlsEffectData(null);
                      setBlsEffectChoice(null);
                    }
                  }} className="p-4 rounded-xl border-2 border-amber-500/50 bg-amber-900/30 hover:bg-amber-800/40 text-left text-white">
                    <span className="font-bold text-amber-400">Efeito 2:</span> Se este card que estiver atacando destruir um monstro do oponente em batalha: ele pode realizar um segundo ataque em seguida.
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-amber-300 mb-3">Escolha 1 monstro no campo para banir (BLS não poderá atacar este turno):</p>
                  {blsEffectData.availableMonsters && blsEffectData.availableMonsters.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                      {blsEffectData.availableMonsters.map((monsterData: any, index: number) => {
                        const { monster, zoneIndex, player } = monsterData;
                        const isSelected = selectedBlsEffectMonster?.zoneIndex === zoneIndex && selectedBlsEffectMonster?.player === player;
                        return (
                          <motion.div key={`bls-${player}-${zoneIndex}-${index}`} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedBlsEffectMonster({ zoneIndex, player })}
                            className={`cursor-pointer rounded-xl border-2 overflow-hidden ${isSelected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-gray-600 hover:border-amber-500/50'}`}
                            style={{ width: '100px', height: '146px' }}
                          >
                            <CardImage card={monster} className="w-full h-full object-cover" />
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-400 mb-4">Nenhum monstro face-up no campo.</p>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => setBlsEffectChoice(null)} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white">Voltar</button>
                    <button onClick={() => {
                      if (selectedBlsEffectMonster && duelId && user?.id && blsEffectData.monsterZoneIndex !== undefined) {
                        performAction(duelId, user.id, 'BLS_EFFECT_CHOICE', {
                          monsterZoneIndex: blsEffectData.monsterZoneIndex,
                          effectNumber: 1,
                          targetPlayer: selectedBlsEffectMonster.player,
                          targetZoneIndex: selectedBlsEffectMonster.zoneIndex,
                        });
                        setShowBlsEffectModal(false);
                        setBlsEffectData(null);
                        setBlsEffectChoice(null);
                        setSelectedBlsEffectMonster(null);
                      }
                    }} disabled={selectedBlsEffectMonster === null} className={`px-6 py-2 rounded-lg font-bold ${selectedBlsEffectMonster !== null ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                      Banir monstro
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Mystical Space Typhoon */}
      <AnimatePresence>
        {showMysticalSpaceTyphoonModal && mysticalSpaceTyphoonData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher uma carta
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                      Mystical Space Typhoon
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha uma Spell/Trap no campo para destruir
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMysticalSpaceTyphoonModal(false);
                      setMysticalSpaceTyphoonData(null);
                      setSelectedMSTTarget(null);
                      setIsSelectingMSTTarget(false);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Spell/Trap do Próprio Campo */}
                {mysticalSpaceTyphoonData.playerSpellTraps.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Seu Campo</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {mysticalSpaceTyphoonData.playerSpellTraps.map((spellTrap: any, index: number) => {
                        const card = spellTrap.card;
                        const realZoneIndex = spellTrap.zoneIndex;
                        const isSelected = selectedMSTTarget?.player === 'player' && selectedMSTTarget?.zoneIndex === realZoneIndex;
                        const isFaceDown = card.position === 'set';
                        
                        return (
                          <motion.div
                            key={`player-spelltrap-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMSTTarget({ player: 'player', zoneIndex: realZoneIndex });
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                                : 'border-gray-600 hover:border-yellow-500/50'
                            }`}
                            style={{ 
                              width: '120px', 
                              height: '175px',
                              overflow: 'hidden',
                            }}
                          >
                            {isFaceDown ? (
                              <div
                                className="w-full h-full"
                                style={{
                                  backgroundImage: `url(${mySkinImageUrl})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  backgroundRepeat: 'no-repeat',
                                }}
                              />
                            ) : (
                              <CardImage
                                card={card}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {isFaceDown ? 'Spell/Trap Set' : (card.name || card.cardName || 'Spell/Trap')}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-yellow-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {card.position === 'face-up' ? 'UP' : 'SET'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Seção: Spell/Trap do Campo do Oponente */}
                {(() => {
                  const opponentSpellTraps = mysticalSpaceTyphoonData?.opponentSpellTraps;
                  const isArray = Array.isArray(opponentSpellTraps);
                  const hasLength = opponentSpellTraps?.length > 0;
                  
                  console.log('🔍 [MysticalSpaceTyphoon Modal] Verificando renderização do oponente:', {
                    opponentSpellTraps,
                    isArray,
                    hasLength,
                    length: opponentSpellTraps?.length,
                    type: typeof opponentSpellTraps,
                    keys: opponentSpellTraps ? Object.keys(opponentSpellTraps) : null,
                    firstItem: opponentSpellTraps?.[0],
                    fullData: mysticalSpaceTyphoonData
                  });
                  
                  if (!isArray) {
                    console.error('❌ [MysticalSpaceTyphoon Modal] opponentSpellTraps não é array!', opponentSpellTraps);
                    return false;
                  }
                  
                  if (!hasLength) {
                    console.warn('⚠️ [MysticalSpaceTyphoon Modal] opponentSpellTraps está vazio!', opponentSpellTraps);
                    // Ainda assim, tentar renderizar se houver dados mesmo que vazios
                    return false;
                  }
                  
                  console.log('✅ [MysticalSpaceTyphoon Modal] Renderizando cartas do oponente:', opponentSpellTraps.length);
                  return true;
                })() ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Campo do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {mysticalSpaceTyphoonData.opponentSpellTraps.map((spellTrap: any, index: number) => {
                        console.log(`🔍 [MysticalSpaceTyphoon Modal] Renderizando carta do oponente ${index}:`, {
                          spellTrap,
                          hasCard: !!spellTrap?.card,
                          cardKeys: spellTrap?.card ? Object.keys(spellTrap.card) : null,
                          zoneIndex: spellTrap?.zoneIndex,
                          player: spellTrap?.player
                        });
                        
                        // CRÍTICO: Verificar estrutura dos dados
                        let card = null;
                        let realZoneIndex = index;
                        
                        if (spellTrap?.card) {
                          // Estrutura correta: { card: {...}, zoneIndex: 0, player: 'opponent' }
                          card = spellTrap.card;
                          realZoneIndex = spellTrap.zoneIndex ?? index;
                        } else if (spellTrap?.name || spellTrap?.cardName) {
                          // Estrutura alternativa: a carta está diretamente no objeto
                          console.warn(`⚠️ [MysticalSpaceTyphoon Modal] Carta do oponente ${index} não tem estrutura card - usando objeto direto`);
                          card = spellTrap;
                          realZoneIndex = spellTrap.zoneIndex ?? index;
                        } else {
                          console.error(`❌ [MysticalSpaceTyphoon Modal] Carta do oponente ${index} está em formato inválido:`, spellTrap);
                          return null;
                        }
                        
                        if (!card || (!card.name && !card.cardName)) {
                          console.warn(`⚠️ [MysticalSpaceTyphoon Modal] Carta do oponente ${index} está vazia ou inválida:`, card);
                          return null;
                        }
                        
                        const isSelected = selectedMSTTarget?.player === 'opponent' && selectedMSTTarget?.zoneIndex === realZoneIndex;
                        const isFaceDown = card?.position === 'set';
                        
                        return (
                          <motion.div
                            key={`opponent-spelltrap-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMSTTarget({ player: 'opponent', zoneIndex: realZoneIndex });
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                                : 'border-gray-600 hover:border-yellow-500/50'
                            }`}
                            style={{ 
                              width: '120px', 
                              height: '175px',
                              overflow: 'hidden',
                            }}
                          >
                            {isFaceDown ? (
                              <div
                                className="w-full h-full"
                                style={{
                                  backgroundImage: `url(${opponentSkinImageUrl})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  backgroundRepeat: 'no-repeat',
                                }}
                              />
                            ) : (
                              <CardImage
                                card={card}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {isFaceDown ? 'Spell/Trap Set' : (card.name || card.cardName || 'Spell/Trap')}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-yellow-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {card.position === 'face-up' ? 'UP' : 'SET'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Mensagem e botão quando não há spell/trap (antes de escolher ou já processado) */}
                {mysticalSpaceTyphoonData.playerSpellTraps.length === 0 && mysticalSpaceTyphoonData.opponentSpellTraps.length === 0 && (
                  <div className="text-center py-6 text-gray-400">
                    <p className="text-lg">Não há Spell/Trap no campo para destruir</p>
                    <button
                      onClick={() => {
                        setShowMysticalSpaceTyphoonModal(false);
                        setMysticalSpaceTyphoonData(null);
                        setSelectedMSTTarget(null);
                        setIsSelectingMSTTarget(false);
                      }}
                      className="mt-4 bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {(mysticalSpaceTyphoonData.playerSpellTraps.length > 0 || mysticalSpaceTyphoonData.opponentSpellTraps.length > 0) && (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMysticalSpaceTyphoonModal(false);
                        setMysticalSpaceTyphoonData(null);
                        setSelectedMSTTarget(null);
                        setIsSelectingMSTTarget(false);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedMSTTarget && duelId && user?.id && mysticalSpaceTyphoonData) {
                          console.log('✨ [MysticalSpaceTyphoon] Enviando escolha:', selectedMSTTarget, 'spellTrapZoneIndex:', mysticalSpaceTyphoonData.spellTrapZoneIndex);
                          performAction(duelId, user.id, 'MYSTICAL_SPACE_TYPHOON_CHOICE', {
                            targetPlayer: selectedMSTTarget.player,
                            targetZoneIndex: selectedMSTTarget.zoneIndex,
                            spellTrapZoneIndex: mysticalSpaceTyphoonData.spellTrapZoneIndex,
                          });
                          
                          // Resetar estados
                          setShowMysticalSpaceTyphoonModal(false);
                          setMysticalSpaceTyphoonData(null);
                          setSelectedMSTTarget(null);
                          setIsSelectingMSTTarget(false);
                        }
                      }}
                      disabled={selectedMSTTarget === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedMSTTarget !== null
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedMSTTarget !== null 
                        ? '✅ Destruir Spell/Trap' 
                        : 'Selecione uma Spell/Trap'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Breaker the Magical Warrior - escolher 1 Spell/Trap no campo para destruir (perde +300 ATK) */}
      <AnimatePresence>
        {isSelectingBreakerTarget && breakerMonsterZoneIndex !== null && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={() => {}}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-purple-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6 border-b-2 border-purple-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                      Breaker the Magical Warrior
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha uma Spell/Trap no campo para destruir. Ao usar o efeito, este monstro perde os 300 de ATK que ganhou na invocação normal.
                    </p>
                    <p className="text-purple-200/80 text-sm mt-1">
                      Clique em uma carta para selecioná-la e depois em &quot;Destruir Spell/Trap&quot;.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsSelectingBreakerTarget(false);
                      setBreakerMonsterZoneIndex(null);
                      setSelectedBreakerTarget(null);
                      setBreakerModalSpellTraps(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {(() => {
                  // Usar snapshot capturado ao abrir o modal para garantir que as cartas apareçam
                  const myRaw = breakerModalSpellTraps?.my ?? mySpellTraps ?? [];
                  const oppRaw = breakerModalSpellTraps?.opp ?? opponentSpellTraps ?? [];
                  const mySlots = Array.isArray(myRaw) ? [...myRaw] : [];
                  const oppSlots = Array.isArray(oppRaw) ? [...oppRaw] : [];
                  while (mySlots.length < 5) mySlots.push(null);
                  while (oppSlots.length < 5) oppSlots.push(null);
                  const toCard = (item: any) => (item && typeof item === 'object' && item.card != null ? item.card : item);
                  const playerList = mySlots
                    .map((item: any, zoneIndex: number) => {
                      const card = toCard(item);
                      return card ? { card, zoneIndex, player: 'player' as const } : null;
                    })
                    .filter(Boolean) as Array<{ card: any; zoneIndex: number; player: 'player' }>;
                  const opponentList = oppSlots
                    .map((item: any, zoneIndex: number) => {
                      const card = toCard(item);
                      return card ? { card, zoneIndex, player: 'opponent' as const } : null;
                    })
                    .filter(Boolean) as Array<{ card: any; zoneIndex: number; player: 'opponent' }>;
                  const total = playerList.length + opponentList.length;
                  if (total === 0) {
                    return (
                      <p className="text-gray-300 text-center py-8">Nenhuma Spell/Trap no campo para escolher.</p>
                    );
                  }
                  return (
                    <>
                      {/* Campo do oponente em cima */}
                      {opponentList.length > 0 && (
                        <div className="mb-6">
                          <h3 className="text-2xl font-bold text-white mb-4">Campo do oponente</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {opponentList.map(({ card, zoneIndex, player }) => {
                              const isSelected = selectedBreakerTarget?.player === player && selectedBreakerTarget?.zoneIndex === zoneIndex;
                              const isFaceDown = card.position === 'set';
                              return (
                                <motion.div
                                  key={`breaker-opponent-${zoneIndex}`}
                                  role="button"
                                  tabIndex={0}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBreakerTarget({ player, zoneIndex });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSelectedBreakerTarget({ player, zoneIndex });
                                    }
                                  }}
                                  className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                                    isSelected ? 'border-purple-400 ring-4 ring-purple-400/50' : 'border-gray-600 hover:border-purple-500/50'
                                  }`}
                                  style={{ width: '120px', height: '175px', overflow: 'hidden' }}
                                >
                                  {isFaceDown ? (
                                    <div
                                      className="w-full h-full bg-cover bg-center bg-no-repeat"
                                      style={{ backgroundImage: `url(${opponentSkinImageUrl})` }}
                                    />
                                  ) : (
                                    <CardImage card={card} className="w-full h-full" fallback="/images/fundoCarta.webp" />
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                      <span className="bg-purple-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm">Selecionado</span>
                                    </div>
                                  )}
                                  <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                                    <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                      {isFaceDown ? 'Set' : (card.name || card.cardName || '')}
                                    </p>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Seu campo embaixo */}
                      {playerList.length > 0 && (
                        <div className="mb-6">
                          <h3 className="text-2xl font-bold text-white mb-4">Seu campo</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {playerList.map(({ card, zoneIndex, player }) => {
                              const isSelected = selectedBreakerTarget?.player === player && selectedBreakerTarget?.zoneIndex === zoneIndex;
                              const isFaceDown = card.position === 'set';
                              return (
                                <motion.div
                                  key={`breaker-player-${zoneIndex}`}
                                  role="button"
                                  tabIndex={0}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBreakerTarget({ player, zoneIndex });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSelectedBreakerTarget({ player, zoneIndex });
                                    }
                                  }}
                                  className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                                    isSelected ? 'border-purple-400 ring-4 ring-purple-400/50' : 'border-gray-600 hover:border-purple-500/50'
                                  }`}
                                  style={{ width: '120px', height: '175px', overflow: 'hidden' }}
                                >
                                  {isFaceDown ? (
                                    <div
                                      className="w-full h-full bg-cover bg-center bg-no-repeat"
                                      style={{ backgroundImage: `url(${mySkinImageUrl})` }}
                                    />
                                  ) : (
                                    <CardImage card={card} className="w-full h-full" fallback="/images/fundoCarta.webp" />
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                      <span className="bg-purple-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm">Selecionado</span>
                                    </div>
                                  )}
                                  <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                                    <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                      {isFaceDown ? 'Set' : (card.name || card.cardName || '')}
                                    </p>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-3 pt-4">
                        <button
                          onClick={() => {
                            setIsSelectingBreakerTarget(false);
                            setBreakerMonsterZoneIndex(null);
                            setSelectedBreakerTarget(null);
                            setBreakerModalSpellTraps(null);
                          }}
                          className="px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => {
                            if (
                              selectedBreakerTarget &&
                              duelId &&
                              user?.id &&
                              breakerMonsterZoneIndex !== null &&
                              breakerMonsterZoneIndex >= 0 &&
                              breakerMonsterZoneIndex < 5
                            ) {
                              performAction(duelId, user.id, 'BREAKER_REMOVE_COUNTER', {
                                monsterZoneIndex: breakerMonsterZoneIndex,
                                targetPlayer: selectedBreakerTarget.player,
                                targetZoneIndex: selectedBreakerTarget.zoneIndex,
                              });
                              setIsSelectingBreakerTarget(false);
                              setBreakerMonsterZoneIndex(null);
                              setSelectedBreakerTarget(null);
                              setBreakerModalSpellTraps(null);
                            }
                          }}
                          disabled={selectedBreakerTarget === null}
                          className={`px-6 py-2 rounded-lg font-bold ${
                            selectedBreakerTarget !== null
                              ? 'bg-purple-600 hover:bg-purple-500 text-white'
                              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {selectedBreakerTarget !== null ? 'Destruir Spell/Trap' : 'Escolha uma carta'}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de UnitedWeStand */}
      <AnimatePresence>
        {showUnitedWeStandModal && unitedWeStandData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                      United We Stand
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro face-up do seu campo para equipar. O monstro ganha 800 de ATK para cada monstro face-up no seu campo (incluindo ele mesmo).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowUnitedWeStandModal(false);
                      setUnitedWeStandData(null);
                      setSelectedUnitedWeStandMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up Disponíveis */}
                {unitedWeStandData.availableMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up Disponíveis</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {unitedWeStandData.availableMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedUnitedWeStandMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                                                
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`available-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedUnitedWeStandMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                                : 'border-gray-600 hover:border-yellow-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-yellow-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no seu campo para equipar</p>
                    <button
                      onClick={() => {
                        setShowUnitedWeStandModal(false);
                        setUnitedWeStandData(null);
                        setSelectedUnitedWeStandMonster(null);
                      }}
                      className="mt-4 bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {unitedWeStandData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowUnitedWeStandModal(false);
                        setUnitedWeStandData(null);
                        setSelectedUnitedWeStandMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedUnitedWeStandMonster !== null && duelId && user?.id) {
                          console.log('✨ [UnitedWeStand] Enviando escolha:', selectedUnitedWeStandMonster);
                          performAction(duelId, user.id, 'UNITED_WE_STAND_CHOICE', {
                            chosenMonsterZoneIndex: selectedUnitedWeStandMonster,
                          });
                          
                          // Resetar estados
                          setShowUnitedWeStandModal(false);
                          setUnitedWeStandData(null);
                          setSelectedUnitedWeStandMonster(null);
                        }
                      }}
                      disabled={selectedUnitedWeStandMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedUnitedWeStandMonster !== null
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedUnitedWeStandMonster !== null 
                        ? 'Equipar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal do efeito do Obelisk the Tormentor: escolher 2 monstros para destruir + destruir todos do oponente */}
      <AnimatePresence>
        {showObeliskEffectModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-amber-600/50 shadow-2xl max-w-2xl w-full overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-4 border-b-2 border-amber-500/30 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
                      Obelisk the Tormentor
                    </h2>
                    <p className="text-gray-300 mt-1 text-sm">
                      Escolha 2 monstros do seu campo. Eles serão destruídos e todos os monstros do oponente serão destruídos.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowObeliskEffectModal(false); setObeliskSelectedZones([]); }}
                    className="text-gray-400 hover:text-red-400 text-2xl font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="mb-4">
                  <p className="text-gray-400 text-sm mb-2">Selecionados: {obeliskSelectedZones.length}/2</p>
                  <div className="grid grid-cols-5 gap-2">
                    {myMonsters.map((monster: any, zoneIndex: number) => {
                      if (!monster) return null;
                      const isSelected = obeliskSelectedZones.includes(zoneIndex);
                      return (
                        <motion.div
                          key={`obelisk-sacrifice-${zoneIndex}`}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (isSelected) {
                              setObeliskSelectedZones(obeliskSelectedZones.filter(z => z !== zoneIndex));
                            } else if (obeliskSelectedZones.length < 2) {
                              setObeliskSelectedZones([...obeliskSelectedZones, zoneIndex].sort((a, b) => a - b));
                            }
                          }}
                          className={`relative cursor-pointer rounded-xl border-2 overflow-hidden ${
                            isSelected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-gray-600 hover:border-amber-500/50'
                          }`}
                          style={{ width: '100px', height: '146px' }}
                        >
                          <CardImage card={monster} className="w-full h-full object-cover" fallback="/images/fundoCarta.webp" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-amber-400/40 flex items-center justify-center">
                              <span className="bg-amber-500 text-black text-xs font-bold px-2 py-1 rounded">#{obeliskSelectedZones.indexOf(zoneIndex) + 1}</span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 text-center">
                            <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-1 py-0.5 truncate">{monster.name || monster.cardName || 'Monstro'}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => { setShowObeliskEffectModal(false); setObeliskSelectedZones([]); }}
                    className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (obeliskSelectedZones.length === 2 && duelId && user?.id) {
                        performAction(duelId, user.id, 'OBELISK_EFFECT', { sacrificeZoneIndices: obeliskSelectedZones });
                        setShowObeliskEffectModal(false);
                        setObeliskSelectedZones([]);
                      }
                    }}
                    disabled={obeliskSelectedZones.length !== 2}
                    className={`px-6 py-2 rounded-lg font-bold text-sm ${
                      obeliskSelectedZones.length === 2 ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {obeliskSelectedZones.length === 2 ? 'Ativar efeito' : 'Selecione 2 monstros'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de MagePower */}
      <AnimatePresence>
        {showMagePowerModal && magePowerData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-purple-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-purple-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                      Mage Power
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro face-up do seu campo para equipar. O monstro ganha 500 de ATK para cada carta na sua zona de spell/trap (incluindo esta carta).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMagePowerModal(false);
                      setMagePowerData(null);
                      setSelectedMagePowerMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up Disponíveis */}
                {magePowerData.availableMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up Disponíveis</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {magePowerData.availableMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedMagePowerMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                                                
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`available-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMagePowerMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-purple-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no seu campo para equipar</p>
                    <button
                      onClick={() => {
                        setShowMagePowerModal(false);
                        setMagePowerData(null);
                        setSelectedMagePowerMonster(null);
                      }}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {magePowerData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMagePowerModal(false);
                        setMagePowerData(null);
                        setSelectedMagePowerMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedMagePowerMonster !== null && duelId && user?.id) {
                          console.log('✨ [MagePower] Enviando escolha:', selectedMagePowerMonster);
                          performAction(duelId, user.id, 'MAGE_POWER_CHOICE', {
                            chosenMonsterZoneIndex: selectedMagePowerMonster,
                          });
                          
                          // Resetar estados
                          setShowMagePowerModal(false);
                          setMagePowerData(null);
                          setSelectedMagePowerMonster(null);
                        }
                      }}
                      disabled={selectedMagePowerMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedMagePowerMonster !== null
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedMagePowerMonster !== null 
                        ? 'Equipar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de BrainControl */}
      <AnimatePresence>
        {showBrainControlModal && brainControlData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 9999, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent rounded-2xl border-2 border-blue-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
            >
              <div className="p-8 bg-transparent">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-blue-500/30 pb-4 bg-transparent">
                  <div className="bg-transparent">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                      Brain Control
                    </h2>
                    <p className="text-white/90 mt-2 bg-transparent">
                      Escolha um monstro face-up do campo do oponente para controlar durante este turno (custo: 800 LP)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowBrainControlModal(false);
                      setBrainControlData(null);
                      setSelectedBrainControlMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up do Oponente */}
                {brainControlData.opponentMonsters.length > 0 ? (
                  <div className="mb-6 bg-transparent">
                    <h3 className="text-2xl font-bold text-white/90 mb-4 bg-transparent">Monstros Face-Up do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {brainControlData.opponentMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined && monster.zoneIndex !== null ? monster.zoneIndex : index;
                        const isSelected = selectedBrainControlMonster === realZoneIndex;
                        
                        // Debug: verificar se zoneIndex está presente
                        if (index === 0) {
                          console.log('🔍 [BrainControl Modal] Primeiro monstro:', {
                            monster,
                            zoneIndex: monster.zoneIndex,
                            realZoneIndex,
                            index
                          });
                        }
                        const isDefense = monster.position === 'defense';
                                                
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        // Usar instanceId ou zoneIndex como chave única
                        const uniqueKey = monster.instanceId || `opponent-monster-${realZoneIndex}-${index}`;
                        return (
                          <motion.div
                            key={uniqueKey}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('🖱️ [BrainControl] Clicou no monstro:', {
                                realZoneIndex,
                                monster: monster.name || monster.cardName,
                                zoneIndex: monster.zoneIndex
                              });
                              setSelectedBrainControlMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-blue-400 ring-4 ring-blue-400/50 shadow-lg shadow-blue-500/50'
                                : 'border-gray-600 hover:border-blue-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-blue-400/20 flex items-center justify-center pointer-events-none rounded-xl backdrop-blur-sm">
                                <div className="bg-blue-400/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg font-bold text-sm border border-blue-300/50">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/40 backdrop-blur-sm px-2 py-1 rounded truncate border border-white/20">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-blue-500/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded font-bold border border-blue-300/50">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/80 bg-transparent">
                    <p className="text-lg bg-transparent">Não há monstros face-up no campo do oponente para controlar</p>
                    <button
                      onClick={() => {
                        setShowBrainControlModal(false);
                        setBrainControlData(null);
                        setSelectedBrainControlMonster(null);
                      }}
                      className="mt-4 bg-blue-600/70 hover:bg-blue-700/80 backdrop-blur-sm text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm border border-blue-400/50"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {brainControlData.opponentMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6 bg-transparent">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowBrainControlModal(false);
                        setBrainControlData(null);
                        setSelectedBrainControlMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700/60 hover:bg-gray-600/70 backdrop-blur-sm text-white rounded-lg font-bold transition-colors border border-gray-500/50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedBrainControlMonster !== null && duelId && user?.id) {
                          console.log('✨ [BrainControl] Enviando escolha:', selectedBrainControlMonster);
                          performAction(duelId, user.id, 'BRAIN_CONTROL_CHOICE', {
                            chosenMonsterZoneIndex: selectedBrainControlMonster,
                          });
                          
                          // Resetar estados
                          setShowBrainControlModal(false);
                          setBrainControlData(null);
                          setSelectedBrainControlMonster(null);
                        }
                      }}
                      disabled={selectedBrainControlMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm border ${
                        selectedBrainControlMonster !== null
                          ? 'bg-blue-600/70 hover:bg-blue-700/80 backdrop-blur-sm text-white border-blue-400/50'
                          : 'bg-gray-600/60 text-gray-400 cursor-not-allowed border-gray-500/50'
                      }`}
                    >
                      {selectedBrainControlMonster !== null 
                        ? 'Controlar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Lightning Storm - escolher 1 efeito */}
      <AnimatePresence>
        {showLightningStormModal && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ zIndex: 9999, pointerEvents: 'auto', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as React.CSSProperties}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl border-2 border-amber-500/50 shadow-2xl max-w-lg w-full p-8 duel-modal-panel"
              style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as React.CSSProperties}
            >
              <div className="flex justify-between items-start mb-6 border-b border-amber-500/30 pb-4">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent">
                    Lightning Storm
                  </h2>
                  <p className="text-gray-300 mt-2 text-sm">
                    Escolha 1 efeito (só pode ativar se você não controlar nenhuma carta com face para cima; 1 vez por turno).
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                    }
                    setShowLightningStormModal(false);
                  }}
                  className="text-gray-400 hover:text-amber-400 text-2xl font-bold transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'LIGHTNING_STORM_CHOICE', { effect: 'destroy_attack_monsters' });
                      setShowLightningStormModal(false);
                    }
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-white font-medium transition-colors"
                >
                  Destruir todos os monstros em posição de ataque que seu oponente controla
                </button>
                <button
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'LIGHTNING_STORM_CHOICE', { effect: 'destroy_spells_traps' });
                      setShowLightningStormModal(false);
                    }
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-white font-medium transition-colors"
                >
                  Destruir todas as magias e armadilhas que seu oponente controla
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                    }
                    setShowLightningStormModal(false);
                  }}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-bold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de SoulTaker */}
      <AnimatePresence>
        {showSoulTakerModal && soulTakerData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ 
              zIndex: 9999,
              pointerEvents: 'auto',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            } as React.CSSProperties}
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent rounded-2xl border-2 border-red-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-red-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                      Soul Taker
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro face-up que seu oponente controla; destrua o alvo e, depois, seu oponente ganha 1000 PV.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowSoulTakerModal(false);
                      setSoulTakerData(null);
                      setSelectedSoulTakerMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up do Oponente */}
                {soulTakerData.opponentMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {soulTakerData.opponentMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedSoulTakerMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                                                
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`opponent-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedSoulTakerMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-red-400 ring-4 ring-red-400/50 shadow-lg shadow-red-500/50'
                                : 'border-gray-600 hover:border-red-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-red-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-red-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-red-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no campo do oponente para destruir</p>
                    <button
                      onClick={() => {
                        setShowSoulTakerModal(false);
                        setSoulTakerData(null);
                        setSelectedSoulTakerMonster(null);
                      }}
                      className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {soulTakerData.opponentMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowSoulTakerModal(false);
                        setSoulTakerData(null);
                        setSelectedSoulTakerMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedSoulTakerMonster !== null && duelId && user?.id) {
                          console.log('✨ [SoulTaker] Enviando escolha:', selectedSoulTakerMonster);
                          performAction(duelId, user.id, 'SOUL_TAKER_CHOICE', {
                            chosenMonsterZoneIndex: selectedSoulTakerMonster,
                          });
                          
                          // Resetar estados
                          setShowSoulTakerModal(false);
                          setSoulTakerData(null);
                          setSelectedSoulTakerMonster(null);
                        }
                      }}
                      disabled={selectedSoulTakerMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedSoulTakerMonster !== null
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedSoulTakerMonster !== null 
                        ? 'Destruir Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPlayerTargetSpellModal && playerTargetSpellData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            style={{ zIndex: 9999, pointerEvents: 'auto' } as React.CSSProperties}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="duel-modal-panel rounded-2xl border-2 border-cyan-500/40 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6"
            >
              <div className="flex justify-between items-start mb-4 border-b border-cyan-500/30 pb-3">
                <div>
                  <h2 className="text-2xl font-bold text-cyan-300">Escolha do duelista</h2>
                  <p className="text-gray-300 mt-1">{playerTargetSpellData.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (duelId && user?.id) performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                    setShowPlayerTargetSpellModal(false);
                    setPlayerTargetSpellData(null);
                    setPlayerTargetSpellPick(null);
                  }}
                  className="text-gray-400 hover:text-white text-2xl font-bold"
                >
                  ✕
                </button>
              </div>

              {playerTargetSpellData.selectableHand?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {playerTargetSpellData.selectableHand.map((c: any) => {
                    const sel =
                      playerTargetSpellPick?.kind === 'hand' &&
                      playerTargetSpellPick.instanceId === c.instanceId;
                    return (
                      <button
                        key={String(c.instanceId || c.idCarta || Math.random())}
                        type="button"
                        onClick={() =>
                          setPlayerTargetSpellPick({ kind: 'hand', instanceId: c.instanceId })
                        }
                        className={`rounded-lg border-2 overflow-hidden ${
                          sel ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-600'
                        }`}
                      >
                        <div className="relative mx-auto w-full max-h-44 aspect-[59/86] bg-slate-950/40">
                          <CardImage
                            {...CARD_IMAGE_GRID_PROPS}
                            card={c}
                            className="absolute inset-0 size-full"
                            loading="eager"
                            objectFit="contain"
                            fallback="/images/fundoCarta.webp"
                          />
                        </div>
                        <div className="text-xs text-center text-white bg-black/55 backdrop-blur-sm py-1 truncate">
                          {c.name || c.cardName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {playerTargetSpellData.graveyardChoices?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {playerTargetSpellData.graveyardChoices.map((row: any) => {
                    const idx = row.index;
                    const c = row.card;
                    const sel =
                      playerTargetSpellPick?.kind === 'gy' && playerTargetSpellPick.index === idx;
                    return (
                      <button
                        key={`gy-${idx}`}
                        type="button"
                        onClick={() => setPlayerTargetSpellPick({ kind: 'gy', index: idx })}
                        className={`rounded-lg border-2 overflow-hidden ${
                          sel ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-600'
                        }`}
                      >
                        <div className="relative mx-auto w-full max-h-44 aspect-[59/86] bg-slate-950/40">
                          <CardImage
                            {...CARD_IMAGE_GRID_PROPS}
                            card={c}
                            className="absolute inset-0 size-full"
                            loading="eager"
                            objectFit="contain"
                            fallback="/images/fundoCarta.webp"
                          />
                        </div>
                        <div className="text-xs text-center text-white bg-black/55 backdrop-blur-sm py-1 truncate">
                          {c?.name || c?.cardName} (#{idx + 1})
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {playerTargetSpellData.spellTrapChoices?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {playerTargetSpellData.spellTrapChoices.map((row: any, i: number) => {
                    const sel =
                      playerTargetSpellPick?.kind === 'st' &&
                      playerTargetSpellPick.zoneIndex === row.zoneIndex &&
                      playerTargetSpellPick.isOpponent === row.isOpponent;
                    const c = row.card;
                    return (
                      <button
                        key={`st-${row.isOpponent ? 'o' : 'p'}-${row.zoneIndex}-${i}`}
                        type="button"
                        onClick={() =>
                          setPlayerTargetSpellPick({
                            kind: 'st',
                            zoneIndex: row.zoneIndex,
                            isOpponent: row.isOpponent,
                          })
                        }
                        className={`rounded-lg border-2 overflow-hidden ${
                          sel ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-600'
                        }`}
                      >
                        <div className="relative mx-auto w-full max-h-44 aspect-[59/86] bg-slate-950/40">
                          <CardImage
                            {...CARD_IMAGE_GRID_PROPS}
                            card={c}
                            className="absolute inset-0 size-full"
                            loading="eager"
                            objectFit="contain"
                            fallback="/images/fundoCarta.webp"
                          />
                        </div>
                        <div className="text-xs text-center text-white bg-black/55 backdrop-blur-sm py-1 truncate">
                          {(c?.name || c?.cardName) + (row.isOpponent ? ' (oponente)' : ' (seu)')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {playerTargetSpellData.opponentMonsters?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {playerTargetSpellData.opponentMonsters.map((m: any, i: number) => {
                    const zi = m.zoneIndex !== undefined ? m.zoneIndex : i;
                    const sel =
                      playerTargetSpellPick?.kind === 'om' && playerTargetSpellPick.zoneIndex === zi;
                    return (
                      <button
                        key={`om-${zi}`}
                        type="button"
                        onClick={() => setPlayerTargetSpellPick({ kind: 'om', zoneIndex: zi })}
                        className={`rounded-lg border-2 overflow-hidden ${
                          sel ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-600'
                        }`}
                      >
                        <div className="relative mx-auto w-full max-h-44 aspect-[59/86] bg-slate-950/40">
                          <CardImage
                            {...CARD_IMAGE_GRID_PROPS}
                            card={m}
                            className="absolute inset-0 size-full"
                            loading="eager"
                            objectFit="contain"
                            fallback="/images/fundoCarta.webp"
                          />
                        </div>
                        <div className="text-xs text-center text-white bg-black/55 backdrop-blur-sm py-1 truncate">
                          {m.name || m.cardName} (z{zi + 1})
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {playerTargetSpellData.defenseMonsters?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {playerTargetSpellData.defenseMonsters.map((row: any, i: number) => {
                    const sel =
                      playerTargetSpellPick?.kind === 'df' &&
                      playerTargetSpellPick.zoneIndex === row.zoneIndex &&
                      playerTargetSpellPick.isOpponent === row.isOpponent;
                    const m = row.monster;
                    return (
                      <button
                        key={`df-${row.isOpponent ? 'o' : 'p'}-${row.zoneIndex}-${i}`}
                        type="button"
                        onClick={() =>
                          setPlayerTargetSpellPick({
                            kind: 'df',
                            zoneIndex: row.zoneIndex,
                            isOpponent: row.isOpponent,
                          })
                        }
                        className={`rounded-lg border-2 overflow-hidden ${
                          sel ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-600'
                        }`}
                      >
                        <div className="relative mx-auto w-full max-h-44 aspect-[59/86] bg-slate-950/40">
                          <CardImage
                            {...CARD_IMAGE_GRID_PROPS}
                            card={m}
                            className="absolute inset-0 size-full"
                            loading="eager"
                            objectFit="contain"
                            fallback="/images/fundoCarta.webp"
                          />
                        </div>
                        <div className="text-xs text-center text-white bg-black/55 backdrop-blur-sm py-1 truncate">
                          {(m?.name || m?.cardName) + (row.isOpponent ? ' (oponente)' : ' (seu)')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {playerTargetSpellData.emptyMonsterZones?.length ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {playerTargetSpellData.emptyMonsterZones.map((z: number) => {
                    const sel =
                      playerTargetSpellPick?.kind === 'ez' && playerTargetSpellPick.zoneIndex === z;
                    return (
                      <button
                        key={`ez-${z}`}
                        type="button"
                        onClick={() => setPlayerTargetSpellPick({ kind: 'ez', zoneIndex: z })}
                        className={`px-4 py-3 rounded-lg font-bold border-2 ${
                          sel
                            ? 'border-cyan-400 bg-cyan-500/20 text-white'
                            : 'border-gray-600 text-gray-200'
                        }`}
                      >
                        Zona monstro {z + 1}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="flex justify-center gap-3 mt-6 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (duelId && user?.id) performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                    setShowPlayerTargetSpellModal(false);
                    setPlayerTargetSpellData(null);
                    setPlayerTargetSpellPick(null);
                  }}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = playerTargetSpellData;
                    const ad: Record<string, unknown> = {};
                    if (d.selectableHand?.length) {
                      if (
                        !playerTargetSpellPick ||
                        playerTargetSpellPick.kind !== 'hand' ||
                        !playerTargetSpellPick.instanceId
                      ) {
                        return;
                      }
                      ad.instanceIdToDiscard = playerTargetSpellPick.instanceId;
                    } else if (d.graveyardChoices?.length) {
                      if (playerTargetSpellPick?.kind !== 'gy' || playerTargetSpellPick.index === undefined) {
                        return;
                      }
                      ad.graveyardIndex = playerTargetSpellPick.index;
                    } else if (d.spellTrapChoices?.length) {
                      if (playerTargetSpellPick?.kind !== 'st') return;
                      ad.spellTrapZoneIndex = playerTargetSpellPick.zoneIndex;
                      ad.spellTrapTargetIsOpponent = playerTargetSpellPick.isOpponent;
                    } else if (d.opponentMonsters?.length) {
                      if (playerTargetSpellPick?.kind !== 'om') return;
                      ad.monsterZoneIndex = playerTargetSpellPick.zoneIndex;
                    } else if (d.defenseMonsters?.length) {
                      if (playerTargetSpellPick?.kind !== 'df') return;
                      ad.monsterZoneIndex = playerTargetSpellPick.zoneIndex;
                      ad.monsterTargetIsOpponent = playerTargetSpellPick.isOpponent;
                    } else if (d.emptyMonsterZones?.length) {
                      if (playerTargetSpellPick?.kind !== 'ez') return;
                      ad.emptyMonsterZoneIndex = playerTargetSpellPick.zoneIndex;
                    } else {
                      return;
                    }
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'PLAYER_TARGET_SPELL_RESOLVE', ad);
                    }
                    setShowPlayerTargetSpellModal(false);
                    setPlayerTargetSpellData(null);
                    setPlayerTargetSpellPick(null);
                  }}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Exiled Force */}
      <AnimatePresence>
        {showExiledForceModal && exiledForceData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl border-2 border-orange-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-orange-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">
                      Exiled Force
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Você pode tributar este monstro; destrua 1 monstro no campo.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowExiledForceModal(false);
                      setExiledForceData(null);
                      setSelectedExiledForceMonster(null);
                    }}
                    className="text-gray-400 hover:text-orange-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Disponíveis - oponente como no campo (5 zonas, posição e face); depois seus monstros */}
                {exiledForceData.availableMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Selecione um Monstro para Destruir</h3>
                    {/* Monstros do oponente: só as cartas na posição em que estão (sem zonas vazias) */}
                    {(() => {
                      const opponentItems = exiledForceData.availableMonsters
                        .filter((item: any) => item.player === 'opponent')
                        .sort((a: any, b: any) => a.zoneIndex - b.zoneIndex);
                      return opponentItems.length > 0 ? (
                        <div className="mb-6">
                          <h4 className="text-lg font-semibold text-orange-200 mb-3">Monstros do Oponente</h4>
                          <div className="flex flex-wrap gap-4 justify-center items-center">
                            {opponentItems.map((item: any) => {
                              const { monster, zoneIndex } = item;
                              const isSelected = selectedExiledForceMonster?.player === 'opponent' && selectedExiledForceMonster?.zoneIndex === zoneIndex;
                              const isDefense = monster?.position === 'defense' || monster?.position === 'defence';
                              const isFaceDown = monster?.position === 'set';
                              const needsRotation = isDefense || isFaceDown;
                              const cardW = 100;
                              const cardH = 146;
                              const containerW = needsRotation ? cardH : cardW;
                              const containerH = needsRotation ? cardW : cardH;
                              return (
                                <motion.div
                                  key={`exiled-opponent-${zoneIndex}`}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setSelectedExiledForceMonster({ zoneIndex, player: 'opponent' })}
                                  className={`relative rounded-lg border-2 transition-all flex items-center justify-center cursor-pointer overflow-hidden ${
                                    isSelected ? 'border-orange-400 ring-4 ring-orange-400/50 shadow-lg shadow-orange-500/50' : 'border-gray-600 hover:border-orange-500/50'
                                  }`}
                                  style={{ width: containerW, height: containerH, minWidth: containerW, minHeight: containerH }}
                                >
                                  <div
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{
                                      width: cardW,
                                      height: cardH,
                                      transform: needsRotation ? 'rotate(90deg)' : 'none',
                                      transformOrigin: 'center center',
                                      left: '50%',
                                      top: '50%',
                                      marginLeft: -cardW / 2,
                                      marginTop: -cardH / 2,
                                    }}
                                  >
                                    {isFaceDown ? (
                                      <div
                                        className="w-full h-full bg-cover bg-center bg-no-repeat rounded"
                                        style={{ backgroundImage: `url(${opponentSkinImageUrl})`, width: cardW, height: cardH }}
                                      />
                                    ) : (
                                      <CardImage card={monster} className="w-full h-full rounded" fallback="/images/fundoCarta.webp" style={{ width: cardW, height: cardH }} />
                                    )}
                                  </div>
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-orange-400/30 flex items-center justify-center pointer-events-none rounded-lg">
                                      <span className="bg-orange-400/95 text-black px-2 py-1 rounded font-bold text-xs">Selecionado</span>
                                    </div>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null;
                    })()}
                    {/* Seus monstros: só as cartas na posição em que estão (sem zonas vazias) */}
                    {(() => {
                      const playerItems = exiledForceData.availableMonsters
                        .filter((item: any) => item.player === 'player')
                        .sort((a: any, b: any) => a.zoneIndex - b.zoneIndex);
                      return playerItems.length > 0 ? (
                        <div>
                          <h4 className="text-lg font-semibold text-orange-200 mb-3">Seus Monstros</h4>
                          <div className="flex flex-wrap gap-4 justify-center items-center">
                            {playerItems.map((item: any) => {
                              const { monster, zoneIndex } = item;
                              const isSelected = selectedExiledForceMonster?.player === 'player' && selectedExiledForceMonster?.zoneIndex === zoneIndex;
                              const isDefense = monster?.position === 'defense' || monster?.position === 'defence';
                              const isFaceDown = monster?.position === 'set';
                              const needsRotation = isDefense || isFaceDown;
                              const cardW = 100;
                              const cardH = 146;
                              const containerW = needsRotation ? cardH : cardW;
                              const containerH = needsRotation ? cardW : cardH;
                              return (
                                <motion.div
                                  key={`exiled-player-${zoneIndex}`}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setSelectedExiledForceMonster({ zoneIndex, player: 'player' })}
                                  className={`relative rounded-lg border-2 transition-all flex items-center justify-center cursor-pointer overflow-hidden ${
                                    isSelected ? 'border-orange-400 ring-4 ring-orange-400/50 shadow-lg shadow-orange-500/50' : 'border-gray-600 hover:border-orange-500/50'
                                  }`}
                                  style={{ width: containerW, height: containerH, minWidth: containerW, minHeight: containerH }}
                                >
                                  <div
                                    className="absolute flex items-center justify-center"
                                    style={{
                                      width: cardW,
                                      height: cardH,
                                      transform: needsRotation ? 'rotate(90deg)' : 'none',
                                      transformOrigin: 'center center',
                                      left: '50%',
                                      top: '50%',
                                      marginLeft: -cardW / 2,
                                      marginTop: -cardH / 2,
                                    }}
                                  >
                                    {isFaceDown ? (
                                      <div
                                        className="w-full h-full bg-cover bg-center bg-no-repeat rounded"
                                        style={{ backgroundImage: `url(${mySkinImageUrl})`, width: cardW, height: cardH }}
                                      />
                                    ) : (
                                      <CardImage card={monster} className="w-full h-full rounded" fallback="/images/fundoCarta.webp" style={{ width: cardW, height: cardH }} />
                                    )}
                                  </div>
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-orange-400/30 flex items-center justify-center pointer-events-none rounded-lg">
                                      <span className="bg-orange-400/95 text-black px-2 py-1 rounded font-bold text-xs">Selecionado</span>
                                    </div>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros no campo para destruir</p>
                    <button
                      onClick={() => {
                        setShowExiledForceModal(false);
                        setExiledForceData(null);
                        setSelectedExiledForceMonster(null);
                      }}
                      className="mt-4 bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {exiledForceData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        setShowExiledForceModal(false);
                        setExiledForceData(null);
                        setSelectedExiledForceMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedExiledForceMonster !== null && duelId && user?.id && exiledForceData?.monsterZoneIndex !== undefined) {
                          console.log('✨ [Exiled Force] Enviando escolha:', selectedExiledForceMonster);
                          performAction(duelId, user.id, 'EXILED_FORCE_CHOICE', {
                            monsterZoneIndex: exiledForceData.monsterZoneIndex,
                            targetPlayer: selectedExiledForceMonster.player,
                            targetZoneIndex: selectedExiledForceMonster.zoneIndex,
                          });
                          
                          // Resetar estados
                          setShowExiledForceModal(false);
                          setExiledForceData(null);
                          setSelectedExiledForceMonster(null);
                        }
                      }}
                      disabled={selectedExiledForceMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedExiledForceMonster !== null
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedExiledForceMonster !== null 
                        ? 'Destruir Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal do Efeito do Dark Armed Dragon */}
      <AnimatePresence>
        {showDarkArmedDragonEffectModal && darkArmedDragonEffectData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowDarkArmedDragonEffectModal(false);
                setDarkArmedDragonEffectData(null);
                setSelectedDarkMonsterToBanish(null);
                setSelectedCardToDestroy(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="duel-modal-panel border-2 border-purple-400/70 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Efeito do Dark Armed Dragon
                </h2>
                <p className="text-purple-200 text-sm">
                  {selectedDarkMonsterToBanish === null
                    ? 'Selecione 1 monstro Dark do seu cemitério para banir'
                    : selectedCardToDestroy === null
                    ? 'Selecione 1 carta no campo para destruir'
                    : 'Confirme a destruição'}
                </p>
              </div>

              {selectedDarkMonsterToBanish === null ? (
                // Primeira etapa: Selecionar monstro Dark do cemitério
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Monstros Dark no Cemitério:</h3>
                  {darkArmedDragonEffectData.darkMonsters.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {darkArmedDragonEffectData.darkMonsters.map((monster: any, index: number) => {
                        const isSelected = selectedDarkMonsterToBanish === index;
                        return (
                          <motion.div
                            key={index}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedDarkMonsterToBanish(index)}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all w-[120px] h-[175px] mx-auto ${
                              isSelected
                                ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                : 'border-purple-600/50 hover:border-purple-400'
                            }`}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-contain bg-black/20"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-lg">Não há monstros Dark no seu cemitério</p>
                    </div>
                  )}
                </div>
              ) : selectedCardToDestroy === null ? (
                // Segunda etapa: Selecionar carta no campo para destruir (só mostra seções que têm cartas)
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Selecione uma carta no campo para destruir:</h3>
                  <div className="space-y-6">
                    {/* Monstros do jogador - só mostra se tiver pelo menos 1 */}
                    {myMonsters.some((m: any) => m != null) && (
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Seus Monstros:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {myMonsters.map((monster: any, index: number) => {
                          if (!monster || monster === null) return null;
                          const isSelected = false; // This selection list is displayed only while selectedCardToDestroy is null.
                          return (
                            <motion.div
                              key={`player-monster-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'player', type: 'monster', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all w-[80px] h-[117px] ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full object-contain bg-black/20"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                    )}

                    {/* Spell/Trap do jogador - só mostra se tiver pelo menos 1 */}
                    {mySpellTraps.some((s: any) => s != null) && (
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Suas Magias/Armadilhas:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {mySpellTraps.map((spellTrap: any, index: number) => {
                          if (!spellTrap || spellTrap === null) return null;
                          const isSelected = false; // Selection step: no target is selected yet.
                          return (
                            <motion.div
                              key={`player-spelltrap-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'player', type: 'spellTrap', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all w-[80px] h-[117px] ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              <CardImage
                                card={spellTrap}
                                className="w-full h-full object-contain bg-black/20"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                    )}

                    {/* Monstros do oponente - só mostra se tiver pelo menos 1 */}
                    {opponentMonsters.some((m: any) => m != null) && (
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Monstros do Oponente:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {opponentMonsters.map((monster: any, index: number) => {
                          if (!monster || monster === null) return null;
                          const isSelected = false; // Selection step: no target is selected yet.
                          const isFaceDown = monster.position === 'set';
                          return (
                            <motion.div
                              key={`opponent-monster-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'opponent', type: 'monster', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all w-[80px] h-[117px] ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              {isFaceDown ? (
                                <div
                                  className="w-full h-full bg-cover bg-center bg-no-repeat"
                                  style={{
                                    backgroundImage: `url(${opponentSkinImageUrl})`,
                                  }}
                                />
                              ) : (
                                <CardImage
                                  card={monster}
                                  className="w-full h-full object-contain bg-black/20"
                                />
                              )}
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                    )}

                    {/* Spell/Trap do oponente - só mostra se tiver pelo menos 1 */}
                    {opponentSpellTraps.some((s: any) => s != null) && (
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Magias/Armadilhas do Oponente:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {opponentSpellTraps.map((spellTrap: any, index: number) => {
                          if (!spellTrap || spellTrap === null) return null;
                          const isSelected = false; // Selection step: no target is selected yet.
                          const isFaceDown = spellTrap.position === 'set';
                          return (
                            <motion.div
                              key={`opponent-spelltrap-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'opponent', type: 'spellTrap', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all w-[80px] h-[117px] ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              {isFaceDown ? (
                                <div
                                  className="w-full h-full bg-cover bg-center bg-no-repeat"
                                  style={{
                                    backgroundImage: `url(${opponentSkinImageUrl})`,
                                  }}
                                />
                              ) : (
                                <CardImage
                                  card={spellTrap}
                                  className="w-full h-full object-contain bg-black/20"
                                />
                              )}
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Botões */}
              <div className="flex justify-center gap-4 mt-6">
                <button
                  onClick={() => {
                    if (selectedDarkMonsterToBanish === null) {
                      // Fechar modal
                      setShowDarkArmedDragonEffectModal(false);
                      setDarkArmedDragonEffectData(null);
                      setSelectedDarkMonsterToBanish(null);
                      setSelectedCardToDestroy(null);
                    } else if (selectedCardToDestroy === null) {
                      // Voltar para seleção de monstro Dark
                      setSelectedDarkMonsterToBanish(null);
                    } else {
                      // Voltar para seleção de carta
                      setSelectedCardToDestroy(null);
                    }
                  }}
                  className="px-8 py-3 bg-gray-700/80 hover:bg-gray-600/80 backdrop-blur-sm text-white rounded-lg font-bold transition-colors"
                >
                  {selectedDarkMonsterToBanish === null ? 'Cancelar' : selectedCardToDestroy === null ? 'Voltar' : 'Voltar'}
                </button>
                {selectedDarkMonsterToBanish !== null && (
                  <button
                    onClick={() => {
                      if (selectedCardToDestroy === null) {
                        // Avançar para seleção de carta
                        // Não fazer nada, apenas deixar o usuário selecionar
                      } else if (duelId && user?.id && darkArmedDragonEffectData) {
                        // Confirmar efeito
                        const darkMonster = darkArmedDragonEffectData.darkMonsters[selectedDarkMonsterToBanish];
                        // Usar o graveyardIndex do monstro (calculado no backend) ou encontrar no cemitério atual
                        let graveyardIndex = darkMonster?.graveyardIndex;
                        if (graveyardIndex === undefined || graveyardIndex === null) {
                          // Se não tiver graveyardIndex, encontrar no cemitério atual
                          const monsterId = darkMonster?.idCarta || darkMonster?.id || darkMonster?.cardId;
                          const monsterInstanceId = darkMonster?.instanceId;
                          graveyardIndex = myGraveyard.findIndex((c: any) => {
                            if (monsterInstanceId && c.instanceId) {
                              return c.instanceId === monsterInstanceId;
                            }
                            const cId = c.idCarta || c.id || c.cardId;
                            return cId === monsterId || String(cId) === String(monsterId);
                          });
                        }
                        
                        if (graveyardIndex === -1) {
                          alert('Monstro não encontrado no cemitério');
                          return;
                        }
                        
                        performAction(duelId, user.id, 'DARK_ARMED_DRAGON_EFFECT_CHOICE', {
                          monsterZoneIndex: darkArmedDragonEffectData.monsterZoneIndex,
                          darkGraveyardIndex: graveyardIndex,
                          targetPlayer: selectedCardToDestroy.player,
                          targetType: selectedCardToDestroy.type,
                          targetZoneIndex: selectedCardToDestroy.zoneIndex,
                        });
                        
                        // Resetar estados
                        setShowDarkArmedDragonEffectModal(false);
                        setDarkArmedDragonEffectData(null);
                        setSelectedDarkMonsterToBanish(null);
                        setSelectedCardToDestroy(null);
                      }
                    }}
                    disabled={selectedCardToDestroy === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm backdrop-blur-sm ${
                      selectedCardToDestroy !== null
                        ? 'bg-purple-600/90 hover:bg-purple-700/90 text-white'
                        : 'bg-gray-600/80 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedCardToDestroy === null
                      ? 'Continuar'
                      : '💀 Banir e Destruir'}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Informações da Carta */}
      <AnimatePresence>
        {selectedCardInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={() => setSelectedCardInfo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                    📋 Informações da Carta
                  </h2>
                  <button
                    onClick={() => setSelectedCardInfo(null)}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Imagem da Carta - Tamanho Correto */}
                  <div className="flex justify-center lg:justify-start flex-shrink-0">
                    <div className="w-[280px] h-[400px] rounded-xl shadow-2xl border-2 border-yellow-500/30 overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
                      <CardImage
                        card={selectedCardInfo}
                        className="w-full h-full"
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                        fallback="/images/fundoCarta.webp"
                      />
                    </div>
                  </div>

                  {/* Informações da Carta */}
                  <div className="flex-1 space-y-4 overflow-y-auto max-h-[500px] pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent' }}>
                    <div>
                      <h3 className="text-3xl font-bold text-yellow-400 mb-2">
                        {selectedCardInfo.name || 'Nome não disponível'}
                      </h3>
                      {selectedCardInfo.clanTag && (
                        <p className="text-lg text-purple-400 mb-2">
                          |{selectedCardInfo.clanTag}|
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Tipo da Carta */}
                      <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                        <span className="text-gray-400 font-semibold">Tipo: </span>
                        <span className="text-white font-bold text-lg">
                          {selectedCardInfo.type || selectedCardInfo.cardType || 'Desconhecido'}
                        </span>
                      </div>

                      {/* ATK e DEF (se for monstro) */}
                      {(selectedCardInfo.type === 'Monster' || selectedCardInfo.cardType === 'Monster') && (
                        <div className="grid grid-cols-2 gap-3">
                          {selectedCardInfo.atk !== undefined && (
                            <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 p-3 rounded-lg border-2 border-red-500/50">
                              <span className="text-red-300 text-sm font-semibold block">⚔️ ATK</span>
                              <span className="text-red-400 font-bold text-2xl">{selectedCardInfo.atk || 0}</span>
                            </div>
                          )}
                          {selectedCardInfo.def !== undefined && (
                            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 p-3 rounded-lg border-2 border-blue-500/50">
                              <span className="text-blue-300 text-sm font-semibold block">🛡️ DEF</span>
                              <span className="text-blue-400 font-bold text-2xl">{selectedCardInfo.def || 0}</span>
                            </div>
                          )}
                          {selectedCardInfo.level !== undefined && (
                            <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 p-3 rounded-lg border-2 border-yellow-500/50">
                              <span className="text-yellow-300 text-sm font-semibold block">⭐ Nível</span>
                              <span className="text-yellow-400 font-bold text-2xl">{selectedCardInfo.level || 0}</span>
                            </div>
                          )}
                          {selectedCardInfo.attribute && (
                            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 p-3 rounded-lg border-2 border-purple-500/50">
                              <span className="text-purple-300 text-sm font-semibold block">🌟 Atributo</span>
                              <span className="text-white font-bold text-lg">{selectedCardInfo.attribute}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Descrição/Efeito da Carta */}
                      <div className="mt-4">
                        <span className="text-yellow-400 font-bold text-lg block mb-2">
                          📜 {selectedCardInfo.type === 'Monster' || selectedCardInfo.cardType === 'Monster' ? 'Efeito' : 'Descrição'}:
                        </span>
                        <p className="text-gray-200 bg-gradient-to-br from-gray-800/80 to-gray-900/80 p-4 rounded-lg border-2 border-yellow-500/30 leading-relaxed text-sm whitespace-pre-wrap">
                          {getCardDescription(selectedCardInfo)}
                        </p>
                      </div>

                      {/* ID da Carta */}
                      <div className="mt-6 pt-4 border-t border-gray-700">
                        <span className="text-gray-500 text-xs font-semibold">CARD ID: </span>
                        <span className="text-gray-400 text-xs font-mono">
                          {selectedCardInfo.idCarta || selectedCardInfo.id || selectedCardInfo.cardId || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Seleção de Tributos */}
      <TributeSelectionModal
        isOpen={showTributeModal}
        onClose={() => {
          setShowTributeModal(false);
          setTributeModalData(null);
        }}
        onConfirm={async (selectedTributes) => {
          if (!tributeModalData || !duelId || !user?.id) return;
          const isSliferConfirm = /slifer\s*the\s*sky\s*dragon/i.test((tributeModalData.card?.name || tributeModalData.card?.cardName || ''));
          if (isSliferConfirm) {
            if (sliferAnimationTimeoutRef.current) clearTimeout(sliferAnimationTimeoutRef.current);
            setShowSliferAnimation(true);
            sliferAnimationTimeoutRef.current = setTimeout(() => {
              setShowSliferAnimation(false);
              sliferAnimationTimeoutRef.current = null;
            }, 4500);
          }
          const requiredTributes = tributeModalData?.requiredTributes || 0;
          // Com tributo: o backend exige que zoneIndex seja uma das zonas liberadas pelo tributo
          let zoneIndex: number;
          if (requiredTributes > 0 && selectedTributes.length > 0) {
            zoneIndex = selectedTributes[0];
          } else {
            zoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
            if (zoneIndex === -1) zoneIndex = 0;
          }
          
          setNormalSummonUsed(true);
          await triggerCardPlacementAnimation(
            tributeModalData.card,
            zoneIndex,
            true,
            tributeModalData.handIndex,
          );
          
          performAction(duelId, user.id, 'SUMMON_MONSTER', {
            cardId: tributeModalData.card.id || tributeModalData.card.cardId || tributeModalData.card.idCarta,
            cardName: tributeModalData.card.name,
            zoneIndex,
            position: tributeModalData.position,
            tributeZoneIndices: selectedTributes,
          });
          
          setZoomedCard(null);
          setShowTributeModal(false);
          setTributeModalData(null);
        }}
        monsters={myMonsters}
        requiredTributes={tributeModalData?.requiredTributes || 0}
        summoningCard={tributeModalData?.card || null}
        position={tributeModalData?.position || 'attack'}
      />

      {/* Modal de Invocação Especial do Red-Eyes Darkness Metal Dragon */}
      <AnimatePresence>
        {showRedEyesDarknessMetalDragonModal && redEyesDarknessMetalDragonData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={() => {
              // Não fechar ao clicar fora - precisa escolher o dragão
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="duel-modal-panel rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-red-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                      Red-Eyes Darkness Metal Dragon - Invocação Especial
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro do Tipo Dragão face-up que você controla para banir
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowRedEyesDarknessMetalDragonModal(false);
                      setRedEyesDarknessMetalDragonData(null);
                      setSelectedDragonToBanish(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-2xl font-bold transition-colors hover:scale-110 transform px-2"
                  >
                    X
                  </button>
                </div>

                {/* Monstros Dragão disponíveis */}
                {redEyesDarknessMetalDragonData.dragonMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-red-400 mb-4">Monstros Dragão no Campo</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {redEyesDarknessMetalDragonData.dragonMonsters.map((monster: any, index: number) => {
                        const isSelected = selectedDragonToBanish === index;
                        return (
                          <motion.div
                            key={`dragon-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDragonToBanish(index);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-red-400 ring-4 ring-red-400/50 shadow-lg shadow-red-500/50'
                                : 'border-gray-600 hover:border-red-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                OK
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros do Tipo Dragão face-up no campo</p>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowRedEyesDarknessMetalDragonModal(false);
                      setRedEyesDarknessMetalDragonData(null);
                      setSelectedDragonToBanish(null);
                    }}
                    className="px-6 py-3 bg-gray-700/80 hover:bg-gray-600/80 text-white rounded-lg font-bold transition-colors backdrop-blur-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedDragonToBanish === null || !redEyesDarknessMetalDragonData || !duelId || !user?.id) return;
                      
                      const selectedDragon = redEyesDarknessMetalDragonData.dragonMonsters[selectedDragonToBanish];
                      if (!selectedDragon) return;
                      
                      const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                      if (emptyZoneIndex === -1) {
                        alert('Todas as zonas de monstro estão ocupadas!');
                        return;
                      }
                      
                      setShowRedEyesDarknessMetalDragonModal(false);
                      const position = 'attack';
                      performAction(duelId, user.id, 'RED_EYES_DARKNESS_METAL_DRAGON_SUMMON_CHOICE', {
                        cardId: redEyesDarknessMetalDragonData.cardId,
                        dragonZoneIndex: selectedDragon.zoneIndex,
                        zoneIndex: emptyZoneIndex,
                        position,
                      });
                      setRedEyesDarknessMetalDragonData(null);
                      setSelectedDragonToBanish(null);
                    }}
                    disabled={selectedDragonToBanish === null}
                    className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                      selectedDragonToBanish !== null
                        ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedDragonToBanish !== null ? 'Confirmar Invocação' : 'Selecione um Dragão'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Efeito do Red-Eyes Darkness Metal Dragon */}
      <AnimatePresence>
        {showRedEyesDarknessMetalDragonEffectModal && redEyesDarknessMetalDragonEffectData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={() => {
              // Não fechar ao clicar fora - precisa escolher o dragão
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="duel-modal-panel rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-red-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                      Red-Eyes Darkness Metal Dragon - Efeito
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Uma vez por turno: invoque por invocação especial 1 monstro do Tipo Dragão da sua mão ou Cemitério (exceto Red-Eyes Darkness Metal Dragon)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowRedEyesDarknessMetalDragonEffectModal(false);
                      setRedEyesDarknessMetalDragonEffectData(null);
                      setSelectedDragonSource(null);
                      setSelectedDragonIndex(null);
                      setSelectedDragonId(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-2xl font-bold transition-colors hover:scale-110 transform px-2"
                  >
                    X
                  </button>
                </div>

                {/* Dragões na mão */}
                {redEyesDarknessMetalDragonEffectData.dragonsInHand.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-blue-400 mb-4">Dragões na Mão ({redEyesDarknessMetalDragonEffectData.dragonsInHand.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {redEyesDarknessMetalDragonEffectData.dragonsInHand.map((dragon: any, index: number) => {
                        const dragonId = `hand-${index}`;
                        const isSelected = selectedDragonId === dragonId;
                        return (
                          <motion.div
                            key={`hand-dragon-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDragonId(dragonId);
                              setSelectedDragonSource('hand');
                              setSelectedDragonIndex(index);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-blue-400 ring-4 ring-blue-400/50 shadow-lg shadow-blue-500/50'
                                : 'border-gray-600 hover:border-blue-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={dragon}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                OK
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 bg-blue-600/80 text-white text-xs font-bold px-2 py-1 rounded">
                              Mão
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dragões no cemitério */}
                {redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">Dragões no Cemitério ({redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.map((dragon: any, index: number) => {
                        const dragonId = `graveyard-${index}`;
                        const isSelected = selectedDragonId === dragonId;
                        return (
                          <motion.div
                            key={`gy-dragon-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDragonId(dragonId);
                              setSelectedDragonSource('graveyard');
                              setSelectedDragonIndex(index);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={dragon}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                OK
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 bg-purple-600/80 text-white text-xs font-bold px-2 py-1 rounded">
                              Cemitério
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mensagem se não houver dragões */}
                {redEyesDarknessMetalDragonEffectData.dragonsInHand.length === 0 && redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros do Tipo Dragão na sua mão ou cemitério (exceto Red-Eyes Darkness Metal Dragon)</p>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowRedEyesDarknessMetalDragonEffectModal(false);
                      setRedEyesDarknessMetalDragonEffectData(null);
                      setSelectedDragonSource(null);
                      setSelectedDragonIndex(null);
                      setSelectedDragonId(null);
                    }}
                    className="px-6 py-3 bg-gray-700/80 hover:bg-gray-600/80 text-white rounded-lg font-bold transition-colors backdrop-blur-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedDragonSource === null || selectedDragonIndex === null || !redEyesDarknessMetalDragonEffectData || !duelId || !user?.id) return;
                      
                      const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                      if (emptyZoneIndex === -1) {
                        alert('Todas as zonas de monstro estão ocupadas!');
                        return;
                      }
                      
                      performAction(duelId, user.id, 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT_CHOICE', {
                        monsterZoneIndex: redEyesDarknessMetalDragonEffectData.monsterZoneIndex,
                        source: selectedDragonSource,
                        cardIndex: selectedDragonSource === 'hand' 
                          ? redEyesDarknessMetalDragonEffectData.dragonsInHand[selectedDragonIndex]?.handIndex
                          : redEyesDarknessMetalDragonEffectData.dragonsInGraveyard[selectedDragonIndex]?.graveyardIndex,
                        zoneIndex: emptyZoneIndex,
                        position: 'attack',
                      });
                      
                      setShowRedEyesDarknessMetalDragonEffectModal(false);
                      setRedEyesDarknessMetalDragonEffectData(null);
                      setSelectedDragonSource(null);
                      setSelectedDragonIndex(null);
                      setSelectedDragonId(null);
                    }}
                    disabled={selectedDragonSource === null || selectedDragonIndex === null}
                    className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                      selectedDragonSource !== null && selectedDragonIndex !== null
                        ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedDragonSource !== null && selectedDragonIndex !== null ? 'Confirmar Invocação (Ataque)' : 'Selecione um Dragão'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Cyber-Stein */}
      <AnimatePresence>
        {showCyberSteinModal && cyberSteinData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="duel-modal-panel rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-cyan-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                      Cyber-Stein - Efeito
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Pague 5000 LP; invoque por invocação especial 1 monstro do seu Extra Deck em modo de ataque
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowCyberSteinModal(false);
                      setCyberSteinData(null);
                      setSelectedCyberSteinMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Monstros do Extra Deck */}
                {cyberSteinData.extraDeckMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-cyan-400 mb-4">Monstros do Extra Deck</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {cyberSteinData.extraDeckMonsters.map((monster: any, index: number) => {
                        const extraDeckIndex = monster.extraDeckIndex !== undefined ? monster.extraDeckIndex : index;
                        const isSelected = selectedCyberSteinMonster === extraDeckIndex;
                        return (
                          <motion.div
                            key={`extra-deck-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedCyberSteinMonster(extraDeckIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-cyan-400 ring-4 ring-cyan-400/50 shadow-lg shadow-cyan-500/50'
                                : 'border-gray-600 hover:border-cyan-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-cyan-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros no seu Extra Deck para invocar</p>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowCyberSteinModal(false);
                      setCyberSteinData(null);
                      setSelectedCyberSteinMonster(null);
                    }}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedCyberSteinMonster !== null && cyberSteinData && duelId && user?.id) {
                        const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                        if (emptyZoneIndex === -1) {
                          alert('Todas as zonas de monstro estão ocupadas!');
                          return;
                        }
                        
                        performAction(duelId, user.id, 'CYBER_STEIN_EFFECT_CHOICE', {
                          monsterZoneIndex: cyberSteinData.monsterZoneIndex,
                          extraDeckIndex: selectedCyberSteinMonster,
                        });
                        
                        setShowCyberSteinModal(false);
                        setCyberSteinData(null);
                        setSelectedCyberSteinMonster(null);
                      }
                    }}
                    disabled={selectedCyberSteinMonster === null}
                    className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                      selectedCyberSteinMonster !== null
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedCyberSteinMonster !== null ? 'Confirmar (Pagar 5000 LP)' : 'Selecione um Monstro'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal do Reinforcement Of The Army */}
      <AnimatePresence>
        {showReinforcementOfTheArmyModal && reinforcementOfTheArmyData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 duel-modal-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowReinforcementOfTheArmyModal(false);
                setReinforcementOfTheArmyData(null);
                setSelectedReinforcementOfTheArmyMonster(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="duel-modal-panel border-2 border-yellow-400/50 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Reinforcement Of The Army
                </h2>
                <p className="text-yellow-200 text-sm">
                  Selecione 1 monstro Warrior de Level 4 ou menos do seu deck para adicionar à sua mão
                </p>
              </div>

              {reinforcementOfTheArmyData.warriorMonsters.length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Monstros Warrior de Level 4 ou menos no Deck:</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {reinforcementOfTheArmyData.warriorMonsters.map((monster: any, index: number) => {
                      const isSelected = selectedReinforcementOfTheArmyMonster === monster.deckIndex;
                      return (
                        <motion.div
                          key={index}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedReinforcementOfTheArmyMonster(monster.deckIndex)}
                          className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-yellow-400 shadow-lg shadow-yellow-500/50'
                              : 'border-yellow-600/50 hover:border-yellow-400'
                          }`}
                          style={{ width: '120px', height: '175px' }}
                        >
                          <CardImage
                            card={monster}
                            className="w-full h-full object-cover"
                            fallback="/images/fundoCarta.webp"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                              <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                Selecionado
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                            <p className="text-white text-xs font-semibold bg-black/55 backdrop-blur-sm px-2 py-1 rounded truncate">
                              {monster.name || monster.cardName || 'Monstro'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">Não há monstros Warrior de Level 4 ou menos no seu deck</p>
                  <button
                    onClick={() => {
                      setShowReinforcementOfTheArmyModal(false);
                      setReinforcementOfTheArmyData(null);
                      setSelectedReinforcementOfTheArmyMonster(null);
                    }}
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Botões */}
              {reinforcementOfTheArmyData.warriorMonsters.length > 0 ? (
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowReinforcementOfTheArmyModal(false);
                      setReinforcementOfTheArmyData(null);
                      setSelectedReinforcementOfTheArmyMonster(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedReinforcementOfTheArmyMonster !== null && duelId && user?.id) {
                        console.log('✨ [ReinforcementOfTheArmy] Enviando escolha:', selectedReinforcementOfTheArmyMonster);
                        performAction(duelId, user.id, 'REINFORCEMENT_OF_THE_ARMY_CHOICE', {
                          deckIndex: selectedReinforcementOfTheArmyMonster,
                        });
                        
                        // Resetar estados
                        setShowReinforcementOfTheArmyModal(false);
                        setReinforcementOfTheArmyData(null);
                        setSelectedReinforcementOfTheArmyMonster(null);
                      }
                    }}
                    disabled={selectedReinforcementOfTheArmyMonster === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                      selectedReinforcementOfTheArmyMonster !== null
                        ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedReinforcementOfTheArmyMonster !== null 
                      ? '⚔️ Adicionar à Mão' 
                      : 'Selecione um monstro'}
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
        
        {/* Modal Last Will */}
        {showLastWillModal && lastWillData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 duel-modal-scrim z-[10000] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowLastWillModal(false);
                setLastWillData(null);
                setSelectedLastWillMonster(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="duel-modal-panel border-2 border-purple-500/50 rounded-xl shadow-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4 text-center">
                Last Will - Selecione um Monstro com ATK ≤ 1500
              </h2>
              <p className="text-gray-300 text-center mb-6">
                Escolha um monstro do seu deck com ATK de 1500 ou menos para invocar por invocação especial no primeiro slot disponível
              </p>

              {/* Lista de Monstros */}
              {lastWillData.eligibleMonsters.length > 0 ? (
                <div>
                  <h3 className="text-lg font-bold text-white mb-3 text-center">Monstros Disponíveis:</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-96 overflow-y-auto">
                    {lastWillData.eligibleMonsters.map((monster: any, index: number) => {
                      const isSelected = selectedLastWillMonster === monster.deckIndex;
                      return (
                        <motion.div
                          key={monster.deckIndex || index}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setSelectedLastWillMonster(monster.deckIndex);
                          }}
                          className={`cursor-pointer rounded-lg border-2 p-2 transition-all ${
                            isSelected
                              ? 'border-yellow-500 bg-yellow-500/20 shadow-lg shadow-yellow-500/50'
                              : 'border-gray-600 bg-gray-800/50 hover:border-gray-400'
                          }`}
                        >
                          <CardImage
                            card={monster}
                            className="w-full aspect-[2/3] object-cover rounded"
                          />
                          <div className="mt-2 text-center">
                            <p className="text-white text-xs font-bold truncate">
                              {monster.name || monster.cardName}
                            </p>
                            <p className="text-yellow-400 text-xs">
                              ATK: {monster.atk || monster.cardAtk || 0}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">Não há monstros com ATK ≤ 1500 no seu deck</p>
                  <button
                    onClick={() => {
                      setShowLastWillModal(false);
                      setLastWillData(null);
                      setSelectedLastWillMonster(null);
                    }}
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Botões */}
              {lastWillData.eligibleMonsters.length > 0 ? (
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowLastWillModal(false);
                      setLastWillData(null);
                      setSelectedLastWillMonster(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedLastWillMonster !== null && duelId && user?.id) {
                        // Encontrar o primeiro slot vazio automaticamente
                        const firstEmptyZone = myMonsters.findIndex((monster: any) => monster === null || monster === undefined);
                        
                        if (firstEmptyZone === -1) {
                          alert('Não há slots disponíveis para invocar o monstro');
                          return;
                        }
                        
                        console.log('✨ [LastWill] Enviando escolha:', { deckIndex: selectedLastWillMonster, zoneIndex: firstEmptyZone });
                        performAction(duelId, user.id, 'LAST_WILL_CHOICE', {
                          deckIndex: selectedLastWillMonster,
                          zoneIndex: firstEmptyZone,
                        });
                        
                        // Resetar estados
                        setShowLastWillModal(false);
                        setLastWillData(null);
                        setSelectedLastWillMonster(null);
                      }
                    }}
                    disabled={selectedLastWillMonster === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                      selectedLastWillMonster !== null
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedLastWillMonster !== null
                      ? '✨ Invocar por Invocação Especial' 
                      : 'Selecione um monstro'}
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>

      {duelEndedData && user ? <DuelEndedOverlay duelEndedData={duelEndedData} user={user} /> : null}
    </div>
  );
};

export default DuelArena;
