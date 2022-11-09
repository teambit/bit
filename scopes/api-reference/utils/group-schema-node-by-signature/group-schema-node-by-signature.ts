import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import pluralize from 'pluralize';

export function sortSignatureType(
  [aType]: [string | undefined, SchemaNode[]],
  [bType]: [string | undefined, SchemaNode[]]
): 0 | 1 | -1 {
  if (!aType) return -1;
  if (!bType) return 1;
  if (aType < bType) return -1;
  if (aType > bType) return 1;
  return 0;
}

export function groupByNodeSignatureType(nodes: SchemaNode[]): Map<string | undefined, SchemaNode[]> {
  return nodes.reduce((accum, next) => {
    const { signature, __schema } = next;
    if (!signature) return accum;
    let type: string | undefined;
    if (__schema === ConstructorSchema.name) {
      type = pluralize('constructor');
    } else {
      const extractedType = signature.split(') ')[0].split('(')[1];
      type = extractedType ? pluralize(extractedType) : undefined;
    }
    const existing = accum.get(type) || [];
    accum.set(type, existing.concat(next));
    return accum;
  }, new Map<string | undefined, SchemaNode[]>());
}
