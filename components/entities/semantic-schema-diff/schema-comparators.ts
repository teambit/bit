import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import type { APIDiffDetail } from './api-diff-change';
import { SemanticImpact } from './api-diff-change';
import { stripLocations, deepEqual, getDisplayNameFromRaw } from './utils';

/**
 * Get a human-readable kind name from a serialized node's __schema field.
 */
function kindName(node: SerializedNode): string {
  return getDisplayNameFromRaw(node.__schema || '', true);
}

type SerializedNode = Record<string, any>;

function sigOf(node: SerializedNode | undefined): string {
  if (!node) return '';
  return node.signature || node.name || '';
}

/**
 * Render a human-readable type string from a serialized type node.
 * Handles all schema types that lack a useful `signature` or `name`.
 */
function typeStr(node: SerializedNode | undefined): string {
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
      const members = (node.members || []).map((m: any) => sigOf(m) || m.name || '').filter(Boolean);
      if (members.length <= 3) return `{ ${members.join('; ')} }`;
      return `{ ${members.slice(0, 3).join('; ')}; ... }`;
    }
    case 'ParenthesizedTypeSchema':
      return `(${typeStr(node.type)})`;
    default:
      break;
  }

  // General fallbacks
  if (node.signature) return node.signature;
  if (node.name) return node.name;
  // Last resort: render something useful rather than the class name
  if (node.type && typeof node.type === 'string') return node.type;
  if (node.type && typeof node.type === 'object') return typeStr(node.type);
  return getDisplayNameFromRaw(node.__schema || 'unknown', true);
}

/**
 * Compare two type nodes semantically. TypeRefSchemas with the same name
 * are considered equivalent even if their internal resolution metadata differs
 * (componentId, internalFilePath, etc.) since those don't affect the consumer API.
 */
function typesAreSemanticallyEqual(base: SerializedNode | undefined, compare: SerializedNode | undefined): boolean {
  if (!base && !compare) return true;
  if (!base || !compare) return false;

  // TypeRefSchema: compare by name + typeArgs, not by componentId/packageName/internalFilePath
  if (base.__schema === 'TypeRefSchema' && compare.__schema === 'TypeRefSchema') {
    if (base.name !== compare.name) return false;
    const baseArgs = base.typeArgs || [];
    const compareArgs = compare.typeArgs || [];
    if (baseArgs.length !== compareArgs.length) return false;
    return baseArgs.every((a: any, i: number) => typesAreSemanticallyEqual(a, compareArgs[i]));
  }

  // For all other types, use structural equality (with locations stripped)
  return deepEqual(stripLocations(base), stripLocations(compare));
}

// ─── Type change impact helpers ──────────────────────────────────────

/** Types that are supertypes of everything — widening to these is never breaking. */
const TOP_TYPES = new Set(['any', 'unknown']);

/**
 * Determine the semantic impact of a return type change.
 * Widening (specific → any/unknown) is non-breaking because consumers
 * already handled the more specific type.
 * Narrowing (any → specific) is also non-breaking — consumers get more info.
 * Only incompatible changes (TypeA → TypeB) are breaking.
 */
function returnTypeImpact(from: string, to: string): SemanticImpact {
  if (from === to) return SemanticImpact.PATCH;
  if (TOP_TYPES.has(to)) return SemanticImpact.NON_BREAKING; // widened
  if (TOP_TYPES.has(from)) return SemanticImpact.NON_BREAKING; // narrowed (more specific)
  return SemanticImpact.BREAKING;
}

/**
 * Determine the semantic impact of a parameter type change.
 * For params, widening (string → any) means the function accepts more — non-breaking for callers.
 * Narrowing (any → string) means callers passing other types will break.
 */
function paramTypeImpact(from: string, to: string): SemanticImpact {
  if (from === to) return SemanticImpact.PATCH;
  if (TOP_TYPES.has(to)) return SemanticImpact.NON_BREAKING; // accepts more
  if (TOP_TYPES.has(from)) return SemanticImpact.BREAKING; // accepts less
  return SemanticImpact.BREAKING;
}

/**
 * Compare destructured parameter objectBindingNodes to detect
 * added/removed bindings and default value changes.
 */
function compareDestructuredParam(base: SerializedNode, compare: SerializedNode, details: APIDiffDetail[]): void {
  const baseBindings: SerializedNode[] = base.objectBindingNodes || [];
  const compareBindings: SerializedNode[] = compare.objectBindingNodes || [];

  const baseMap = new Map<string, SerializedNode>();
  for (const b of baseBindings) baseMap.set(b.name || '', b);
  const compareMap = new Map<string, SerializedNode>();
  for (const b of compareBindings) compareMap.set(b.name || '', b);

  // Added bindings
  for (const [name] of compareMap) {
    if (!baseMap.has(name)) {
      details.push({
        aspect: 'parameters',
        description: `destructured property '${name}' added`,
        impact: SemanticImpact.NON_BREAKING,
        to: name,
      });
    }
  }

  // Removed bindings
  for (const [name] of baseMap) {
    if (!compareMap.has(name)) {
      details.push({
        aspect: 'parameters',
        description: `destructured property '${name}' removed`,
        impact: SemanticImpact.BREAKING,
        from: name,
      });
    }
  }

  // Changed bindings
  for (const [name, baseBinding] of baseMap) {
    const compareBinding = compareMap.get(name);
    if (!compareBinding) continue;

    // Default value changes
    if (baseBinding.defaultValue !== compareBinding.defaultValue) {
      if (baseBinding.defaultValue !== undefined && compareBinding.defaultValue === undefined) {
        details.push({
          aspect: 'parameters',
          description: `destructured property '${name}' default value removed (was: ${baseBinding.defaultValue})`,
          impact: SemanticImpact.PATCH,
          from: String(baseBinding.defaultValue),
        });
      } else if (baseBinding.defaultValue === undefined && compareBinding.defaultValue !== undefined) {
        details.push({
          aspect: 'parameters',
          description: `destructured property '${name}' default value added: ${compareBinding.defaultValue}`,
          impact: SemanticImpact.PATCH,
          to: String(compareBinding.defaultValue),
        });
      } else {
        details.push({
          aspect: 'parameters',
          description: `destructured property '${name}' default value changed: ${baseBinding.defaultValue} → ${compareBinding.defaultValue}`,
          impact: SemanticImpact.PATCH,
          from: String(baseBinding.defaultValue),
          to: String(compareBinding.defaultValue),
        });
      }
    }

    // Type changes within bindings
    if (baseBinding.type && compareBinding.type && !typesAreSemanticallyEqual(baseBinding.type, compareBinding.type)) {
      details.push({
        aspect: 'parameters',
        description: `destructured property '${name}' type changed: ${typeStr(baseBinding.type)} → ${typeStr(compareBinding.type)}`,
        impact: paramTypeImpact(typeStr(baseBinding.type), typeStr(compareBinding.type)),
        from: typeStr(baseBinding.type),
        to: typeStr(compareBinding.type),
      });
    }
  }
}

// ─── FunctionLikeSchema ──────────────────────────────────────────────

function compareFunctionLike(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const details: APIDiffDetail[] = [];
  const baseParams: SerializedNode[] = base.params || [];
  const compareParams: SerializedNode[] = compare.params || [];

  // Detect added parameters
  if (compareParams.length > baseParams.length) {
    const added = compareParams.slice(baseParams.length);
    for (const p of added) {
      const isOptional = p.isOptional || p.defaultValue !== undefined;
      details.push({
        aspect: 'parameters',
        description: `parameter '${p.name}: ${typeStr(p.type)}' added${isOptional ? ' (optional — non-breaking)' : ' (required — breaks existing callers)'}`,
        impact: isOptional ? SemanticImpact.NON_BREAKING : SemanticImpact.BREAKING,
        to: `${p.name}${p.isOptional ? '?' : ''}: ${typeStr(p.type)}`,
      });
    }
  }

  // Detect removed parameters
  if (baseParams.length > compareParams.length) {
    const removed = baseParams.slice(compareParams.length);
    for (const p of removed) {
      details.push({
        aspect: 'parameters',
        description: `parameter '${p.name}: ${typeStr(p.type)}' removed — callers passing this argument will break`,
        impact: SemanticImpact.BREAKING,
        from: `${p.name}${p.isOptional ? '?' : ''}: ${typeStr(p.type)}`,
      });
    }
  }

  // Compare overlapping parameters
  const minLen = Math.min(baseParams.length, compareParams.length);
  for (let i = 0; i < minLen; i++) {
    const bp = baseParams[i];
    const cp = compareParams[i];

    const typeEqual = typesAreSemanticallyEqual(bp.type, cp.type);
    const optEqual = bp.isOptional === cp.isOptional;

    // For destructured parameters, compare objectBindingNodes instead of name strings
    const isDestructured = bp.objectBindingNodes || cp.objectBindingNodes;
    if (isDestructured) {
      compareDestructuredParam(bp, cp, details);
      if (!typeEqual) {
        details.push({
          aspect: 'parameters',
          description: `parameter at position ${i} type changed: ${typeStr(bp.type)} → ${typeStr(cp.type)}`,
          impact: returnTypeImpact(typeStr(bp.type), typeStr(cp.type)),
          from: typeStr(bp.type),
          to: typeStr(cp.type),
        });
      }
      if (!optEqual) {
        if (bp.isOptional && !cp.isOptional) {
          details.push({
            aspect: 'parameters',
            description: `destructured parameter became required (was optional) — callers omitting it will break`,
            impact: SemanticImpact.BREAKING,
            from: 'optional',
            to: 'required',
          });
        } else if (!bp.isOptional && cp.isOptional) {
          details.push({
            aspect: 'parameters',
            description: `destructured parameter became optional (was required)`,
            impact: SemanticImpact.NON_BREAKING,
            from: 'required',
            to: 'optional',
          });
        }
      }
      continue;
    }

    // Non-destructured parameter comparison
    const nameEqual = bp.name === cp.name;
    const defaultEqual = bp.defaultValue === cp.defaultValue;
    if (nameEqual && typeEqual && optEqual && defaultEqual) continue;

    const paramName = cp.name || bp.name;

    if (!nameEqual) {
      details.push({
        aspect: 'parameters',
        description: `parameter at position ${i} renamed: '${bp.name}' → '${cp.name}'`,
        impact: SemanticImpact.PATCH,
        from: bp.name,
        to: cp.name,
      });
    }

    if (!typeEqual) {
      details.push({
        aspect: 'parameters',
        description: `parameter '${paramName}' type changed: ${typeStr(bp.type)} → ${typeStr(cp.type)}`,
        impact: paramTypeImpact(typeStr(bp.type), typeStr(cp.type)),
        from: typeStr(bp.type),
        to: typeStr(cp.type),
      });
    }

    if (bp.isOptional && !cp.isOptional) {
      details.push({
        aspect: 'parameters',
        description: `parameter '${paramName}' became required (was optional) — callers omitting it will break`,
        impact: SemanticImpact.BREAKING,
        from: 'optional',
        to: 'required',
      });
    } else if (!bp.isOptional && cp.isOptional) {
      details.push({
        aspect: 'parameters',
        description: `parameter '${paramName}' became optional (was required)`,
        impact: SemanticImpact.NON_BREAKING,
        from: 'required',
        to: 'optional',
      });
    }

    if (!defaultEqual) {
      details.push({
        aspect: 'parameters',
        description: `parameter '${paramName}' default value changed: ${bp.defaultValue ?? 'none'} → ${cp.defaultValue ?? 'none'}`,
        impact: SemanticImpact.PATCH,
        from: bp.defaultValue !== undefined ? String(bp.defaultValue) : undefined,
        to: cp.defaultValue !== undefined ? String(cp.defaultValue) : undefined,
      });
    }
  }

  // Return type
  if (!typesAreSemanticallyEqual(base.returnType, compare.returnType)) {
    const fromType = typeStr(base.returnType);
    const toType = typeStr(compare.returnType);
    const impact = returnTypeImpact(fromType, toType);
    const verb = impact === SemanticImpact.NON_BREAKING ? 'widened' : 'changed';
    details.push({
      aspect: 'return-type',
      description: `return type ${verb}: ${fromType} → ${toType}`,
      impact,
      from: fromType,
      to: toType,
    });
  }

  // Type parameters
  const baseTp = base.typeParams || [];
  const compareTp = compare.typeParams || [];
  if (!deepEqual(baseTp, compareTp)) {
    details.push({
      aspect: 'type-parameters',
      description: `type parameters changed: <${baseTp.join(', ') || 'none'}> → <${compareTp.join(', ') || 'none'}>`,
      impact: SemanticImpact.BREAKING,
      from: baseTp.join(', '),
      to: compareTp.join(', '),
    });
  }

  // Modifiers
  const baseMods = (base.modifiers || []).filter((m: string) => m !== 'export');
  const compareMods = (compare.modifiers || []).filter((m: string) => m !== 'export');
  if (!deepEqual(baseMods, compareMods)) {
    const addedMods = compareMods.filter((m: string) => !baseMods.includes(m));
    const removedMods = baseMods.filter((m: string) => !compareMods.includes(m));
    const parts: string[] = [];
    if (addedMods.length) parts.push(`added: ${addedMods.join(', ')}`);
    if (removedMods.length) parts.push(`removed: ${removedMods.join(', ')}`);
    // access narrowing (public → private) is breaking
    const accessNarrowed =
      removedMods.includes('public') || addedMods.includes('private') || addedMods.includes('protected');
    details.push({
      aspect: 'modifiers',
      description: `modifiers changed (${parts.join('; ')})`,
      impact: accessNarrowed ? SemanticImpact.BREAKING : SemanticImpact.PATCH,
      from: baseMods.join(', ') || 'none',
      to: compareMods.join(', ') || 'none',
    });
  }

  return details;
}

// ─── Class / Interface ───────────────────────────────────────────────

function compareMemberBased(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const details: APIDiffDetail[] = [];
  const baseMembers: SerializedNode[] = base.members || [];
  const compareMembers: SerializedNode[] = compare.members || [];

  const baseMemberMap = new Map<string, SerializedNode>();
  for (const m of baseMembers) baseMemberMap.set(m.name || m.signature || '', m);
  const compareMemberMap = new Map<string, SerializedNode>();
  for (const m of compareMembers) compareMemberMap.set(m.name || m.signature || '', m);

  // Added members
  for (const [name, member] of compareMemberMap) {
    if (!baseMemberMap.has(name)) {
      const isOptional = member.isOptional;
      const kind = kindName(member);
      details.push({
        aspect: 'members',
        description: `${kind} '${name}' added${isOptional ? ' (optional)' : ''}: ${sigOf(member)}`,
        impact: SemanticImpact.NON_BREAKING,
        to: sigOf(member) || name,
      });
    }
  }

  // Removed members
  for (const [name, member] of baseMemberMap) {
    if (!compareMemberMap.has(name)) {
      const kind = kindName(member);
      const isPublic = !(member.modifiers || []).includes('private');
      details.push({
        aspect: 'members',
        description: `${kind} '${name}' removed${isPublic ? ' — consumers using it will break' : ' (was private)'}`,
        impact: isPublic ? SemanticImpact.BREAKING : SemanticImpact.PATCH,
        from: sigOf(member) || name,
      });
    }
  }

  // Modified members
  for (const [name, baseMember] of baseMemberMap) {
    const compareMember = compareMemberMap.get(name);
    if (!compareMember || deepEqual(stripLocations(baseMember), stripLocations(compareMember))) continue;

    const kind = kindName(baseMember);
    const baseSig = sigOf(baseMember);
    const compareSig = sigOf(compareMember);

    // recurse into function-like members for deeper detail
    if (baseMember.__schema === 'FunctionLikeSchema' && compareMember.__schema === 'FunctionLikeSchema') {
      const subDetails = compareFunctionLike(stripLocations(baseMember), stripLocations(compareMember));
      for (const d of subDetails) {
        details.push({
          ...d,
          aspect: 'members',
          description: `${kind} '${name}': ${d.description}`,
        });
      }
    } else if (baseSig !== compareSig) {
      // Check if only doc changed
      const baseNoDoc = { ...stripLocations(baseMember), doc: undefined };
      const compareNoDoc = { ...stripLocations(compareMember), doc: undefined };
      if (deepEqual(baseNoDoc, compareNoDoc)) {
        details.push({
          aspect: 'members',
          description: `${kind} '${name}' documentation changed`,
          impact: SemanticImpact.PATCH,
          from: baseSig,
          to: compareSig,
        });
      } else {
        details.push({
          aspect: 'members',
          description: `${kind} '${name}' signature changed`,
          impact: SemanticImpact.BREAKING,
          from: baseSig,
          to: compareSig,
        });
      }
    } else {
      // signature same but deep structure changed (e.g. doc only)
      details.push({
        aspect: 'members',
        description: `${kind} '${name}' internal definition changed`,
        impact: SemanticImpact.PATCH,
        from: baseSig,
        to: compareSig,
      });
    }
  }

  // Type parameters
  const baseTp = base.typeParams || [];
  const compareTp = compare.typeParams || [];
  if (!deepEqual(baseTp, compareTp)) {
    details.push({
      aspect: 'type-parameters',
      description: `type parameters changed: <${baseTp.join(', ') || 'none'}> → <${compareTp.join(', ') || 'none'}>`,
      impact: SemanticImpact.BREAKING,
      from: baseTp.join(', '),
      to: compareTp.join(', '),
    });
  }

  // Extends
  if (!deepEqual(stripLocations(base.extendsNodes), stripLocations(compare.extendsNodes))) {
    const fromExt = (base.extendsNodes || []).map((n: any) => n.name || sigOf(n)).join(', ') || 'none';
    const toExt = (compare.extendsNodes || []).map((n: any) => n.name || sigOf(n)).join(', ') || 'none';
    details.push({
      aspect: 'extends',
      description: `extends changed: ${fromExt} → ${toExt}`,
      impact: SemanticImpact.BREAKING,
      from: fromExt,
      to: toExt,
    });
  }

  // Implements (ClassSchema)
  if (base.implementNodes || compare.implementNodes) {
    if (!deepEqual(stripLocations(base.implementNodes), stripLocations(compare.implementNodes))) {
      const fromImpl = (base.implementNodes || []).map((n: any) => n.name || sigOf(n)).join(', ') || 'none';
      const toImpl = (compare.implementNodes || []).map((n: any) => n.name || sigOf(n)).join(', ') || 'none';
      details.push({
        aspect: 'implements',
        description: `implements changed: ${fromImpl} → ${toImpl}`,
        impact: SemanticImpact.BREAKING,
        from: fromImpl,
        to: toImpl,
      });
    }
  }

  return details;
}

// ─── EnumSchema ──────────────────────────────────────────────────────

function compareEnum(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const details: APIDiffDetail[] = [];
  const baseMembers: SerializedNode[] = base.members || [];
  const compareMembers: SerializedNode[] = compare.members || [];

  const baseMemberMap = new Map<string, SerializedNode>();
  for (const m of baseMembers) baseMemberMap.set(m.name || '', m);
  const compareMemberMap = new Map<string, SerializedNode>();
  for (const m of compareMembers) compareMemberMap.set(m.name || '', m);

  for (const [name, member] of compareMemberMap) {
    if (!baseMemberMap.has(name)) {
      details.push({
        aspect: 'enum-members',
        description: `enum member '${name}' added`,
        impact: SemanticImpact.NON_BREAKING,
        to: sigOf(member) || name,
      });
    }
  }

  for (const [name, member] of baseMemberMap) {
    if (!compareMemberMap.has(name)) {
      details.push({
        aspect: 'enum-members',
        description: `enum member '${name}' removed — consumers referencing it will break`,
        impact: SemanticImpact.BREAKING,
        from: sigOf(member) || name,
      });
    }
  }

  for (const [name, baseMember] of baseMemberMap) {
    const compareMember = compareMemberMap.get(name);
    if (compareMember && !deepEqual(stripLocations(baseMember), stripLocations(compareMember))) {
      details.push({
        aspect: 'enum-members',
        description: `enum member '${name}' value changed`,
        impact: SemanticImpact.BREAKING,
        from: sigOf(baseMember) || name,
        to: sigOf(compareMember) || name,
      });
    }
  }

  return details;
}

// ─── TypeSchema ──────────────────────────────────────────────────────

function compareType(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const details: APIDiffDetail[] = [];

  if (!typesAreSemanticallyEqual(base.type, compare.type)) {
    details.push({
      aspect: 'type-definition',
      description: `type definition changed`,
      impact: SemanticImpact.BREAKING,
      from: base.signature,
      to: compare.signature,
    });
  }

  return details;
}

// ─── VariableLikeSchema ──────────────────────────────────────────────

function compareVariableLike(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const details: APIDiffDetail[] = [];

  if (!typesAreSemanticallyEqual(base.type, compare.type)) {
    details.push({
      aspect: 'type-annotation',
      description: `type changed: ${typeStr(base.type)} → ${typeStr(compare.type)}`,
      impact: SemanticImpact.BREAKING,
      from: typeStr(base.type),
      to: typeStr(compare.type),
    });
  }

  if (base.isOptional && !compare.isOptional) {
    details.push({
      aspect: 'modifiers',
      description: `became required (was optional)`,
      impact: SemanticImpact.BREAKING,
      from: 'optional',
      to: 'required',
    });
  } else if (!base.isOptional && compare.isOptional) {
    details.push({
      aspect: 'modifiers',
      description: `became optional (was required)`,
      impact: SemanticImpact.NON_BREAKING,
      from: 'required',
      to: 'optional',
    });
  }

  if (base.defaultValue !== compare.defaultValue) {
    details.push({
      aspect: 'default-value',
      description: `default value changed: ${base.defaultValue ?? 'none'} → ${compare.defaultValue ?? 'none'}`,
      impact: SemanticImpact.PATCH,
      from: base.defaultValue !== undefined ? String(base.defaultValue) : undefined,
      to: compare.defaultValue !== undefined ? String(compare.defaultValue) : undefined,
    });
  }

  return details;
}

// ─── Default comparator ──────────────────────────────────────────────

function compareDefault(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const details: APIDiffDetail[] = [];

  // Check if only doc changed
  const baseNoDoc = { ...base, doc: undefined };
  const compareNoDoc = { ...compare, doc: undefined };
  if (deepEqual(baseNoDoc, compareNoDoc)) {
    details.push({
      aspect: 'documentation',
      description: 'documentation changed',
      impact: SemanticImpact.PATCH,
      from: base.signature,
      to: compare.signature,
    });
    return details;
  }

  if (base.signature !== compare.signature) {
    details.push({
      aspect: 'signature',
      description: `signature changed`,
      impact: SemanticImpact.BREAKING,
      from: base.signature,
      to: compare.signature,
    });
  }

  return details;
}

// ─── Doc changes (common to all types) ───────────────────────────────

function compareDoc(base: SerializedNode, compare: SerializedNode): APIDiffDetail[] {
  const baseDoc = base.doc;
  const compareDoc = compare.doc;
  if (deepEqual(stripLocations(baseDoc), stripLocations(compareDoc))) return [];

  if (!baseDoc && compareDoc) {
    return [
      {
        aspect: 'documentation',
        description: 'documentation added',
        impact: SemanticImpact.PATCH,
        to: compareDoc.comment || '(doc added)',
      },
    ];
  }
  if (baseDoc && !compareDoc) {
    return [
      {
        aspect: 'documentation',
        description: 'documentation removed',
        impact: SemanticImpact.PATCH,
        from: baseDoc.comment || '(doc removed)',
      },
    ];
  }

  const changes: string[] = [];
  if (baseDoc?.comment !== compareDoc?.comment) changes.push('description');

  const baseTags = (baseDoc?.tags || []).map((t: any) => t.tagName || t.name).sort();
  const compareTags = (compareDoc?.tags || []).map((t: any) => t.tagName || t.name).sort();
  if (!deepEqual(baseTags, compareTags)) changes.push('tags');

  if (changes.length === 0) changes.push('content');

  return [
    {
      aspect: 'documentation',
      description: `documentation ${changes.join(' and ')} changed`,
      impact: SemanticImpact.PATCH,
      from: baseDoc?.comment,
      to: compareDoc?.comment,
    },
  ];
}

// ─── Main dispatcher ─────────────────────────────────────────────────

export function computeDetailedDiff(baseNode: SchemaNode, compareNode: SchemaNode): APIDiffDetail[] {
  const baseObj = stripLocations(baseNode.toObject());
  const compareObj = stripLocations(compareNode.toObject());
  const schemaType = baseObj.__schema || compareObj.__schema;

  let structuralDetails: APIDiffDetail[];
  switch (schemaType) {
    case 'FunctionLikeSchema':
      structuralDetails = compareFunctionLike(baseObj, compareObj);
      break;
    case 'ClassSchema':
    case 'InterfaceSchema':
      structuralDetails = compareMemberBased(baseObj, compareObj);
      break;
    case 'EnumSchema':
      structuralDetails = compareEnum(baseObj, compareObj);
      break;
    case 'TypeSchema':
      structuralDetails = compareType(baseObj, compareObj);
      break;
    case 'VariableLikeSchema':
      structuralDetails = compareVariableLike(baseObj, compareObj);
      break;
    default:
      structuralDetails = compareDefault(baseObj, compareObj);
      break;
  }

  const docDetails = compareDoc(baseObj, compareObj);

  return [...structuralDetails, ...docDetails];
}
