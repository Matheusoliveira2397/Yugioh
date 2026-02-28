# Arquitetura do Sistema de Efeitos de Cartas

## Visão Geral

Este sistema foi projetado seguindo os **melhores padrões de design** para garantir:
- ✅ **Isolamento total** entre efeitos
- ✅ **Manutenibilidade** a longo prazo
- ✅ **Escalabilidade** para centenas de cartas
- ✅ **Testabilidade** individual
- ✅ **Rastreabilidade** de bugs

## Padrões de Design Utilizados

### 1. Strategy Pattern
Cada efeito de carta é uma estratégia independente que implementa a interface `ICardEffect`.

**Benefícios:**
- Fácil adicionar novos efeitos sem modificar código existente
- Cada efeito pode ter sua própria lógica complexa
- Fácil testar isoladamente

### 2. Factory Pattern
O `CardEffectRegistryService` atua como uma factory que cria e gerencia instâncias de efeitos.

**Benefícios:**
- Centralização do registro de efeitos
- Lazy loading de efeitos
- Cache de instâncias

### 3. Dependency Injection (NestJS)
Todos os efeitos recebem dependências via injeção do NestJS.

**Benefícios:**
- Fácil mockar dependências em testes
- Baixo acoplamento
- Gerenciamento automático de ciclo de vida

### 4. Template Method Pattern
A classe `BaseCardEffect` define a estrutura comum, e cada efeito implementa os métodos específicos.

**Benefícios:**
- Código comum reutilizado
- Consistência entre efeitos
- Fácil adicionar funcionalidades comuns

## Estrutura de Arquivos

```
card-effects/
├── interfaces/
│   └── card-effect.interface.ts    # Contratos e tipos
├── base/
│   └── card-effect.base.ts         # Classe base com funcionalidades comuns
├── registry/
│   └── card-effect-registry.service.ts  # Registro e busca de efeitos
├── effects/
│   ├── drop-off.effect.ts          # Efeito isolado da Drop Off
│   ├── pot-of-greed.effect.ts      # Efeito isolado do Pot of Greed
│   └── ...                         # Outros efeitos (um arquivo por carta)
├── card-effects.module.ts          # Módulo NestJS que registra tudo
├── README.md                       # Documentação de uso
├── MIGRATION_GUIDE.md              # Guia de migração
└── ARCHITECTURE.md               # Este arquivo
```

## Fluxo de Execução

```
1. Carta é ativada
   ↓
2. CardEffectsService.processCardEffect()
   ↓
3. CardEffectRegistryService.findEffect()
   ↓
4. Se encontrado: effect.process(context)
   Se não: fallback para código antigo
   ↓
5. effect.canActivate() (se implementado)
   ↓
6. effect.process() executa lógica
   ↓
7. Retorna CardEffectResult
```

## Princípios de Design

### SOLID Principles

1. **Single Responsibility**: Cada efeito tem uma única responsabilidade
2. **Open/Closed**: Aberto para extensão (novos efeitos), fechado para modificação
3. **Liskov Substitution**: Qualquer efeito pode substituir BaseCardEffect
4. **Interface Segregation**: Interface mínima e específica
5. **Dependency Inversion**: Depende de abstrações (ICardEffect), não de implementações

### Clean Code Principles

1. **Nomes Descritivos**: `PotOfGreedEffect`, `process()`, `canActivate()`
2. **Funções Pequenas**: Cada método faz uma coisa
3. **Sem Duplicação**: Código comum na classe base
4. **Comentários Úteis**: Documentação clara do que cada efeito faz
5. **Tratamento de Erros**: Try/catch e logs apropriados

## Vantagens desta Arquitetura

### Para Desenvolvedores
- ✅ Fácil encontrar código de uma carta específica
- ✅ Mudanças isoladas não afetam outros efeitos
- ✅ Fácil adicionar novos efeitos
- ✅ Fácil debugar problemas

### Para o Projeto
- ✅ Código mais organizado e profissional
- ✅ Menos bugs por isolamento
- ✅ Fácil onboarding de novos desenvolvedores
- ✅ Escalável para centenas de cartas

### Para Manutenção
- ✅ Histórico claro de mudanças por carta
- ✅ Fácil reverter mudanças problemáticas
- ✅ Testes isolados por efeito
- ✅ Logs rastreáveis

## Comparação com Código Antigo

### Antes (Código Monolítico)
```typescript
// Tudo em um arquivo gigante (15.000+ linhas)
if (isCard(['pot of greed'])) {
  // 50 linhas de código
}
if (isCard(['raigeki'])) {
  // 80 linhas de código
}
// ... centenas de ifs
```

**Problemas:**
- ❌ Difícil encontrar código específico
- ❌ Mudanças podem quebrar outros efeitos
- ❌ Difícil testar isoladamente
- ❌ Código difícil de manter

### Depois (Sistema Modular)
```typescript
// Cada efeito em seu próprio arquivo
// effects/pot-of-greed.effect.ts (100 linhas isoladas)
// effects/raigeki.effect.ts (120 linhas isoladas)
```

**Vantagens:**
- ✅ Fácil encontrar código específico
- ✅ Mudanças isoladas não afetam outros
- ✅ Fácil testar isoladamente
- ✅ Código fácil de manter

## Métricas de Qualidade

### Complexidade Ciclomática
- **Antes**: Alta (muitos ifs aninhados)
- **Depois**: Baixa (cada efeito é simples)

### Acoplamento
- **Antes**: Alto (tudo depende de tudo)
- **Depois**: Baixo (efeitos isolados)

### Coesão
- **Antes**: Baixa (muitas responsabilidades)
- **Depois**: Alta (uma responsabilidade por efeito)

## Próximos Passos

1. Migrar efeitos críticos primeiro
2. Criar testes unitários para cada efeito
3. Documentar cada efeito individualmente
4. Remover código antigo gradualmente
5. Adicionar validações e sanitizações

## Referências

- [Strategy Pattern](https://refactoring.guru/design-patterns/strategy)
- [Factory Pattern](https://refactoring.guru/design-patterns/factory-method)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Clean Code](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)

