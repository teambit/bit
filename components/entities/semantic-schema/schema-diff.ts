/**
 * Types and utilities for semantic schema diffing.
 *
 * Schema `diff()` methods return neutral `SchemaChangeFact[]` — descriptions of what changed
 * with structured context metadata. Impact assessment (BREAKING/NON_BREAKING/PATCH) is handled
 * by a separate ImpactAssessor layer that can be customized per environment.
 */

/**
 * A neutral description of a single schema change.
 * Contains no impact judgment — that's the assessor's job.
 */
export type SchemaChangeFact = {
  /** Well-known change kind identifier (like a lint rule ID) */
  changeKind: string;
  /** Human-readable description */
  description: string;
  /** Structured metadata for the impact assessor to reason about */
  context: Record<string, any>;
  /** Previous value (stringified) */
  from?: string;
  /** New value (stringified) */
  to?: string;
};

// ─── Display name utilities ──────────────────────────────────────────

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

// ─── Type rendering ──────────────────────────────────────────────────

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

// ─── Comparison utilities ────────────────────────────────────────────

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

// ─── Doc diffing (returns facts) ─────────────────────────────────────

export function diffDoc(
  baseDoc: Record<string, any> | undefined,
  compareDoc: Record<string, any> | undefined
): SchemaChangeFact[] {
  if (deepEqualNoLocation(baseDoc, compareDoc)) return [];

  if (!baseDoc && compareDoc) {
    return [
      {
        changeKind: 'documentation-added',
        description: 'documentation added',
        context: {},
        to: compareDoc.comment || '(doc added)',
      },
    ];
  }
  if (baseDoc && !compareDoc) {
    return [
      {
        changeKind: 'documentation-removed',
        description: 'documentation removed',
        context: {},
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
      changeKind: 'documentation-changed',
      description: `documentation ${changes.join(' and ')} changed`,
      context: {},
      from: baseDoc?.comment,
      to: compareDoc?.comment,
    },
  ];
}
