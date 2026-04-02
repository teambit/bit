export type SchemaChangeFact = {
  changeKind: string;
  description: string;
  /** Structured metadata for the impact assessor to reason about. */
  context: Record<string, any>;
  from?: string;
  to?: string;
};

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

type TypeRenderer = (node: Record<string, any>) => string;

const TYPE_RENDERERS: Record<string, TypeRenderer> = {
  TypeUnionSchema: (n) => (n.types || []).map((t: any) => typeStr(t)).join(' | ') || 'unknown',
  TypeIntersectionSchema: (n) => (n.types || []).map((t: any) => typeStr(t)).join(' & ') || 'unknown',
  TypeArraySchema: (n) => `${typeStr(n.type)}[]`,
  TupleTypeSchema: (n) => `[${(n.members || []).map((t: any) => typeStr(t)).join(', ')}]`,
  InferenceTypeSchema: (n) => n.type || n.name || 'inferred',
  KeywordTypeSchema: (n) => n.name || 'keyword',
  LiteralTypeSchema: (n) => (n.value !== undefined ? String(n.value) : n.name || 'literal'),
  TypeRefSchema: (n) => {
    const base = n.name || 'Ref';
    return n.typeArgs?.length ? `${base}<${n.typeArgs.map((a: any) => typeStr(a)).join(', ')}>` : base;
  },
  TypeLiteralSchema: (n) => {
    const members = (n.members || []).map((m: any) => m.signature || m.name || '').filter(Boolean);
    return members.length <= 3 ? `{ ${members.join('; ')} }` : `{ ${members.slice(0, 3).join('; ')}; ... }`;
  },
  ParenthesizedTypeSchema: (n) => `(${typeStr(n.type)})`,
};

export function typeStr(node: Record<string, any> | undefined): string {
  if (!node) return 'unknown';
  const renderer = TYPE_RENDERERS[node.__schema];
  if (renderer) return renderer(node);
  return node.signature || node.name || typeStrFallback(node);
}

function typeStrFallback(node: Record<string, any>): string {
  if (node.type && typeof node.type === 'string') return node.type;
  if (node.type && typeof node.type === 'object') return typeStr(node.type);
  return schemaDisplayName(node.__schema || 'unknown', true);
}

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
