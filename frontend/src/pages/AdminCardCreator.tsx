import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CardForm {
  // Básico
  name: string;
  description: string;
  type: 'Monster' | 'Spell' | 'Trap';
  
  // Monstro
  monsterType?: 'Normal' | 'Effect' | 'Fusion' | 'Synchro' | 'Xyz' | 'Link';
  attribute?: 'DARK' | 'LIGHT' | 'WATER' | 'FIRE' | 'EARTH' | 'WIND';
  race?: string;
  level?: number;
  atk?: number;
  def?: number;
  
  // Raridade
  rarity: 'Common' | 'Rare' | 'Super Rare' | 'Ultra Rare' | 'Secret Rare';
  
  // Preços
  priceCoins?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
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
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/cards`,
        cardForm,
        {
          headers: {
            Authorization: `Bearer ${token}`,
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
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/cards/effects/add`,
        effectForm,
        {
          headers: {
            Authorization: `Bearer ${token}`,
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
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/cards/effects/templates`, {
        headers: { Authorization: `Bearer ${token}` },
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
                    <label className="block text-sm font-bold mb-2">Tipo de Monstro</label>
                    <select
                      value={cardForm.monsterType || ''}
                      onChange={(e) => setCardForm({ ...cardForm, monsterType: e.target.value as any })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="">Selecione...</option>
                      <option value="Normal">Normal</option>
                      <option value="Effect">Effect</option>
                      <option value="Fusion">Fusion</option>
                      <option value="Synchro">Synchro</option>
                      <option value="Xyz">Xyz</option>
                      <option value="Link">Link</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Atributo</label>
                    <select
                      value={cardForm.attribute || ''}
                      onChange={(e) => setCardForm({ ...cardForm, attribute: e.target.value as any })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="">Selecione...</option>
                      <option value="DARK">DARK</option>
                      <option value="LIGHT">LIGHT</option>
                      <option value="WATER">WATER</option>
                      <option value="FIRE">FIRE</option>
                      <option value="EARTH">EARTH</option>
                      <option value="WIND">WIND</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
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
                  <div>
                    <label className="block text-sm font-bold mb-2">ATK</label>
                    <input
                      type="number"
                      min="0"
                      value={cardForm.atk || ''}
                      onChange={(e) => setCardForm({ ...cardForm, atk: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">DEF</label>
                    <input
                      type="number"
                      min="0"
                      value={cardForm.def || ''}
                      onChange={(e) => setCardForm({ ...cardForm, def: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    />
                  </div>
                </div>
              </>
            )}

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
                    checked={cardForm.isForSale}
                    onChange={(e) => setCardForm({ ...cardForm, isForSale: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="font-bold">Disponível na Loja</span>
                </label>
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
