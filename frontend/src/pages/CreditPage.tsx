import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CreditPackage {
  id: string;
  credits: number;
  price: number; // Preço em reais (R$)
  bonus?: number; // Créditos bônus
  popular?: boolean;
  description?: string;
}

export default function CreditPage() {
  const { user, token, refreshUser } = useAuthStore();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pacotes padrão (pode ser configurado via admin depois)
  const defaultPackages: CreditPackage[] = [
    {
      id: '1',
      credits: 100,
      price: 9.90,
      bonus: 0,
      description: 'Pacote básico',
    },
    {
      id: '2',
      credits: 250,
      price: 19.90,
      bonus: 25,
      popular: true,
      description: 'Melhor custo-benefício',
    },
    {
      id: '3',
      credits: 500,
      price: 34.90,
      bonus: 75,
      description: 'Pacote intermediário',
    },
    {
      id: '4',
      credits: 1000,
      price: 59.90,
      bonus: 200,
      description: 'Pacote premium',
    },
    {
      id: '5',
      credits: 2500,
      price: 129.90,
      bonus: 750,
      description: 'Pacote máximo',
    },
  ];

  useEffect(() => {
    // Por enquanto usar pacotes padrão
    // Futuramente pode buscar do backend
    setPackages(defaultPackages);
  }, []);

  const handlePurchase = async (pkg: CreditPackage) => {
    if (!user || !token) {
      setMessage({ type: 'error', text: 'Você precisa estar logado para comprar créditos!' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Aqui você integraria com o gateway de pagamento (Mercado Pago, Stripe, etc.)
      // Por enquanto, vamos simular uma compra
      
      // TODO: Integrar com gateway de pagamento real
      // Exemplo com Mercado Pago:
      // const response = await axios.post(`${API_URL}/payments/create`, {
      //   packageId: pkg.id,
      //   userId: user.id,
      //   amount: pkg.price,
      //   credits: pkg.credits + (pkg.bonus || 0),
      // }, {
      //   headers: { Authorization: `Bearer ${token}` }
      // });

      // Por enquanto, apenas mostrar mensagem
      setMessage({
        type: 'success',
        text: `Compra iniciada! Você receberá ${pkg.credits + (pkg.bonus || 0)} créditos após o pagamento de R$ ${pkg.price.toFixed(2)}.`
      });

      // Simular atualização do usuário após pagamento
      // await refreshUser();
    } catch (error: any) {
      console.error('Erro ao processar compra:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao processar compra. Tente novamente.'
      });
    } finally {
      setLoading(false);
    }
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
            💳 Comprar Créditos
          </h1>
          <p className="text-gray-400 text-lg">
            Adquira créditos para comprar cartas e itens no jogo
          </p>
          {user && (
            <div className="mt-4 inline-block bg-gray-800/50 rounded-lg px-6 py-3 border border-gray-700">
              <p className="text-gray-300">
                Seus créditos: <span className="text-yellow-400 font-bold text-xl">{user.credits || 0}</span>
              </p>
            </div>
          )}
        </div>

        {/* Mensagem */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 border border-green-500' : 'bg-red-500/20 border border-red-500'
            }`}
          >
            <p className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>
              {message.text}
            </p>
          </motion.div>
        )}

        {/* Pacotes de Créditos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg, index) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border-2 ${
                pkg.popular
                  ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
                  : 'border-gray-700'
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black px-4 py-1 rounded-full text-sm font-bold">
                  MAIS POPULAR
                </div>
              )}

              <div className="text-center mb-6">
                <div className="text-5xl mb-2">💰</div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {pkg.credits} Créditos
                </h3>
                {pkg.bonus && pkg.bonus > 0 && (
                  <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm inline-block mb-2">
                    +{pkg.bonus} bônus
                  </div>
                )}
                {pkg.description && (
                  <p className="text-gray-400 text-sm">{pkg.description}</p>
                )}
              </div>

              <div className="text-center mb-6">
                <div className="text-4xl font-bold text-yellow-400 mb-1">
                  R$ {pkg.price.toFixed(2)}
                </div>
                <p className="text-gray-400 text-sm">
                  R$ {(pkg.price / (pkg.credits + (pkg.bonus || 0))).toFixed(3)} por crédito
                </p>
              </div>

              <button
                onClick={() => handlePurchase(pkg)}
                disabled={loading || !user}
                className={`w-full py-3 rounded-lg font-bold transition-all ${
                  pkg.popular
                    ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? 'Processando...' : 'Comprar Agora'}
              </button>
            </motion.div>
          ))}
        </div>

        {/* Informações Adicionais */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <h2 className="text-xl font-bold text-white mb-4">ℹ️ Informações</h2>
          <ul className="space-y-2 text-gray-300">
            <li>• Os créditos são adicionados instantaneamente após a confirmação do pagamento</li>
            <li>• Créditos podem ser usados para comprar cartas na loja</li>
            <li>• Pagamentos são processados de forma segura</li>
            <li>• Em caso de problemas, entre em contato com o suporte</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}

