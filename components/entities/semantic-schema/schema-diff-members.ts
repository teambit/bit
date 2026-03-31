/**
 * Shared diff logic for member-based schemas (ClassSchema, InterfaceSchema).
 */
import type { SchemaNode } from './schema-node';
import type { SchemaChangeFact } from './schema-diff';
import { deepEqualNoLocation, diffDoc, schemaDisplayName, typeStr } from './schema-diff';

export function diffMembers(
  baseObj: Record<string, any>,
  compareObj: Record<string, any>,
  baseNode: SchemaNode,
  compareNode: SchemaNode
): SchemaChangeFact[] {
  const details: SchemaChangeFact[] = [];
  const baseMembers: Record<string, any>[] = baseObj.members || [];
  const compareMembers: Record<string, any>[] = compareObj.members || [];

  const baseMemberMap = new Map(baseMembers.map((m) => [m.name || m.signature || '', m]));
  const compareMemberMap = new Map(compareMembers.map((m) => [m.name || m.signature || '', m]));

  for (const [name, member] of compareMemberMap) {
    if (!baseMemberMap.has(name)) {
      const kind = schemaDisplayName(member.__schema || '', true);
      details.push({
        changeKind: 'member-added',
        description: `${kind} '${name}' added${member.isOptional ? ' (optional)' : ''}: ${member.signature || name}`,
        context: {
          memberName: name,
          memberKind: kind,
          isOptional: !!member.isOptional,
          signature: member.signature || name,
        },
        to: member.signature || name,
      });
    }
  }

  for (const [name, member] of baseMemberMap) {
    if (!compareMemberMap.has(name)) {
      const kind = schemaDisplayName(member.__schema || '', true);
      const isPublic = !(member.modifiers || []).includes('private');
      details.push({
        changeKind: 'member-removed',
        description: `${kind} '${name}' removed${isPublic ? ' — consumers using it will break' : ' (was private)'}`,
        context: { memberName: name, memberKind: kind, isPublic, signature: member.signature || name },
        from: member.signature || name,
      });
    }
  }

  for (const [name, baseMember] of baseMemberMap) {
    const compareMember = compareMemberMap.get(name);
    if (!compareMember) continue;

    const baseNoLoc = { ...baseMember, location: undefined };
    const compNoLoc = { ...compareMember, location: undefined };
    if (deepEqualNoLocation(baseNoLoc, compNoLoc)) continue;

    const kind = schemaDisplayName(baseMember.__schema || '', true);

    // If both are function-like, delegate to their own diff
    if (baseMember.__schema === 'FunctionLikeSchema' && compareMember.__schema === 'FunctionLikeSchema') {
      // Reconstruct nodes from the member arrays and delegate
      const baseMemberNodes = (baseNode as any).members as SchemaNode[];
      const compareMemberNodes = (compareNode as any).members as SchemaNode[];
      const bNode = baseMemberNodes?.find((n: any) => n.name === name);
      const cNode = compareMemberNodes?.find((n: any) => n.name === name);
      if (bNode && cNode) {
        const subDetails = bNode.diff(cNode);
        for (const d of subDetails) {
          details.push({ ...d, description: `${kind} '${name}': ${d.description}` });
        }
        continue;
      }
    }

    // Check doc-only change
    const baseNoDoc = { ...baseNoLoc, doc: undefined };
    const compNoDoc = { ...compNoLoc, doc: undefined };
    if (deepEqualNoLocation(baseNoDoc, compNoDoc)) {
      details.push({
        changeKind: 'member-documentation-changed',
        description: `${kind} '${name}' documentation changed`,
        context: { memberName: name, memberKind: kind },
        from: baseMember.signature || name,
        to: compareMember.signature || name,
      });
    } else if (baseMember.signature !== compareMember.signature) {
      details.push({
        changeKind: 'member-signature-changed',
        description: `${kind} '${name}' signature changed`,
        context: { memberName: name, memberKind: kind },
        from: baseMember.signature || name,
        to: compareMember.signature || name,
      });
    } else {
      details.push({
        changeKind: 'member-definition-changed',
        description: `${kind} '${name}' internal definition changed`,
        context: { memberName: name, memberKind: kind },
        from: baseMember.signature || name,
        to: compareMember.signature || name,
      });
    }
  }

  // Type parameters
  if (!deepEqualNoLocation(baseObj.typeParams, compareObj.typeParams)) {
    const from = (baseObj.typeParams || []).join(', ');
    const to = (compareObj.typeParams || []).join(', ');
    details.push({
      changeKind: 'type-parameters-changed',
      description: `type parameters changed: <${from || 'none'}> → <${to || 'none'}>`,
      context: { from, to },
      from,
      to,
    });
  }

  // Extends
  if (!deepEqualNoLocation(baseObj.extendsNodes, compareObj.extendsNodes)) {
    const fromExt = (baseObj.extendsNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
    const toExt = (compareObj.extendsNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
    details.push({
      changeKind: 'extends-changed',
      description: `extends changed: ${fromExt} → ${toExt}`,
      context: { from: fromExt, to: toExt },
      from: fromExt,
      to: toExt,
    });
  }

  // Implements (ClassSchema)
  if (baseObj.implementNodes || compareObj.implementNodes) {
    if (!deepEqualNoLocation(baseObj.implementNodes, compareObj.implementNodes)) {
      const fromImpl = (baseObj.implementNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
      const toImpl = (compareObj.implementNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
      details.push({
        changeKind: 'implements-changed',
        description: `implements changed: ${fromImpl} → ${toImpl}`,
        context: { from: fromImpl, to: toImpl },
        from: fromImpl,
        to: toImpl,
      });
    }
  }

  details.push(...diffDoc(baseObj.doc, compareObj.doc));
  return details;
}
