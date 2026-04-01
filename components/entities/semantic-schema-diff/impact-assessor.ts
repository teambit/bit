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
  private allRules: ImpactRule[] | undefined;

  registerDefaultRules(rules: ImpactRule[]): void {
    this.defaultRules.push(...rules);
    this.allRules = undefined;
  }

  /**
   * Register custom rules (evaluated before default rules).
   * Deduplicates — rules already registered are skipped.
   */
  registerRules(rules: ImpactRule[]): void {
    for (const rule of rules) {
      if (!this.customRules.includes(rule)) {
        this.customRules.push(rule);
        this.allRules = undefined;
      }
    }
  }

  private getRules(): ImpactRule[] {
    if (!this.allRules) {
      this.allRules = [...this.customRules, ...this.defaultRules];
    }
    return this.allRules;
  }

  assess(facts: SchemaChangeFact[]): AssessedChange[] {
    return facts.map((fact) => ({
      ...fact,
      impact: this.assessFact(fact),
    }));
  }

  assessFact(fact: SchemaChangeFact): ImpactLevel {
    for (const rule of this.getRules()) {
      const kinds = Array.isArray(rule.changeKind) ? rule.changeKind : [rule.changeKind];
      if (!kinds.includes(fact.changeKind) && !kinds.includes('*')) continue;
      const result = rule.assess(fact);
      if (result !== undefined) return result;
    }
    return 'PATCH';
  }
}
