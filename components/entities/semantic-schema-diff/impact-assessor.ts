import type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';
import type { ImpactRule, ImpactLevel } from './impact-rule';

export type AssessedChange = SchemaChangeFact & {
  impact: ImpactLevel;
};

export function worstImpact(items: { impact: ImpactLevel }[]): ImpactLevel {
  if (items.some((d) => d.impact === 'BREAKING')) return 'BREAKING';
  if (items.some((d) => d.impact === 'NON_BREAKING')) return 'NON_BREAKING';
  return 'PATCH';
}

export class ImpactAssessor {
  private customRules: ImpactRule[] = [];
  private defaultRules: ImpactRule[] = [];

  registerDefaultRules(rules: ImpactRule[]): void {
    this.defaultRules.push(...rules);
  }

  /**
   * Register custom rules (evaluated before default rules).
   * Used by environments to override default behavior.
   */
  registerRules(rules: ImpactRule[]): void {
    this.customRules.push(...rules);
  }

  assess(facts: SchemaChangeFact[]): AssessedChange[] {
    return facts.map((fact) => ({
      ...fact,
      impact: this.assessFact(fact),
    }));
  }

  assessFact(fact: SchemaChangeFact): ImpactLevel {
    for (const rule of [...this.customRules, ...this.defaultRules]) {
      const kinds = Array.isArray(rule.changeKind) ? rule.changeKind : [rule.changeKind];
      if (!kinds.includes(fact.changeKind) && !kinds.includes('*')) continue;
      const result = rule.assess(fact);
      if (result !== undefined) return result;
    }
    return 'PATCH';
  }
}
