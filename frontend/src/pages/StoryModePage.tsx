import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

type Point = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';
type StoryState = { x: number; y: number; metGuide: boolean; visited: string[] };
const WIDTH = 22;
const HEIGHT = 15;
const TILE = 32;
const START: StoryState = { x: 10, y: 12, metGuide: false, visited: [] };
const NPCS = [
  { id: 'guide', x: 10, y: 6, name: 'Professor', color: '#fcd34d', lines: ['Bem-vindo à Academia de Duelos!', 'Explore o campus. Em breve, você terá missões e duelos com outros estudantes.'] },
  { id: 'rival', x: 17, y: 10, name: 'Duelista rival', color: '#f87171', lines: ['Estou treinando para o próximo torneio.', 'Depois poderemos duelar! Prepare seu deck.'] },
];
const BUILDINGS = [
  { id: 'class', x: 2, y: 1, w: 6, h: 4, name: 'Sala de aula', color: '#7c3aed', text: 'Aulas e missões chegarão aqui.' },
  { id: 'arena', x: 14, y: 1, w: 6, h: 4, name: 'Arena', color: '#dc2626', text: 'Local dos futuros duelos da história.' },
  { id: 'dorm', x: 2, y: 9, w: 5, h: 4, name: 'Dormitório', color: '#2563eb', text: 'Seu quarto na academia.' },
  { id: 'shop', x: 16, y: 6, w: 5, h: 3, name: 'Loja', color: '#047857', text: 'Um dia será possível comprar itens aqui.' },
];
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
const delta: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const inside = (p: Point, b: { x: number; y: number; w: number; h: number }) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
const blocked = (p: Point) => p.x < 0 || p.y < 0 || p.x >= WIDTH || p.y >= HEIGHT ||
  BUILDINGS.some(b => inside(p, b)) || NPCS.some(n => n.x === p.x && n.y === p.y);
function loadState(userId: number | string): StoryState {
  try {
    const raw = window.localStorage.getItem('yugioh-story-v1-' + userId);
    if (!raw) return START;
    const data = JSON.parse(raw) as StoryState;
    if (Number.isInteger(data.x) && Number.isInteger(data.y) && !blocked(data) &&
        typeof data.metGuide === 'boolean' && Array.isArray(data.visited)) return data;
  } catch { /* invalid local save */ }
  return START;
}

export default function StoryModePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId = user?.id || 'guest';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const held = useRef<Direction | null>(null);
  const lastMove = useRef(0);
  const [state, setState] = useState<StoryState>(() => loadState(userId));
  const [facing, setFacing] = useState<Direction>('down');
  const [dialog, setDialog] = useState<{ title: string; lines: string[] } | null>(null);
  const [hint, setHint] = useState('Use WASD ou setas para andar. Espaço / E para interagir.');

  useEffect(() => { setState(loadState(userId)); }, [userId]);
  useEffect(() => { window.localStorage.setItem('yugioh-story-v1-' + userId, JSON.stringify(state)); }, [state, userId]);

  const move = useCallback((direction: Direction) => {
    setFacing(direction);
    if (dialog) return;
    setState(previous => {
      const point = { x: previous.x + delta[direction].x, y: previous.y + delta[direction].y };
      return blocked(point) ? previous : { ...previous, ...point };
    });
  }, [dialog]);

  const interact = useCallback(() => {
    if (dialog) { setDialog(null); return; }
    const nearby = [ {x: state.x, y: state.y}, ...Object.values(delta).map(d => ({x: state.x + d.x,y:state.y + d.y})) ];
    const npc = NPCS.find(n => nearby.some(p => p.x === n.x && p.y === n.y));
    if (npc) {
      setDialog({ title: npc.name, lines: npc.lines });
      if (npc.id === 'guide') setState(prev => ({...prev, metGuide: true}));
      return;
    }
    const building = BUILDINGS.find(b => nearby.some(p => inside(p, { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 })));
    if (building) {
      setDialog({ title: building.name, lines: [building.text] });
      setState(prev => ({ ...prev, visited: prev.visited.includes(building.id) ? prev.visited : [...prev.visited, building.id] }));
      return;
    }
    setHint('Chegue perto de um personagem ou prédio e pressione E.');
  }, [dialog, state.x, state.y]);
  const actionRef = useRef({ move, interact });
  useEffect(() => { actionRef.current = { move, interact }; }, [move, interact]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const direction = KEY_TO_DIRECTION[e.key] || KEY_TO_DIRECTION[e.key.toLowerCase()];
      if (direction) {
        e.preventDefault();
        if (held.current !== direction) actionRef.current.move(direction);
        held.current = direction;
      }
      if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) actionRef.current.interact();
      }
    };
    const up = (e: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[e.key] || KEY_TO_DIRECTION[e.key.toLowerCase()];
      if (direction && held.current === direction) held.current = null;
    };
    const blur = () => { held.current = null; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    let id = 0;
    const run = (t: number) => {
      if (held.current && t - lastMove.current > 115) {
        lastMove.current = t;
        actionRef.current.move(held.current);
      }
      id = requestAnimationFrame(run);
    };
    id = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#28784d' : '#2f8453';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (x === 10 || x === 11 || y === 7 || y === 8) {
        ctx.fillStyle = (x+y)%2 ? '#d5c39c' : '#c8b78e';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      if ((x * 7 + y * 11) % 19 === 0 && x !== 10 && x !== 11 && y !== 7 && y !== 8) {
        ctx.fillStyle = '#92bf63';
        ctx.fillRect(x*TILE + 15, y*TILE + 16, 4, 5);
      }
    }
    for (const b of BUILDINGS) {
      const bx = b.x*TILE, by = b.y*TILE, bw = b.w*TILE, bh = b.h*TILE;
      ctx.fillStyle = '#18352f'; ctx.fillRect(bx+4, by+8, bw, bh);
      ctx.fillStyle = b.color; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#1e293b'; ctx.fillRect(bx+7, by+7, bw-14, bh-21);
      ctx.fillStyle = '#dbeafe'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.name, bx+bw/2, by+25, bw-10);
      ctx.fillStyle = '#bfdbfe';ctx.fillRect(bx + bw/2 - 11, by+bh-23, 22, 23);
      ctx.fillStyle = '#fef08a';ctx.fillRect(bx + bw/2 + 5, by+bh-14, 3, 3);
    }
    const drawPerson = (p: Point, jacket: string, skin: string, hair: string) => {
      const px=p.x*TILE,py=p.y*TILE;
      ctx.fillStyle='#152e28';ctx.fillRect(px+9,py+27,18,4);
      ctx.fillStyle='#111827';ctx.fillRect(px+11,py+22,5,7);ctx.fillRect(px+19,py+22,5,7);
      ctx.fillStyle=jacket;ctx.fillRect(px+9,py+12,17,12);
      ctx.fillStyle=skin;ctx.fillRect(px+12,py+4,12,10);
      ctx.fillStyle=hair;ctx.fillRect(px+11,py+2,14,5);
      ctx.fillStyle='#111827';ctx.fillRect(px+15,py+9,2,2);ctx.fillRect(px+21,py+9,2,2);
      ctx.fillStyle='#ffffff';ctx.fillRect(px+18,py+16,3,6);
    };
    for (const npc of NPCS) {
      drawPerson(npc,npc.color,'#f4c49c','#4c1d95');
      ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';
      ctx.fillText(npc.name,npc.x*TILE+16,npc.y*TILE-4);
    }
    drawPerson(state,'#2563eb','#f5c9a8','#1f2937');
    ctx.fillStyle='#fde68a';
    if(facing==='down') ctx.fillRect(state.x*TILE+14,state.y*TILE+30,5,2);
    if(facing==='up') ctx.fillRect(state.x*TILE+14,state.y*TILE,5,2);
    if(facing==='left') ctx.fillRect(state.x*TILE,state.y*TILE+14,3,5);
    if(facing==='right') ctx.fillRect(state.x*TILE+29,state.y*TILE+14,3,5);
  }, [state, facing]);

  const reset = () => {
    if (!window.confirm('Recomeçar exploração? Seu progresso neste mapa será apagado.')) return;
    setState(START);setDialog(null);
  };
  const movement = (dir: Direction) => {
    move(dir);
    held.current = dir;
    window.setTimeout(() => { if (held.current === dir) held.current = null; }, 140);
  };
  return <main className="mx-auto max-w-5xl px-3 py-6 text-white">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Academia de Duelos</h1><p className="text-slate-300">Modo História · Capítulo 1 — Primeiro dia</p></div>
      <div className="flex gap-2"><button onClick={reset} className="rounded bg-slate-700 px-3 py-2">Recomeçar</button><button onClick={()=>navigate('/home')} className="rounded bg-indigo-700 px-3 py-2">Sair</button></div>
    </div>
    <div className="rounded-xl border border-emerald-700 bg-slate-900 p-2 shadow-xl">
      <div className="relative mx-auto w-full overflow-hidden rounded-lg" style={{maxWidth: WIDTH*TILE}}>
        <canvas ref={canvasRef} width={WIDTH*TILE} height={HEIGHT*TILE} aria-label="Mapa da Academia de Duelos com personagem controlável" className="block w-full" style={{imageRendering:'pixelated'}}/>
        {dialog && <div className="absolute bottom-2 left-2 right-2 rounded-xl border border-indigo-400 bg-slate-950/95 p-3 shadow-2xl">
          <strong className="text-yellow-300">{dialog.title}</strong>
          {dialog.lines.map((line,i)=><p key={i} className="text-sm sm:text-base mt-1">{line}</p>)}
          <button onClick={interact} className="mt-2 rounded bg-indigo-600 px-4 py-1.5">Continuar</button>
        </div>}
      </div>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <section className="rounded-xl bg-slate-900 p-4">
        <h2 className="font-bold mb-2">Objetivos</h2>
        <p className={state.metGuide?'text-green-300':'text-yellow-200'}>{state.metGuide?'✓':'○'} Conversar com o professor no centro</p>
        <p className="mt-2 text-slate-300">Locais conhecidos: {state.visited.length}/{BUILDINGS.length}</p>
        <p className="mt-2 text-sm text-slate-400">{hint}</p>
        <p className="mt-2 text-xs text-slate-500">Progresso salvo neste navegador para sua conta.</p>
      </section>
      <section className="rounded-xl bg-slate-900 p-4">
        <h2 className="font-bold mb-2">Controles</h2>
        <p className="mb-3 text-sm text-slate-300">Computador: WASD/setas · E/espaço para conversar. Celular: botões abaixo.</p>
        <div className="mx-auto grid w-40 grid-cols-3 gap-2 select-none">
          <div/><button aria-label="Cima" className="rounded bg-slate-700 p-3" onClick={()=>movement('up')}>↑</button><div/>
          <button aria-label="Esquerda" className="rounded bg-slate-700 p-3" onClick={()=>movement('left')}>←</button>
          <button className="rounded bg-indigo-600 p-3" onClick={interact}>E</button>
          <button aria-label="Direita" className="rounded bg-slate-700 p-3" onClick={()=>movement('right')}>→</button>
          <div/><button aria-label="Baixo" className="rounded bg-slate-700 p-3" onClick={()=>movement('down')}>↓</button><div/>
        </div>
      </section>
    </div>
  </main>;
}
