import type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';

export type ImpactLevel = 'BREAKING' | 'NON_BREAKING' | 'PATCH';

/**
 * An impact rule maps a change kind to an impact level.
 * Rules are evaluated in order — first match wins.
 * Return `undefined` to defer to the next rule.
 */
export type ImpactRule = {
  /** Which changeKind(s) this rule applies to. '*' = catch-all. */
  changeKind: string | string[];
  /** Assess the impact of a change fact. Return undefined to defer to the next rule. */
  assess(fact: SchemaChangeFact): ImpactLevel | undefined;
};
