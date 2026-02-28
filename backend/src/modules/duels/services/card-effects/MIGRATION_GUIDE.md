# Guia de Migração para o Novo Sistema de Efeitos

## Por que migrar?

O novo sistema oferece:
- ✅ **Isolamento total**: Cada efeito não interfere com outros
- ✅ **Manutenibilidade**: Fácil encontrar e corrigir bugs
- ✅ **Testabilidade**: Testar efeitos isoladamente
- ✅ **Escalabilidade**: Adicionar novos efeitos sem quebrar existentes
- ✅ **Rastreabilidade**: Logs claros de qual efeito está sendo executado

## Estratégia de Migração

### Fase 1: Migração Gradual (Recomendado)
1. Migrar efeitos críticos primeiro (que mais bugam)
2. Manter código antigo funcionando em paralelo
3. Testar cada migração isoladamente
4. Remover código antigo apenas após validação completa

### Fase 2: Migração Completa
1. Migrar todos os efeitos para o novo sistema
2. Remover código antigo do `duels.service.ts`
3. Atualizar testes

## Como Migrar um Efeito

### Exemplo: Migrando Pot of Greed

#### ANTES (código antigo em `duels.service.ts`):
```typescript
// Pot of Greed - Comprar 2 cartas
if (isCard(['pot of greed'], ['PotOfGreed'])) {
  logger.info(`✨ [processCardEffect] Processando efeito de Pot of Greed`);
  
  // Comprar 2 cartas
  for (let i = 0; i < 2; i++) {
    await this.drawCard(duelId, userId);
  }
  
  // ... resto do código
}
```

#### DEPOIS (novo sistema):
1. Criar arquivo `effects/pot-of-greed.effect.ts` (já criado)
2. Registrar no `card-effects.module.ts`
3. O sistema automaticamente usará o novo efeito

### Passos Detalhados

1. **Criar arquivo do efeito**
   ```typescript
   // effects/nome-da-carta.effect.ts
   @Injectable()
   export class NomeDaCartaEffect extends BaseCardEffect {
     readonly cardNames = ['nome da carta'];
     readonly cardIds = ['NomeDaCarta'];
     
     async process(context: CardEffectContext): Promise<CardEffectResult> {
       // Copiar lógica do código antigo aqui
       // Adaptar para usar métodos da classe base
     }
   }
   ```

2. **Registrar no módulo**
   ```typescript
   // card-effects.module.ts
   import { NomeDaCartaEffect } from './effects/nome-da-carta.effect';
   
   @Module({
     providers: [
       // ... outros
       NomeDaCartaEffect,
     ],
   })
   export class CardEffectsModule {
     constructor(
       // ... outros
       private readonly nomeDaCartaEffect: NomeDaCartaEffect,
     ) {}
     
     onModuleInit() {
       // ... outros
       this.registry.register(NomeDaCartaEffect, this.nomeDaCartaEffect);
     }
   }
   ```

3. **Atualizar CardEffectsService**
   ```typescript
   // card-effects.service.ts
   async processCardEffect(...): Promise<boolean> {
     // Tentar novo sistema primeiro
     const effect = this.registry.findEffect(card);
     if (effect) {
       const context = this.createContext(...);
       const result = await effect.process(context);
       return result.createdPendingChoice || false;
     }
     
     // Fallback para código antigo (durante migração)
     return this.duelsService.processCardEffect(...);
   }
   ```

4. **Testar isoladamente**
   - Criar teste unitário para o novo efeito
   - Testar em duelo real
   - Validar que funciona igual ao antigo

5. **Remover código antigo** (após validação)
   - Remover do `duels.service.ts`
   - Atualizar testes

## Checklist de Migração

- [ ] Criar arquivo do efeito em `effects/`
- [ ] Implementar método `process()`
- [ ] Implementar `canActivate()` se necessário
- [ ] Implementar `needsPlayerChoice()` se necessário
- [ ] Registrar no módulo
- [ ] Testar isoladamente
- [ ] Validar em duelo real
- [ ] Remover código antigo
- [ ] Atualizar documentação

## Prioridade de Migração

### Alta Prioridade (bugam mais)
1. Mystical Space Typhoon
2. Change of Heart
3. Brain Control
4. Monster Reborn
5. Graceful Charity
6. Confiscation
7. The Forceful Sentry

### Média Prioridade
1. Pot of Greed
2. Raigeki
3. Dark Hole
4. Heavy Storm
5. Harpie's Feather Duster

### Baixa Prioridade (funcionam bem)
1. Upstart Goblin
2. Hinotama
3. Waboku
4. Banner of Courage

## Notas Importantes

- **NUNCA delete código antigo** até validar completamente o novo
- **SEMPRE teste isoladamente** antes de integrar
- **MANTENHA logs** para rastreabilidade
- **DOCUMENTE mudanças** no arquivo do efeito

