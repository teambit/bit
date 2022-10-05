import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import pluralize from 'pluralize';

export function sortSignatureType([aType]: [string, SchemaNode[]], [bType]: [string, SchemaNode[]]): 0 | 1 | -1 {
  if (aType < bType) return -1;
  if (aType > bType) return 1;
  return 0;
}

export function groupByNodeSignatureType(nodes: SchemaNode[]): Map<string, SchemaNode[]> {
  return nodes.reduce((accum, next) => {
    const { signature, __schema } = next;
    if (!signature) return accum;
    const type =
      __schema === ConstructorSchema.name
        ? pluralize('constructor')
        : pluralize(signature.split(') ')[0].split('(')[1] || '');
    const existing = accum.get(type) || [];
    accum.set(type, existing.concat(next));
    return accum;
  }, new Map<string, SchemaNode[]>());
}
