import type { ImpactRule, ImpactLevel } from './impact-rule';
import type { SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';

const TOP_TYPES = new Set(['any', 'unknown']);

function typeChangeImpact(fact: SchemaChangeFact): ImpactLevel | undefined {
  const { fromType, toType, position } = fact.context;
  if (fromType === toType) return 'PATCH';

  if (position === 'return-type') {
    // Widening return (specific -> any) or narrowing return (any -> specific) are both non-breaking
    if (TOP_TYPES.has(toType) || TOP_TYPES.has(fromType)) return 'NON_BREAKING';
    return 'BREAKING';
  }

  // For parameters: widening accepts more (non-breaking), narrowing breaks callers
  if (TOP_TYPES.has(toType)) return 'NON_BREAKING';
  return 'BREAKING';
}

/**
 * Default impact rules shipped with Bit.
 * Can be overridden by registering custom rules via `schema.registerImpactRules()`.
 * Rules are evaluated in order -- first match wins.
 */
export const DEFAULT_IMPACT_RULES: ImpactRule[] = [
  {
    changeKind: 'export-added',
    assess: () => 'NON_BREAKING',
  },
  {
    changeKind: 'export-removed',
    assess: (fact) => (fact.context.isPublic ? 'BREAKING' : 'PATCH'),
  },
  {
    changeKind: ['member-removed', 'parameter-removed', 'enum-member-removed', 'destructured-property-removed'],
    assess: (fact) => (fact.context.isPublic !== false ? 'BREAKING' : 'PATCH'),
  },
  {
    changeKind: ['member-added', 'enum-member-added', 'destructured-property-added'],
    assess: () => 'NON_BREAKING',
  },
  {
    changeKind: 'parameter-added',
    assess: (fact) => (fact.context.isOptional || fact.context.hasDefault ? 'NON_BREAKING' : 'BREAKING'),
  },
  {
    changeKind: [
      'parameter-type-changed',
      'return-type-changed',
      'type-definition-changed',
      'type-annotation-changed',
      'destructured-property-type-changed',
    ],
    assess: typeChangeImpact,
  },
  {
    changeKind: 'member-signature-changed',
    assess: () => 'BREAKING',
  },
  {
    changeKind: ['member-definition-changed', 'member-documentation-changed'],
    assess: () => 'PATCH',
  },
  {
    changeKind: 'enum-member-value-changed',
    assess: () => 'BREAKING',
  },
  // Removing a default value is breaking -- callers who relied on it will get undefined
  {
    changeKind: ['destructured-property-default-removed', 'parameter-default-removed'],
    assess: () => 'BREAKING',
  },
  {
    changeKind: [
      'parameter-default-added',
      'parameter-default-changed',
      'destructured-property-default-added',
      'destructured-property-default-changed',
    ],
    assess: () => 'PATCH',
  },
  {
    changeKind: 'became-required',
    assess: () => 'BREAKING',
  },
  {
    changeKind: 'became-optional',
    assess: () => 'NON_BREAKING',
  },
  {
    changeKind: 'access-narrowed',
    assess: () => 'BREAKING',
  },
  {
    changeKind: 'modifiers-changed',
    assess: () => 'PATCH',
  },
  {
    changeKind: ['type-parameters-changed', 'extends-changed', 'implements-changed'],
    assess: () => 'BREAKING',
  },
  {
    changeKind: ['documentation-changed', 'documentation-added', 'documentation-removed'],
    assess: () => 'PATCH',
  },
  {
    changeKind: 'parameter-renamed',
    assess: () => 'PATCH',
  },
  {
    changeKind: 'signature-changed',
    assess: () => 'BREAKING',
  },
  {
    changeKind: '*',
    assess: () => 'BREAKING',
  },
];
