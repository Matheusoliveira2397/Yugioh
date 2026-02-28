# Arquitetura Completa do Sistema de Efeitos de Cartas

## 🎯 Objetivo

Sistema robusto, escalável e à prova de perda de código. Garante que efeitos não sejam perdidos conforme o sistema cresce.

## 🏗️ Estrutura da Arquitetura

```
card-effects/
├── registry/              # Registro centralizado de efeitos
│   └── card-effect-registry.service.ts
├── validation/            # Validação de integridade
│   └── effect-integrity.service.ts
├── backup/                # Backup automático
│   └── effect-backup.service.ts
├── monitoring/            # Monitoramento contínuo
│   └── effect-monitor.service.ts
├── base/                  # Classe base para efeitos complexos
│   └── card-effect.base.ts
├── effects/               # Implementações de efeitos
│   ├── simple-effects.ts  # Efeitos simples (funções)
│   ├── drop-off.effect.ts # Efeitos complexos (classes)
│   └── mystical-space-typhoon.effect.ts
└── interfaces/            # Interfaces e tipos
    └── card-effect.interface.ts
```

## 🔒 Camadas de Segurança

### 1. **Sincronização Automática (syncDuelState)**
- **Problema resolvido**: Cache e banco dessincronizados
- **Solução**: Método centralizado que sempre sincroniza ambos
- **Uso**: Substitui todas as chamadas `activeDuels.set()` isoladas

```typescript
// ✅ CORRETO
await this.duelsService.syncDuelState(duelId, updatedDuel);

// ❌ ERRADO
this.activeDuels.set(duelId, updatedDuel); // Pode perder dados!
```

### 2. **Validação de Integridade (EffectIntegrityService)**
- **O que faz**: Valida todos os efeitos registrados
- **Quando**: Na inicialização e periodicamente
- **Detecta**: Efeitos quebrados, métodos faltando, erros de estrutura

```typescript
const report = await integrityService.validateAllEffects();
if (!report.isHealthy) {
  // Alertar e criar backup de emergência
}
```

### 3. **Backup Automático (EffectBackupService)**
- **O que faz**: Cria backups antes de mudanças críticas
- **Quando**: 
  - Na inicialização do módulo
  - Antes de mudanças críticas
  - Quando erros são detectados
- **Retenção**: Mantém últimos 10 backups

```typescript
// Backup automático antes de mudança crítica
await backupService.createBackup('before-critical-change');
```

### 4. **Monitoramento Contínuo (EffectMonitorService)**
- **O que faz**: Monitora saúde do sistema continuamente
- **Frequência**: A cada 5 minutos
- **Ações**: 
  - Valida integridade
  - Cria backups de emergência se necessário
  - Alerta sobre problemas

## 📝 Como Adicionar Novos Efeitos

### Efeito Simples (Recomendado para efeitos básicos)

1. **Criar função em `simple-effects.ts`**:
```typescript
export const createMyCardEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    // Sua lógica aqui
    // IMPORTANTE: Use syncDuelState para salvar
    await (duelsService as any).syncDuelState(context.duelId, context.duel, {
      player1Field: (context.duel as any).player1Field,
      player2Field: (context.duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Efeito executado com sucesso',
    };
  };
};
```

2. **Registrar no módulo**:
```typescript
this.registry.registerSimple(
  ['nome da carta'],
  createMyCardEffect(this.duelsService),
  ['IdCarta'],
  this.duelsService,
);
```

### Efeito Complexo (Para lógica avançada)

1. **Criar classe em `effects/my-card.effect.ts`**:
```typescript
@Injectable()
export class MyCardEffect extends BaseCardEffect {
  readonly cardNames = ['my card'];
  
  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    // Sua lógica aqui
    // BaseCardEffect já usa syncDuelState automaticamente!
    await this.updateDuel(context, {
      // suas mudanças
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Efeito executado',
    };
  }
}
```

2. **Adicionar como provider no módulo**:
```typescript
providers: [
  // ...
  MyCardEffect,
],
```

3. **Registrar no `onModuleInit`**:
```typescript
this.registry.register(MyCardEffect, this.myCardEffect);
```

## 🛡️ Proteções Implementadas

### 1. **Proteção contra Sobrescrita de Cache**
- `findDuelByIdFromDatabase` verifica timestamps
- Não sobrescreve cache se ele for mais recente
- Sincroniza cache com banco em background

### 2. **Validação Automática**
- Todos os efeitos são validados na inicialização
- Validação periódica a cada 5 minutos
- Detecta problemas antes que causem perda de dados

### 3. **Backup Automático**
- Backup antes de mudanças críticas
- Backup de emergência quando erros são detectados
- Retenção dos últimos 10 backups

### 4. **Monitoramento Contínuo**
- Verificação periódica de saúde
- Alertas automáticos sobre problemas
- Logs detalhados para debugging

## 📊 Fluxo de Dados

```
Efeito Executado
    ↓
BaseCardEffect.updateDuel() ou syncDuelState()
    ↓
syncDuelState() [CRÍTICO]
    ↓
├─→ Atualiza Cache (activeDuels)
└─→ Salva no Banco (updateDuelInDatabase)
    ↓
Dados Sincronizados ✅
```

## 🔍 Debugging e Monitoramento

### Verificar Integridade
```typescript
const report = await integrityService.validateAllEffects();
console.log(`Efeitos válidos: ${report.validEffects}/${report.totalEffects}`);
```

### Listar Backups
```typescript
const backups = await backupService.listBackups();
console.log(`Backups disponíveis: ${backups.length}`);
```

### Status do Monitoramento
```typescript
const status = monitorService.getStatus();
console.log(`Sistema saudável: ${status.isHealthy}`);
```

## ⚠️ Regras de Ouro

1. **SEMPRE use `syncDuelState`** para atualizar estado do duelo
2. **NUNCA use `activeDuels.set()` diretamente** sem salvar no banco
3. **SEMPRE use `BaseCardEffect.updateDuel()`** em efeitos complexos
4. **TESTE novos efeitos** antes de adicionar ao módulo
5. **VERIFIQUE logs** se algo não funcionar

## 🚀 Benefícios

✅ **Não perde código**: Backup automático antes de mudanças
✅ **Detecta problemas**: Validação automática de integridade
✅ **Monitora saúde**: Verificação contínua do sistema
✅ **Código limpo**: Estrutura modular e isolada
✅ **Fácil de adicionar**: Sistema simples para novos efeitos
✅ **Escalável**: Suporta crescimento sem quebrar

## 📚 Documentação Adicional

- `README.md` - Guia rápido de uso
- `ARCHITECTURE.md` - Detalhes da arquitetura
- `MIGRATION_GUIDE.md` - Como migrar efeitos antigos
- `EFFECTS_PERSISTENCE_GUIDE.md` - Guia de persistência

## 🎓 Próximos Passos

1. Migrar efeitos antigos para nova estrutura
2. Adicionar testes automatizados
3. Implementar sistema de versionamento de efeitos
4. Criar dashboard de monitoramento

