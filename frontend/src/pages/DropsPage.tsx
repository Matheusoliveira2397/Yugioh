import { motion } from 'framer-motion';
import { useI18n } from '../i18n/I18nContext';

export default function DropsPage() {
  const { t } = useI18n();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-lg p-8 mb-8 shadow-2xl"
      >
        <h1 className="text-4xl font-bold mb-2">💎 {t('drops.title')}</h1>
        <p className="text-gray-300 text-lg">{t('drops.subtitle')}</p>
      </motion.div>

      <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
        <p className="text-8xl mb-4">🚧</p>
        <p className="text-3xl font-bold mb-4">{t('common.comingSoon')}</p>
        <p className="text-xl text-gray-400">{t('drops.comingSoonBody')}</p>
      </div>
    </div>
  );
}
