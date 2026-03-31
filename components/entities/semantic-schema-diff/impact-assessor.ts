import type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';
import type { ImpactRule, ImpactLevel } from './impact-rule';

/**
 * A change fact with assessed impact.
 * This is what consumers see after the assessor processes raw facts.
 */
export type AssessedChange = SchemaChangeFact & {
  impact: ImpactLevel;
};

/**
 * Runs schema change facts through impact rules to produce assessed changes.
 *
 * Rules are evaluated in registration order — first match wins.
 * Custom rules registered later take priority over defaults
 * (they're prepended, not appended).
 */
export class ImpactAssessor {
  /** Custom rules (higher priority, evaluated first) */
  private customRules: ImpactRule[] = [];
  /** Default rules (lower priority, evaluated last) */
  private defaultRules: ImpactRule[] = [];

  /**
   * Register default rules (evaluated after custom rules).
   */
  registerDefaultRules(rules: ImpactRule[]): void {
    this.defaultRules.push(...rules);
  }

  /**
   * Register custom rules (evaluated before default rules).
   * This is used by environments to override default behavior.
   */
  registerRules(rules: ImpactRule[]): void {
    this.customRules.push(...rules);
  }

  /**
   * Assess a list of change facts, producing assessed changes with impact levels.
   */
  assess(facts: SchemaChangeFact[]): AssessedChange[] {
    return facts.map((fact) => ({
      ...fact,
      impact: this.assessFact(fact),
    }));
  }

  /**
   * Assess a single change fact.
   */
  assessFact(fact: SchemaChangeFact): ImpactLevel {
    // Custom rules first (higher priority)
    for (const rule of this.customRules) {
      const result = this.tryRule(rule, fact);
      if (result !== undefined) return result;
    }
    // Then default rules
    for (const rule of this.defaultRules) {
      const result = this.tryRule(rule, fact);
      if (result !== undefined) return result;
    }
    // No rule matched — default to PATCH
    return 'PATCH';
  }

  private tryRule(rule: ImpactRule, fact: SchemaChangeFact): ImpactLevel | undefined {
    const kinds = Array.isArray(rule.changeKind) ? rule.changeKind : [rule.changeKind];
    if (!kinds.includes(fact.changeKind) && !kinds.includes('*')) return undefined;
    return rule.assess(fact);
  }
}
