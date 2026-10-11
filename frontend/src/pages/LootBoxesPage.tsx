import { useEffect, useState } from 'react';
import api from '../api/axios';
type Box = {id:string;name:string;description:string|null;cardsPerOpening:number;priceCredits:number;priceCash:number;chances:Record<string,number>;possibleCards:number};
type Reward = {cardId:string;name:string;rarity:string;quantity:number};
export default function LootBoxesPage() {
  const [boxes,setBoxes]=useState<Box[]>([]);
  const [results,setResults]=useState<Reward[]|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState('');
  const [message,setMessage]=useState('');
  const load=async()=>{try{const r=await api.get<Box[]>('/loot-boxes');setBoxes(r.data);}catch{setError('Não foi possível carregar as loot boxes');}};
  useEffect(()=>{void load();},[]);
  const open=async (box:Box,method:'credits'|'cash')=>{
    if(!confirm('Abrir '+box.name+' por '+(method==='credits'?box.priceCredits+' créditos':box.priceCash+' cash')+'?'))return;
    setLoading(box.id);setError('');setResults(null);setMessage('');
    try{const r=await api.post('/loot-boxes/'+box.id+'/open',{paymentMethod:method});setResults(r.data.rewards);setMessage('Abertura concluída! Cartas adicionadas à sua coleção.');}
    catch(e:any){setError(e.response?.data?.message||'Erro ao abrir loot box');}
    finally{setLoading('');}
  };
  return <div className="mx-auto max-w-5xl p-5 text-white">
    <h1 className="text-3xl font-bold mb-3">Loot Boxes 🎁</h1>
    <p className="text-slate-300 mb-6">Confira os percentuais antes de abrir. Cada sorteio escolhe uma raridade conforme a tabela exibida e depois uma carta elegível daquela raridade.</p>
    {error&&<div role="alert" className="bg-red-900 p-3 rounded mb-4">{error}</div>}
    {message&&<div role="status" className="bg-green-900 p-3 rounded mb-4">{message}</div>}
    {results&&<section className="mb-6 rounded-xl bg-slate-900 p-5"><h2 className="text-xl font-semibold mb-3">Cartas recebidas</h2><ul className="space-y-2">{results.map(r=><li key={r.cardId}>{r.quantity}x {r.name} — {r.rarity}</li>)}</ul></section>}
    <div className="grid md:grid-cols-2 gap-4">{boxes.map(b=><div key={b.id} className="rounded-xl bg-slate-900 p-5">
      <h2 className="text-xl font-bold">{b.name}</h2><p className="text-slate-400 my-2">{b.description}</p>
      <p>{b.cardsPerOpening} sorteios por abertura · {b.possibleCards} cartas possíveis</p>
      <h3 className="font-semibold mt-4 mb-2">Chances de raridade por sorteio</h3><div className="space-y-1 mb-4">{Object.entries(b.chances).map(([r,p])=><div key={r} className="flex justify-between border-b border-slate-700"><span>{r}</span><span>{Number(p).toFixed(2)}%</span></div>)}</div>
      <div className="flex gap-2 flex-wrap"><button disabled={!!loading||b.priceCredits<=0} className="bg-indigo-600 px-4 py-2 rounded disabled:opacity-40" onClick={()=>void open(b,'credits')}>Abrir por {b.priceCredits} créditos</button><button disabled={!!loading||b.priceCash<=0} className="bg-purple-700 px-4 py-2 rounded disabled:opacity-40" onClick={()=>void open(b,'cash')}>Abrir por {b.priceCash} cash</button></div>
    </div>)}</div>
    {boxes.length===0&&<p>Nenhuma loot box disponível no momento.</p>}
  </div>;
}