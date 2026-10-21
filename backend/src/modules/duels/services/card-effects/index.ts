/**
 * Sistema de Efeitos de Cartas
 *
 * Pasta única dos efeitos:
 *   effects/spells/
 *   effects/traps/
 *   effects/Monsters/
 *
 * Não reexporta classes NestJS aqui (evita ciclo com DuelsService).
 * Importe efeitos pelo caminho da subpasta ou pelo CardEffectsModule.
 */

export * from './interfaces/card-effect.interface';
export * from './base/card-effect.base';
export * from './registry/card-effect-registry.service';
export * from './catalog/all-effects.catalog';
