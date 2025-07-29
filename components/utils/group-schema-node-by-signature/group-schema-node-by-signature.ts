import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import pluralize from 'pluralize';

export function sortSignatureType(
  [aType]: [string | undefined, SchemaNode[]],
  [bType]: [string | undefined, SchemaNode[]]
): 0 | 1 | -1 {
  if (!aType) return -1;
  if (!bType) return 1;
  if (aType === 'constructors') return -1;
  if (bType === 'constructors') return 1;
  if (aType === 'properties') return -1;
  if (bType === 'properties') return 1;
  if (aType < bType) return -1;
  if (aType > bType) return 1;
  return 0;
}

export function groupByNodeSignatureType(nodes: SchemaNode[]): Map<string | undefined, SchemaNode[]> {
  return nodes.reduce((acc, next) => {
    const { signature, __schema } = next;
    if (!signature) return acc;
    let type: string | undefined;

    if (__schema === ConstructorSchema.name) {
      type = pluralize('constructor');
    }

    if (!type && signature.startsWith('(') && signature.includes('):')) {
      type = pluralize('method');
    }

    if (!type && signature.startsWith('[') && signature.includes(']:')) {
      type = pluralize('property');
    }

    if (!type) {
      const extractedType = signature.split(') ')[0].split('(')[1];
      type = extractedType ? pluralize(extractedType) : undefined;
    }

    const existing = acc.get(type) || [];
    acc.set(type, existing.concat(next));
    return acc;
  }, new Map<string | undefined, SchemaNode[]>());
}
