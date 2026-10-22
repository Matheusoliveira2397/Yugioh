import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CardForm {
  // Básico
  name: string;
  description: string;
  cardImage?: string;
  type: 'Monster' | 'Spell' | 'Trap';
  
  // Monstro
  monsterType?: 'Normal' | 'Effect' | 'Ritual' | 'Fusion' | 'Synchro' | 'Xyz' | 'Pendulum' | 'Link';
  attribute?: 'DARK' | 'LIGHT' | 'WATER' | 'FIRE' | 'EARTH' | 'WIND' | 'DIVINE';
  race?: 'Warrior' | 'Spellcaster' | 'Fairy' | 'Fiend' | 'Zombie' | 'Machine' | 'Aqua' | 'Pyro' | 'Rock' | 'Winged Beast' | 'Plant' | 'Insect' | 'Thunder' | 'Dragon' | 'Beast' | 'Beast-Warrior' | 'Dinosaur' | 'Fish' | 'Sea Serpent' | 'Reptile' | 'Psychic' | 'Divine-Beast' | 'Creator God' | 'Wyrm' | 'Cyberse';
  level?: number;
  rank?: number;
  atk?: number;
  def?: number;
  
  // Spell/Trap
  spellType?: 'Normal' | 'Continuous' | 'Equip' | 'Field' | 'Quick-Play' | 'Ritual';
  trapType?: 'Normal' | 'Continuous' | 'Counter';
  
  // Raridade
  rarity: 'Common' | 'Rare' | 'Super Rare' | 'Ultra Rare' | 'Secret Rare' | 'Legendary';
  
  // Preços
  priceCoins?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
  isActive: boolean;
  isLimited?: boolean;

  // Avançado
  archetype?: string;
  isBanned?: boolean;
  maxCopiesInDeck?: number;
}

interface EffectForm {
  cardName: string;
  effectType: 'continuous' | 'trigger' | 'ignition' | 'quick' | 'flip';
  action: string;
  target?: string;
  timing?: string[];
  condition?: string;
  params?: any;
}

export default function AdminCardCreator() {
  const [step, setStep] = useState<'card' | 'effect'>('card');
  const [createdCardName, setCreatedCardName] = useState('');

  // FORM - CRIAR CARTA
  const [cardForm, setCardForm] = useState<CardForm>({
    name: '',
    description: '',
    type: 'Monster',
    rarity: 'Common',
    isForSale: true,
    isActive: true,
    maxCopiesInDeck: 3,
  });

  // FORM - ADICIONAR EFEITO
  const [effectForm, setEffectForm] = useState<EffectForm>({
    cardName: '',
    effectType: 'ignition',
    action: 'draw',
  });

  const [templates, setTemplates] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ==================== CRIAR CARTA ====================
  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const currentToken = useAuthStore.getState().token;
      console.log('🔑 Token sendo enviado:', currentToken ? 'Sim' : 'Não');
      
      // Limpar dados removendo campos que não existem mais
      const cleanedCardForm: any = {};
      const allowedFields = [
        'idCarta', 'name', 'description', 'cardImage', 'type', 'monsterType',
        'attribute', 'race', 'spellType', 'trapType', 'archetype', 'level',
        'rank', 'atk', 'def', 'rarity', 'isActive', 'isBanned', 'maxCopiesInDeck',
        'priceCredits', 'priceCash', 'isForSale'
      ];
      
      for (const key of allowedFields) {
        if (cardForm[key as keyof typeof cardForm] !== undefined && cardForm[key as keyof typeof cardForm] !== null) {
          cleanedCardForm[key] = cardForm[key as keyof typeof cardForm];
        }
      }
      
      console.log('📤 [AdminCardCreator] Dados enviados (limpos):', cleanedCardForm);
      
      const response = await axios.post(
        `${API_URL}/cards`,
        cleanedCardForm,
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setMessage({ type: 'success', text: `✅ Carta "${response.data.name}" criada com sucesso!` });
      setCreatedCardName(response.data.name);
      setEffectForm({ ...effectForm, cardName: response.data.name });
      
      // Ir para step de efeito
      setTimeout(() => {
        setStep('effect');
      }, 1500);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  // ==================== ADICIONAR EFEITO ====================
  const handleAddEffect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const currentToken = useAuthStore.getState().token;
      
      await axios.post(
        `${API_URL}/cards/effects/add`,
        effectForm,
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setMessage({ type: 'success', text: `✅ Efeito adicionado à carta "${effectForm.cardName}"!` });
      
      // Reset forms
      setTimeout(() => {
        setStep('card');
        setCardForm({
          name: '',
          description: '',
          type: 'Monster',
          rarity: 'Common',
          isForSale: true,
          maxCopiesInDeck: 3,
        });
        setEffectForm({
          cardName: '',
          effectType: 'ignition',
          action: 'draw',
        });
      }, 2000);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  // ==================== CARREGAR TEMPLATES ====================
  const loadTemplates = async () => {
    try {
      const currentToken = useAuthStore.getState().token;
      
      const response = await axios.get(`${API_URL}/cards/effects/templates`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      setTemplates(response.data);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    }
  };

  // ==================== USAR TEMPLATE ====================
  const useTemplate = (templateName: string) => {
    if (!templates) return;
    
    const template = templates[templateName];
    setEffectForm({
      ...effectForm,
      effectType: template.type,
      action: template.action,
      target: template.target,
      timing: template.timing,
      condition: template.condition,
      params: template.params,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
          <h1 className="text-4xl font-bold mb-2">🎴 Criar Carta</h1>
          <p className="text-gray-300">Sistema de criação de cartas com preços e efeitos</p>
        </div>

        {/* Mensagem */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-900/50 border border-green-500' : 'bg-red-900/50 border border-red-500'
            }`}
          >
            <p className="text-white font-semibold">{message.text}</p>
          </motion.div>
        )}

        {/* Steps */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setStep('card')}
            className={`flex-1 py-3 rounded-lg font-bold transition-all ${
              step === 'card'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            1️⃣ Criar Carta
          </button>
          <button
            onClick={() => setStep('effect')}
            disabled={!createdCardName}
            className={`flex-1 py-3 rounded-lg font-bold transition-all ${
              step === 'effect'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            } ${!createdCardName && 'opacity-50 cursor-not-allowed'}`}
          >
            2️⃣ Adicionar Efeito
          </button>
        </div>

        {/* STEP 1 - CRIAR CARTA */}
        {step === 'card' && (
          <motion.form
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onSubmit={handleCreateCard}
            className="bg-gray-800 rounded-lg p-6 space-y-6"
          >
            {/* Nome */}
            <div>
              <label className="block text-sm font-bold mb-2">Nome da Carta *</label>
              <input
                type="text"
                required
                value={cardForm.name}
                onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                placeholder="Ex: Dark Magician"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-sm font-bold mb-2">Descrição *</label>
              <textarea
                required
                value={cardForm.description}
                onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 h-24"
                placeholder="Ex: The ultimate wizard in terms of attack and defense."
              />
            </div>

            {/* Tipo e Raridade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">Tipo *</label>
                <select
                  value={cardForm.type}
                  onChange={(e) => setCardForm({ ...cardForm, type: e.target.value as any })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                >
                  <option value="Monster">Monster</option>
                  <option value="Spell">Spell</option>
                  <option value="Trap">Trap</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Raridade *</label>
                <select
                  value={cardForm.rarity}
                  onChange={(e) => setCardForm({ ...cardForm, rarity: e.target.value as any })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                >
                  <option value="Common">Common</option>
                  <option value="Rare">Rare</option>
                  <option value="Super Rare">Super Rare</option>
                  <option value="Ultra Rare">Ultra Rare</option>
                  <option value="Secret Rare">Secret Rare</option>
                </select>
              </div>
            </div>

            {/* Se for Monstro */}
            {cardForm.type === 'Monster' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Tipo de Monstro *</label>
                    <select
                      required
                      value={cardForm.monsterType || ''}
                      onChange={(e) => setCardForm({ ...cardForm, monsterType: e.target.value as any })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="">Selecione...</option>
                      <option value="Normal">Normal</option>
                      <option value="Effect">Effect</option>
                      <option value="Ritual">Ritual</option>
                      <option value="Fusion">Fusion</option>
                      <option value="Synchro">Synchro</option>
                      <option value="Xyz">Xyz</option>
                      <option value="Pendulum">Pendulum</option>
                      <option value="Link">Link</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Atributo *</label>
                    <select
                      required
                      value={cardForm.attribute || ''}
                      onChange={(e) => setCardForm({ ...cardForm, attribute: e.target.value as any })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="">Selecione...</option>
                      <option value="DARK">⚫ DARK</option>
                      <option value="LIGHT">⚪ LIGHT</option>
                      <option value="WATER">💧 WATER</option>
                      <option value="FIRE">🔥 FIRE</option>
                      <option value="EARTH">🌍 EARTH</option>
                      <option value="WIND">🌪️ WIND</option>
                      <option value="DIVINE">✨ DIVINE</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Raça *</label>
                  <select
                    required
                    value={cardForm.race || ''}
                    onChange={(e) => setCardForm({ ...cardForm, race: e.target.value as any })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  >
                    <option value="">Selecione...</option>
                    <option value="Warrior">Warrior</option>
                    <option value="Spellcaster">Spellcaster</option>
                    <option value="Fairy">Fairy</option>
                    <option value="Fiend">Fiend</option>
                    <option value="Zombie">Zombie</option>
                    <option value="Machine">Machine</option>
                    <option value="Aqua">Aqua</option>
                    <option value="Pyro">Pyro</option>
                    <option value="Rock">Rock</option>
                    <option value="Winged Beast">Winged Beast</option>
                    <option value="Plant">Plant</option>
                    <option value="Insect">Insect</option>
                    <option value="Thunder">Thunder</option>
                    <option value="Dragon">Dragon</option>
                    <option value="Beast">Beast</option>
                    <option value="Beast-Warrior">Beast-Warrior</option>
                    <option value="Dinosaur">Dinosaur</option>
                    <option value="Fish">Fish</option>
                    <option value="Sea Serpent">Sea Serpent</option>
                    <option value="Reptile">Reptile</option>
                    <option value="Psychic">Psychic</option>
                    <option value="Divine-Beast">Divine-Beast</option>
                    <option value="Creator God">Creator God</option>
                    <option value="Wyrm">Wyrm</option>
                    <option value="Cyberse">Cyberse</option>
                  </select>
                </div>

                {/* Level/Rank/Link */}
                {cardForm.monsterType === 'Xyz' ? (
                  <div>
                    <label className="block text-sm font-bold mb-2">Rank</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={cardForm.rank || ''}
                      onChange={(e) => setCardForm({ ...cardForm, rank: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-bold mb-2">Level</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={cardForm.level || ''}
                      onChange={(e) => setCardForm({ ...cardForm, level: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    />
                  </div>
                )}

                {/* ATK e DEF */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">ATK</label>
                    <input
                      type="number"
                      min="0"
                      value={cardForm.atk || ''}
                      onChange={(e) => setCardForm({ ...cardForm, atk: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                      placeholder="Ex: 2500"
                    />
                  </div>
                  {cardForm.monsterType !== 'Link' && (
                    <div>
                      <label className="block text-sm font-bold mb-2">DEF</label>
                      <input
                        type="number"
                        min="0"
                        value={cardForm.def || ''}
                        onChange={(e) => setCardForm({ ...cardForm, def: Number(e.target.value) })}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                        placeholder="Ex: 2000"
                      />
                    </div>
                  )}
                </div>

              </>
            )}

            {/* Se for Spell */}
            {cardForm.type === 'Spell' && (
              <div>
                <label className="block text-sm font-bold mb-2">Tipo de Spell *</label>
                <select
                  required
                  value={cardForm.spellType || ''}
                  onChange={(e) => setCardForm({ ...cardForm, spellType: e.target.value as any })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                >
                  <option value="">Selecione...</option>
                  <option value="Normal">🟢 Normal</option>
                  <option value="Continuous">♾️ Continuous</option>
                  <option value="Equip">⚔️ Equip</option>
                  <option value="Field">🏞️ Field</option>
                  <option value="Quick-Play">⚡ Quick-Play</option>
                  <option value="Ritual">🔮 Ritual</option>
                </select>
              </div>
            )}

            {/* Se for Trap */}
            {cardForm.type === 'Trap' && (
              <div>
                <label className="block text-sm font-bold mb-2">Tipo de Trap *</label>
                <select
                  required
                  value={cardForm.trapType || ''}
                  onChange={(e) => setCardForm({ ...cardForm, trapType: e.target.value as any })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                >
                  <option value="">Selecione...</option>
                  <option value="Normal">🟢 Normal</option>
                  <option value="Continuous">♾️ Continuous</option>
                  <option value="Counter">🛡️ Counter</option>
                </select>
              </div>
            )}

            {/* Campos Avançados */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-xl font-bold mb-4">⚙️ Avançado (Opcional)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Arquétipo</label>
                  <input
                    type="text"
                    value={cardForm.archetype || ''}
                    onChange={(e) => setCardForm({ ...cardForm, archetype: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="Ex: Blue-Eyes, Dark Magician"
                  />
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cardForm.isBanned || false}
                      onChange={(e) => setCardForm({ ...cardForm, isBanned: e.target.checked })}
                      className="w-5 h-5"
                    />
                    <span className="font-bold text-red-500">⛔ Banida</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cardForm.isLimited || false}
                      onChange={(e) => setCardForm({ ...cardForm, isLimited: e.target.checked })}
                      className="w-5 h-5"
                    />
                    <span className="font-bold text-yellow-500">⚠️ Limitada</span>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">
                    📊 Máximo de Cópias no Deck *
                  </label>
                  <select
                    value={cardForm.maxCopiesInDeck ?? 3}
                    onChange={(e) => setCardForm({ ...cardForm, maxCopiesInDeck: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  >
                    <option value="0">0 - Banida (não pode ter no deck)</option>
                    <option value="1">1 - Limitada a 1 cópia</option>
                    <option value="2">2 - Limitada a 2 cópias</option>
                    <option value="3">3 - Máximo padrão (3 cópias)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Define quantas cópias desta carta podem ser colocadas no deck. 0 = banida.
                  </p>
                </div>
              </div>
            </div>

            {/* Preços */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-xl font-bold mb-4">💰 Preços</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">🪙 Moedas</label>
                  <input
                    type="number"
                    min="0"
                    value={cardForm.priceCoins || ''}
                    onChange={(e) => setCardForm({ ...cardForm, priceCoins: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="5000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">💎 Créditos</label>
                  <input
                    type="number"
                    min="0"
                    value={cardForm.priceCredits || ''}
                    onChange={(e) => setCardForm({ ...cardForm, priceCredits: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">💵 Dinheiro (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cardForm.priceCash || ''}
                    onChange={(e) => setCardForm({ ...cardForm, priceCash: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="4.99"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cardForm.isActive}
                    onChange={(e) => setCardForm({ ...cardForm, isActive: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500"
                  />
                  <span className="font-bold">Carta ativa (aparece na loja)</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">Cartas inativas não aparecem na loja. Você pode ativar ou desativar depois em Editar carta.</p>
              </div>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
            >
              {loading ? 'Criando...' : '✨ Criar Carta'}
            </button>
          </motion.form>
        )}

        {/* STEP 2 - ADICIONAR EFEITO */}
        {step === 'effect' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-bold mb-4">📚 Templates Prontos</h3>
              <button
                onClick={loadTemplates}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold mb-4"
              >
                Carregar Templates
              </button>
              
              {templates && (
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(templates).map((key) => (
                    <button
                      key={key}
                      onClick={() => useTemplate(key)}
                      className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleAddEffect} className="bg-gray-800 rounded-lg p-6 space-y-6">
              {/* Nome da Carta */}
              <div>
                <label className="block text-sm font-bold mb-2">Nome da Carta *</label>
                <input
                  type="text"
                  required
                  value={effectForm.cardName}
                  onChange={(e) => setEffectForm({ ...effectForm, cardName: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  placeholder="Ex: Dark Magician"
                />
              </div>

              {/* Tipo e Ação */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Tipo de Efeito *</label>
                  <select
                    value={effectForm.effectType}
                    onChange={(e) => setEffectForm({ ...effectForm, effectType: e.target.value as any })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  >
                    <option value="continuous">Continuous</option>
                    <option value="trigger">Trigger</option>
                    <option value="ignition">Ignition</option>
                    <option value="quick">Quick</option>
                    <option value="flip">Flip</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Ação *</label>
                  <input
                    type="text"
                    required
                    value={effectForm.action}
                    onChange={(e) => setEffectForm({ ...effectForm, action: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="draw, destroy, special-summon..."
                  />
                </div>
              </div>

              {/* Target e Condition */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Alvo</label>
                  <input
                    type="text"
                    value={effectForm.target || ''}
                    onChange={(e) => setEffectForm({ ...effectForm, target: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="self, opponent, all..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Condição</label>
                  <input
                    type="text"
                    value={effectForm.condition || ''}
                    onChange={(e) => setEffectForm({ ...effectForm, condition: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="When this card is summoned..."
                  />
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setStep('card');
                    setEffectForm({
                      cardName: '',
                      effectType: 'ignition',
                      action: 'draw',
                    });
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
                >
                  Pular (sem efeito)
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Adicionando...' : '✨ Adicionar Efeito'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
