/* eslint-disable complexity */
/**
 * Types for semantic schema diffing.
 * Each SchemaNode subclass implements its own `diff()` method using these types.
 */

export enum SchemaChangeImpact {
  /** Removing exports, removing required params, narrowing types — consumers will break */
  BREAKING = 'BREAKING',
  /** Adding optional params, adding exports, widening types — consumers won't break */
  NON_BREAKING = 'NON_BREAKING',
  /** Doc changes, internal refactors — no runtime impact */
  PATCH = 'PATCH',
}

export type SchemaChangeDetail = {
  /** What aspect of the API changed (e.g. 'parameters', 'return-type', 'members') */
  aspect: string;
  /** Human-readable description of the change */
  description: string;
  /** Semantic impact of this particular sub-change */
  impact: SchemaChangeImpact;
  /** Previous value (stringified) */
  from?: string;
  /** New value (stringified) */
  to?: string;
};

/** Types that are supertypes of everything — widening to these is never breaking. */
const TOP_TYPES = new Set(['any', 'unknown']);

/**
 * Determine the semantic impact of a return type change.
 * Widening (specific → any/unknown) is non-breaking because consumers
 * already handled the more specific type.
 * Narrowing (any → specific) is also non-breaking — consumers get more info.
 */
export function returnTypeImpact(from: string, to: string): SchemaChangeImpact {
  if (from === to) return SchemaChangeImpact.PATCH;
  if (TOP_TYPES.has(to)) return SchemaChangeImpact.NON_BREAKING;
  if (TOP_TYPES.has(from)) return SchemaChangeImpact.NON_BREAKING;
  return SchemaChangeImpact.BREAKING;
}

/**
 * Determine the semantic impact of a parameter type change.
 * Widening (string → any) means the function accepts more — non-breaking for callers.
 * Narrowing (any → string) means callers passing other types will break.
 */
export function paramTypeImpact(from: string, to: string): SchemaChangeImpact {
  if (from === to) return SchemaChangeImpact.PATCH;
  if (TOP_TYPES.has(to)) return SchemaChangeImpact.NON_BREAKING;
  if (TOP_TYPES.has(from)) return SchemaChangeImpact.BREAKING;
  return SchemaChangeImpact.BREAKING;
}

/**
 * Human-readable singular names for schema types.
 */
const SCHEMA_DISPLAY_NAMES: Record<string, string> = {
  FunctionLikeSchema: 'Function',
  ClassSchema: 'Class',
  InterfaceSchema: 'Interface',
  TypeSchema: 'Type Alias',
  EnumSchema: 'Enum',
  VariableLikeSchema: 'Variable',
  ModuleSchema: 'Namespace',
  ReactSchema: 'React Component',
  TypeRefSchema: 'Type Reference',
  TypeUnionSchema: 'Union Type',
  TypeIntersectionSchema: 'Intersection Type',
  TypeLiteralSchema: 'Type Literal',
  TypeArraySchema: 'Array Type',
  TupleTypeSchema: 'Tuple Type',
  ParameterSchema: 'Parameter',
  ExportSchema: 'Export',
  DecoratorSchema: 'Decorator',
  ConstructorSchema: 'Constructor',
  GetAccessorSchema: 'Getter',
  SetAccessorSchema: 'Setter',
  IndexSignatureSchema: 'Index Signature',
  KeywordTypeSchema: 'Keyword Type',
  LiteralTypeSchema: 'Literal Type',
  InferenceTypeSchema: 'Inferred Type',
};

/**
 * Get human-readable display name from a raw __schema type string.
 */
export function schemaDisplayName(rawSchemaType: string, singular = true): string {
  const name = SCHEMA_DISPLAY_NAMES[rawSchemaType];
  if (name) return singular ? name : pluralize(name);
  const cleaned = rawSchemaType
    .replace(/Schema$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
  return singular ? cleaned : pluralize(cleaned);
}

function pluralize(word: string): string {
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) return `${word}es`;
  if (word.endsWith('y') && !/[aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * Render a human-readable type string from a serialized type node.
 * Handles all schema types that lack a useful `signature` or `name`.
 */
export function typeStr(node: Record<string, any> | undefined): string {
  if (!node) return 'unknown';

  switch (node.__schema) {
    case 'TypeUnionSchema':
      return (node.types || []).map((t: any) => typeStr(t)).join(' | ') || 'unknown';
    case 'TypeIntersectionSchema':
      return (node.types || []).map((t: any) => typeStr(t)).join(' & ') || 'unknown';
    case 'TypeArraySchema':
      return `${typeStr(node.type)}[]`;
    case 'TupleTypeSchema':
      return `[${(node.members || []).map((t: any) => typeStr(t)).join(', ')}]`;
    case 'InferenceTypeSchema':
      return node.type || node.name || 'inferred';
    case 'KeywordTypeSchema':
      return node.name || 'keyword';
    case 'LiteralTypeSchema':
      return node.value !== undefined ? String(node.value) : node.name || 'literal';
    case 'TypeRefSchema': {
      const base = node.name || 'Ref';
      if (node.typeArgs && node.typeArgs.length > 0) {
        return `${base}<${node.typeArgs.map((a: any) => typeStr(a)).join(', ')}>`;
      }
      return base;
    }
    case 'TypeLiteralSchema': {
      const members = (node.members || []).map((m: any) => m.signature || m.name || '').filter(Boolean);
      if (members.length <= 3) return `{ ${members.join('; ')} }`;
      return `{ ${members.slice(0, 3).join('; ')}; ... }`;
    }
    case 'ParenthesizedTypeSchema':
      return `(${typeStr(node.type)})`;
    default:
      break;
  }

  if (node.signature) return node.signature;
  if (node.name) return node.name;
  if (node.type && typeof node.type === 'string') return node.type;
  if (node.type && typeof node.type === 'object') return typeStr(node.type);
  return schemaDisplayName(node.__schema || 'unknown', true);
}

/**
 * Compare two type nodes semantically. TypeRefSchemas with the same name
 * are considered equivalent even if their internal resolution metadata differs.
 */
export function typesAreSemanticallyEqual(
  base: Record<string, any> | undefined,
  compare: Record<string, any> | undefined
): boolean {
  if (!base && !compare) return true;
  if (!base || !compare) return false;

  if (base.__schema === 'TypeRefSchema' && compare.__schema === 'TypeRefSchema') {
    if (base.name !== compare.name) return false;
    const baseArgs = base.typeArgs || [];
    const compareArgs = compare.typeArgs || [];
    if (baseArgs.length !== compareArgs.length) return false;
    return baseArgs.every((a: any, i: number) => typesAreSemanticallyEqual(a, compareArgs[i]));
  }

  return deepEqualNoLocation(base, compare);
}

/**
 * Deep equality check with location fields stripped.
 */
export function deepEqualNoLocation(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqualNoLocation(item, b[i]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a).filter((k) => k !== 'location');
    const keysB = Object.keys(b).filter((k) => k !== 'location');
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqualNoLocation(a[key], b[key]));
  }

  return false;
}

/**
 * Compare doc schemas, returning details if changed.
 */
export function diffDoc(
  baseDoc: Record<string, any> | undefined,
  compareDoc: Record<string, any> | undefined
): SchemaChangeDetail[] {
  if (deepEqualNoLocation(baseDoc, compareDoc)) return [];

  if (!baseDoc && compareDoc) {
    return [
      {
        aspect: 'documentation',
        description: 'documentation added',
        impact: SchemaChangeImpact.PATCH,
        to: compareDoc.comment || '(doc added)',
      },
    ];
  }
  if (baseDoc && !compareDoc) {
    return [
      {
        aspect: 'documentation',
        description: 'documentation removed',
        impact: SchemaChangeImpact.PATCH,
        from: baseDoc.comment || '(doc removed)',
      },
    ];
  }

  const changes: string[] = [];
  if (baseDoc?.comment !== compareDoc?.comment) changes.push('description');
  const baseTags = (baseDoc?.tags || []).map((t: any) => t.tagName || t.name).sort();
  const compareTags = (compareDoc?.tags || []).map((t: any) => t.tagName || t.name).sort();
  if (!deepEqualNoLocation(baseTags, compareTags)) changes.push('tags');
  if (changes.length === 0) changes.push('content');

  return [
    {
      aspect: 'documentation',
      description: `documentation ${changes.join(' and ')} changed`,
      impact: SchemaChangeImpact.PATCH,
      from: baseDoc?.comment,
      to: compareDoc?.comment,
    },
  ];
}
