import { SchemaNode, ISchemaNode } from '@teambit/semantics.entities.semantic-schema';

export function copySchemaNode(source: ISchemaNode, update: Partial<ISchemaNode>): SchemaNode {
  return {
    ...source,
    ...update,
    location: update.location || source.location,
    toString: update.toString || source.toString,
    toObject: update.toObject || source.toObject,
    getChildren: update.getChildren || source.getChildren,
    findNode: update.findNode || source.findNode,
  };
}
