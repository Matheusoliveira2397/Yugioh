import codecs

# Ler arquivo original
with codecs.open('ShopPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Texto antigo (exato do arquivo)
old_text = """                    {/* Divider */}
                    <div className="border-t border-gray-700 mb-4"></div>

                    {/* Price Section */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Preço</p>
                        <div className="text-2xl font-bold">
                          {item.type === 'card' ? (
                            <span className="text-purple-400 flex items-center gap-1">
                              <span className="text-3xl">��</span> {item.price}
                            </span>
                          ) : (
                            <span className="text-green-400 flex items-center gap-1">
                              <span className="text-3xl">💵</span> {item.price}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Stock Badge */}
                      <div className="bg-green-500/20 border border-green-500/50 px-3 py-1 rounded-full">
                        <p className="text-xs text-green-400 font-bold">✓ Disponível</p>
                      </div>
                    </div>"""

# Texto novo
new_text = """                    {/* Divider */}
                    <div className="border-t border-gray-700 mb-4"></div>

                    {/* Price Section - Mostra AMBOS os preços para cartas */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Preços Disponíveis</p>
                        <div className="bg-green-500/20 border border-green-500/50 px-3 py-1 rounded-full">
                          <p className="text-xs text-green-400 font-bold">✓ Em Estoque</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {item.type === 'card' ? (
                          <>
                            {item.priceCredits && item.priceCredits > 0 && (
                              <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-500/30 rounded-lg px-4 py-2.5 hover:bg-purple-900/30 transition-all">
                                <span className="text-2xl">💎</span>
                                <div className="flex-1">
                                  <span className="text-xl font-bold text-purple-400">{item.priceCredits}</span>
                                  <span className="text-xs text-gray-400 ml-2">Créditos</span>
                                </div>
                              </div>
                            )}
                            {item.priceCash && item.priceCash > 0 && (
                              <div className="flex items-center gap-3 bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-2.5 hover:bg-green-900/30 transition-all">
                                <span className="text-2xl">💵</span>
                                <div className="flex-1">
                                  <span className="text-xl font-bold text-green-400">R$ {item.priceCash.toFixed(2)}</span>
                                  <span className="text-xs text-gray-400 ml-2">Cash</span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-3 bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-2.5">
                            <span className="text-2xl">💵</span>
                            <div className="flex-1">
                              <span className="text-xl font-bold text-green-400">{item.price}</span>
                              <span className="text-xs text-gray-400 ml-2">Cash</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>"""

# Fazer substituição
new_content = content.replace(old_text, new_text)

# Salvar arquivo
with codecs.open('ShopPage_NEW.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
    
print(f"Arquivo modificado criado: ShopPage_NEW.tsx")
print(f"Tamanho original: {len(content)}")
print(f"Tamanho novo: {len(new_content)}")
print(f"Diferença: {len(new_content) - len(content)} chars")
