export default function TournamentPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Torneios</h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border-2 border-purple-500">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold">Torneio Semanal</h2>
            <span className="bg-green-500 text-xs px-2 py-1 rounded-full">Aberto</span>
          </div>
          <div className="space-y-2 text-gray-300 mb-6">
            <p>📅 Início: Sábado 15:00</p>
            <p>👥 Participantes: 24/32</p>
            <p>🏆 Prêmio: 1000 Gems</p>
          </div>
          <button className="w-full btn-primary">
            Inscrever-se
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border-2 border-blue-500">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold">Copa Mensal</h2>
            <span className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full">Em breve</span>
          </div>
          <div className="space-y-2 text-gray-300 mb-6">
            <p>📅 Início: 15/12/2024</p>
            <p>👥 Participantes: 0/64</p>
            <p>🏆 Prêmio: 5000 Gems</p>
          </div>
          <button className="w-full btn-secondary" disabled>
            Inscrições em breve
          </button>
        </div>
      </div>
    </div>
  );
}
