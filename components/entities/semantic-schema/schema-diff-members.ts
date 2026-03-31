import type { SchemaNode } from './schema-node';
import type { SchemaChangeFact } from './schema-diff';
import { deepEqualNoLocation, diffDoc, schemaDisplayName, typeStr } from './schema-diff';

type MemberMap = Map<string, Record<string, any>>;

const MEMBER_CHANGE_LABELS: Record<string, string> = {
  'member-documentation-changed': 'documentation changed',
  'member-signature-changed': 'signature changed',
  'member-definition-changed': 'internal definition changed',
};

function memberKey(m: Record<string, any>): string {
  return m.name || m.signature || '';
}

function toMemberMap(members: Record<string, any>[]): MemberMap {
  return new Map(members.map((m) => [memberKey(m), m]));
}

function classifyMemberChange(base: Record<string, any>, compare: Record<string, any>): string {
  const baseStripped = { ...base, location: undefined, doc: undefined };
  const compareStripped = { ...compare, location: undefined, doc: undefined };
  if (deepEqualNoLocation(baseStripped, compareStripped)) return 'member-documentation-changed';
  if (base.signature !== compare.signature) return 'member-signature-changed';
  return 'member-definition-changed';
}

function diffAddedMembers(compareMemberMap: MemberMap, baseMemberMap: MemberMap): SchemaChangeFact[] {
  const facts: SchemaChangeFact[] = [];
  for (const [name, member] of compareMemberMap) {
    if (baseMemberMap.has(name)) continue;
    const kind = schemaDisplayName(member.__schema || '', true);
    facts.push({
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
  return facts;
}

function diffRemovedMembers(baseMemberMap: MemberMap, compareMemberMap: MemberMap): SchemaChangeFact[] {
  const facts: SchemaChangeFact[] = [];
  for (const [name, member] of baseMemberMap) {
    if (compareMemberMap.has(name)) continue;
    const kind = schemaDisplayName(member.__schema || '', true);
    const isPublic = !(member.modifiers || []).includes('private');
    facts.push({
      changeKind: 'member-removed',
      description: `${kind} '${name}' removed${isPublic ? ' — consumers using it will break' : ' (was private)'}`,
      context: { memberName: name, memberKind: kind, isPublic, signature: member.signature || name },
      from: member.signature || name,
    });
  }
  return facts;
}

function diffModifiedMembers(
  baseMemberMap: MemberMap,
  compareMemberMap: MemberMap,
  baseNode: SchemaNode,
  compareNode: SchemaNode
): SchemaChangeFact[] {
  const facts: SchemaChangeFact[] = [];
  for (const [name, baseMember] of baseMemberMap) {
    const compareMember = compareMemberMap.get(name);
    if (!compareMember) continue;
    if (deepEqualNoLocation({ ...baseMember, location: undefined }, { ...compareMember, location: undefined }))
      continue;

    const kind = schemaDisplayName(baseMember.__schema || '', true);

    if (baseMember.__schema === 'FunctionLikeSchema' && compareMember.__schema === 'FunctionLikeSchema') {
      const bNode = ((baseNode as any).members as SchemaNode[])?.find((n: any) => n.name === name);
      const cNode = ((compareNode as any).members as SchemaNode[])?.find((n: any) => n.name === name);
      if (bNode && cNode) {
        for (const d of bNode.diff(cNode)) {
          facts.push({ ...d, description: `${kind} '${name}': ${d.description}` });
        }
        continue;
      }
    }

    const changeKind = classifyMemberChange(baseMember, compareMember);
    facts.push({
      changeKind,
      description: `${kind} '${name}' ${MEMBER_CHANGE_LABELS[changeKind]}`,
      context: { memberName: name, memberKind: kind },
      from: baseMember.signature || name,
      to: compareMember.signature || name,
    });
  }
  return facts;
}

function diffStructural(baseObj: Record<string, any>, compareObj: Record<string, any>): SchemaChangeFact[] {
  const facts: SchemaChangeFact[] = [];

  if (!deepEqualNoLocation(baseObj.typeParams, compareObj.typeParams)) {
    const from = (baseObj.typeParams || []).join(', ');
    const to = (compareObj.typeParams || []).join(', ');
    facts.push({
      changeKind: 'type-parameters-changed',
      description: `type parameters changed: <${from || 'none'}> → <${to || 'none'}>`,
      context: { from, to },
      from,
      to,
    });
  }

  if (!deepEqualNoLocation(baseObj.extendsNodes, compareObj.extendsNodes)) {
    const from = (baseObj.extendsNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
    const to = (compareObj.extendsNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
    facts.push({
      changeKind: 'extends-changed',
      description: `extends changed: ${from} → ${to}`,
      context: { from, to },
      from,
      to,
    });
  }

  if (
    (baseObj.implementNodes || compareObj.implementNodes) &&
    !deepEqualNoLocation(baseObj.implementNodes, compareObj.implementNodes)
  ) {
    const from = (baseObj.implementNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
    const to = (compareObj.implementNodes || []).map((n: any) => n.name || typeStr(n)).join(', ') || 'none';
    facts.push({
      changeKind: 'implements-changed',
      description: `implements changed: ${from} → ${to}`,
      context: { from, to },
      from,
      to,
    });
  }

  return facts;
}

export function diffMembers(
  baseObj: Record<string, any>,
  compareObj: Record<string, any>,
  baseNode: SchemaNode,
  compareNode: SchemaNode
): SchemaChangeFact[] {
  const baseMemberMap = toMemberMap(baseObj.members || []);
  const compareMemberMap = toMemberMap(compareObj.members || []);

  return [
    ...diffAddedMembers(compareMemberMap, baseMemberMap),
    ...diffRemovedMembers(baseMemberMap, compareMemberMap),
    ...diffModifiedMembers(baseMemberMap, compareMemberMap, baseNode, compareNode),
    ...diffStructural(baseObj, compareObj),
    ...diffDoc(baseObj.doc, compareObj.doc),
  ];
}
