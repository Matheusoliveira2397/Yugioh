import { motion } from 'framer-motion';

export default function DeckBuilderPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Card Principal com Imagem */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-slate-800/90 via-slate-900/90 to-slate-800/90 rounded-2xl overflow-hidden border-2 border-slate-700/50 shadow-2xl mb-8"
        >
          {/* Imagem de Fundo com Overlay */}
          <div className="relative h-64 overflow-hidden">
            <img
              src="/images/decks/deck.png"
              alt="Yu-Gi-Oh Deck"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect fill="%23374151" width="1200" height="400"/><text x="50%" y="50%" font-size="64" fill="%239CA3AF" text-anchor="middle" dominant-baseline="middle">🎴 Deck</text></svg>';
              }}
            />
            {/* Overlay escuro */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/60 to-slate-900"></div>
            
            {/* Texto sobre a imagem */}
            <div className="absolute bottom-6 left-8">
              <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-2xl">Organize seu deck</h1>
              <p className="text-xl text-gray-200 drop-shadow-lg">Crie e edite seus baralhos</p>
            </div>
          </div>

          {/* Conteúdo do Card */}
          <div className="p-8">

            {/* Grid de Cards de Deck */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Card 1 - Deck Principal */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ scale: 1.03 }}
                className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-6 border border-slate-600/50 cursor-pointer hover:border-purple-500/50 transition-all"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg flex items-center justify-center text-3xl">
                    🎴
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Deck Principal</h3>
                    <p className="text-sm text-gray-400">0/60 cartas</p>
                  </div>
                </div>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-gray-400">Monstros:</span>
                  <span className="text-orange-400 font-bold">0</span>
                </div>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-gray-400">Magias:</span>
                  <span className="text-blue-400 font-bold">0</span>
                </div>
                <div className="flex justify-between text-sm mb-4">
                  <span className="text-gray-400">Armadilhas:</span>
                  <span className="text-purple-400 font-bold">0</span>
                </div>
                <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors">
                  Editar Deck
                </button>
              </motion.div>

              {/* Card 2 - Criar Novo Deck */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.03 }}
                className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-6 border border-dashed border-slate-600 cursor-pointer hover:border-green-500/50 transition-all"
              >
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-green-600 to-green-800 rounded-full flex items-center justify-center text-4xl mb-4">
                    ➕
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Criar Novo Deck</h3>
                  <p className="text-sm text-gray-400 mb-4">Monte um deck do zero</p>
                  <button className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors">
                    Começar
                  </button>
                </div>
              </motion.div>

              {/* Card 3 - Deck Aleatório */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.03 }}
                className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-6 border border-slate-600/50 cursor-pointer hover:border-yellow-500/50 transition-all"
              >
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-yellow-600 to-orange-600 rounded-full flex items-center justify-center text-4xl mb-4">
                    🎲
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Deck Aleatório</h3>
                  <p className="text-sm text-gray-400 mb-4">Gere um deck surpresa</p>
                  <button className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors">
                    Gerar
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Seção de Decks Recomendados */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50"
            >
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <span>⭐</span> Decks Recomendados
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-slate-700/50 rounded-lg p-4 hover:bg-slate-700 transition-colors cursor-pointer">
                  <h4 className="font-bold text-white mb-2">🐉 Dragões</h4>
                  <p className="text-sm text-gray-400 mb-3">Deck focado em monstros tipo Dragão</p>
                  <span className="text-xs text-purple-400">40 cartas</span>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 hover:bg-slate-700 transition-colors cursor-pointer">
                  <h4 className="font-bold text-white mb-2">⚔️ Guerreiros</h4>
                  <p className="text-sm text-gray-400 mb-3">Estratégia de ataque direto</p>
                  <span className="text-xs text-purple-400">40 cartas</span>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 hover:bg-slate-700 transition-colors cursor-pointer">
                  <h4 className="font-bold text-white mb-2">🌟 Exodia</h4>
                  <p className="text-sm text-gray-400 mb-3">Vitória por cartas especiais</p>
                  <span className="text-xs text-purple-400">40 cartas</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
