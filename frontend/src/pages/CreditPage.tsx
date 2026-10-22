import GameIcon from '../components/GameIcon';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/axios';
import { useI18n } from '../i18n/I18nContext';

interface CreditPackage {
  id: string;
  credits: number;
  price: number; // Preço em reais (R$)
  bonus?: number; // Créditos bônus
  popular?: boolean;
  description?: string;
}

interface PaymentContact {
  pixKey: string | null;
  whatsapp: string | null;
}

function whatsappDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export default function CreditPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentContact, setPaymentContact] = useState<PaymentContact | null>(null);
  const [copyPixLabel, setCopyPixLabel] = useState<string | null>(null);

  /** Fallback se a API não responder (mesmo formato que o backend). */
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
    let cancelled = false;
    (async () => {
      try {
        setLoadingCatalog(true);
        const res = await api.get<CreditPackage[]>('/credit-packages', { timeout: 15000 });
        const list = Array.isArray(res.data) ? res.data : [];
        if (!cancelled && list.length > 0) {
          setPackages(list);
        } else if (!cancelled) {
          setPackages(defaultPackages);
        }
      } catch {
        if (!cancelled) setPackages(defaultPackages);
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<PaymentContact>('/public/credit-payment-contact', { timeout: 12000 });
        if (!cancelled && res.data) {
          setPaymentContact({
            pixKey: res.data.pixKey?.trim() || null,
            whatsapp: res.data.whatsapp?.trim() || null,
          });
        }
      } catch {
        if (!cancelled) setPaymentContact(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePurchase = async (pkg: CreditPackage) => {
    if (!user) {
      setMessage({ type: 'error', text: t('credit.loginToBuy') });
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
        text: `Compra iniciada! Você receberá ${pkg.credits + (pkg.bonus || 0)} créditos após o pagamento de R$ ${pkg.price.toFixed(2)}.`,
      });

      // Simular atualização do usuário após pagamento
      // await refreshUser();
    } catch (error: any) {
      console.error('Erro ao processar compra:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('common.tryAgain'),
      });
    } finally {
      setLoading(false);
    }
  };

  const showPaymentContact =
    paymentContact && (paymentContact.pixKey || paymentContact.whatsapp);
  const waLink =
    paymentContact?.whatsapp && whatsappDigits(paymentContact.whatsapp).length >= 10
      ? `https://wa.me/${whatsappDigits(paymentContact.whatsapp)}`
      : null;

  const copyPix = async () => {
    if (!paymentContact?.pixKey) return;
    try {
      await navigator.clipboard.writeText(paymentContact.pixKey);
      setCopyPixLabel(t('credit.copied'));
      window.setTimeout(() => setCopyPixLabel(null), 2000);
    } catch {
      setCopyPixLabel(t('common.tryAgain'));
      window.setTimeout(() => setCopyPixLabel(null), 2500);
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
        <header className="game-screen-hero text-center">
          <p className="game-screen-kicker">Moedas e recompensas</p>
          <h1 className="game-screen-heading justify-center"><span className="game-screen-icon"><GameIcon route="/credit" size={27} /></span>{t('credit.title')}</h1>
          <p className="game-screen-subtitle mx-auto">
            {t('credit.subtitle')}
          </p>
          <p className="text-amber-200/80 text-sm mt-2">{t('credit.clickPackage')}</p>
          {user && (
            <div className="mt-4 inline-block bg-gray-800/50 rounded-lg px-6 py-3 border border-gray-700">
              <p className="text-gray-300">
                {t('credit.yourCredits')}{' '}
                <span className="text-yellow-400 font-bold text-xl">{user.credits || 0}</span>
              </p>
            </div>
          )}
        </div>

        {showPaymentContact && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto rounded-xl border border-emerald-600/50 bg-emerald-950/30 p-6 text-center space-y-4"
          >
            <h2 className="text-lg font-bold text-emerald-200">
              {t('credit.payment')} / {t('credit.contact')}
            </h2>
            {paymentContact!.pixKey && (
              <div className="text-left sm:text-center space-y-2">
                <p className="text-slate-400 text-sm">{t('credit.pixKey')}</p>
                <p className="text-white font-mono text-sm break-all">{paymentContact!.pixKey}</p>
                <button
                  type="button"
                  onClick={copyPix}
                  className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 underline"
                >
                  {copyPixLabel ?? t('credit.copyPix')}
                </button>
              </div>
            )}
            {paymentContact!.whatsapp && (
              <div className="text-left sm:text-center space-y-2">
                <p className="text-slate-400 text-sm">WhatsApp</p>
                <p className="text-white">{paymentContact!.whatsapp}</p>
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300 underline"
                  >
                    {t('credit.openWhatsApp')}
                  </a>
                ) : (
                  <p className="text-amber-200/80 text-xs">
                    Inclua DDD e número para habilitar o link direto (ex.: +55 11 99999-9999).
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

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
        {loadingCatalog ? (
          <div className="text-center py-16 text-slate-400">{t('credit.loadingPackages')}</div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg, index) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <button
                type="button"
                onClick={() => handlePurchase(pkg)}
                disabled={loading || !user}
                title={user ? t('credit.clickToBuy') : t('credit.loginToBuy')}
                className={`relative w-full text-left bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border-2 transition-all hover:brightness-110 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                  pkg.popular
                    ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black px-4 py-1 rounded-full text-sm font-bold pointer-events-none">
                    {t('credit.mostPopular')}
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className="text-5xl mb-2">💰</div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {pkg.credits} {t('profileCard.credits')}
                  </h3>
                  {pkg.bonus && pkg.bonus > 0 && (
                    <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm inline-block mb-2">
                      +{pkg.bonus} {t('credit.bonus')}
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
                    R$ {(pkg.price / (pkg.credits + (pkg.bonus || 0))).toFixed(3)} {t('credit.perCredit')}
                  </p>
                </div>

                <div
                  className={`w-full py-3 rounded-lg font-bold text-center pointer-events-none ${
                    pkg.popular
                      ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white'
                  }`}
                >
                  {loading ? t('credit.processing') : !user ? t('credit.loginToBuy') : t('credit.clickToBuy')}
                </div>
              </button>
            </motion.div>
          ))}
        </div>
        )}

        {/* Informações Adicionais */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <h2 className="text-xl font-bold text-white mb-4">ℹ️ {t('credit.info')}</h2>
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
