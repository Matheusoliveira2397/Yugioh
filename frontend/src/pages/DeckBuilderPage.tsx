import { motion } from 'framer-motion';

export default function DeckBuilderPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 mb-4">
            🎴 Deck
          </h1>
          <p className="text-gray-300 text-lg">Monte seu deck de duelo perfeito</p>
        </motion.div>

        {/* Card de Apresentação */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-8 border-2 border-purple-500/30 shadow-2xl shadow-purple-500/20 mb-8"
        >
          {/* Imagem de Cartas */}
          <div className="flex justify-center mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="relative"
            >
              <img
                src="https://images.unsplash.com/photo-1611068813580-c80b5f7c69da?w=800&q=80"
                alt="Yu-Gi-Oh Cards"
                className="w-full max-w-2xl rounded-xl shadow-2xl"
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect fill="%23374151" width="800" height="400"/><text x="50%" y="50%" font-size="48" fill="%239CA3AF" text-anchor="middle" dominant-baseline="middle">🎴 Yu-Gi-Oh! Cards</text></svg>';
                }}
              />
              {/* Efeito de brilho */}
              <div className="absolute inset-0 bg-gradient-to-t from-purple-500/20 to-transparent rounded-xl"></div>
            </motion.div>
          </div>

          {/* Título "Deck" */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center"
          >
            <h2 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-400 mb-4 tracking-wider">
              DECK
            </h2>
            <p className="text-gray-300 text-xl mb-8">
              Construa estratégias imbatíveis com as melhores cartas
            </p>
          </motion.div>

          {/* Estatísticas do Deck */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 text-center"
            >
              <div className="text-4xl mb-2">🎴</div>
              <div className="text-3xl font-bold text-yellow-400">0/60</div>
              <div className="text-sm text-gray-400 mt-1">Cartas no Deck</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 text-center"
            >
              <div className="text-4xl mb-2">⚔️</div>
              <div className="text-3xl font-bold text-red-400">0</div>
              <div className="text-sm text-gray-400 mt-1">Monstros</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.9 }}
              className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 text-center"
            >
              <div className="text-4xl mb-2">✨</div>
              <div className="text-3xl font-bold text-purple-400">0</div>
              <div className="text-sm text-gray-400 mt-1">Magias/Armadilhas</div>
            </motion.div>
          </div>

          {/* Botões de Ação */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="grid md:grid-cols-3 gap-4"
          >
            <button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg">
              📋 Ver Meus Decks
            </button>
            <button className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg">
              ➕ Criar Novo Deck
            </button>
            <button className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg">
              🎲 Deck Aleatório
            </button>
          </motion.div>

          {/* Mensagem de Desenvolvimento */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-8 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center"
          >
            <p className="text-yellow-400 font-semibold">
              🚧 Sistema de construção de decks em desenvolvimento
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Em breve você poderá criar, editar e salvar seus decks personalizados!
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
