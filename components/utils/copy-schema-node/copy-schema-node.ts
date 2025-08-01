import type { SchemaNode, ISchemaNode } from '@teambit/semantics.entities.semantic-schema';

export function copySchemaNode(source: ISchemaNode, update: Partial<ISchemaNode>): SchemaNode {
  return {
    ...source,
    ...update,
    location: update.location || source.location,
    toString: update.toString || source.toString,
    toObject: update.toObject || source.toObject,
    getNodes: update.getNodes || source.getNodes,
    findNode: update.findNode || source.findNode,
    getAllNodesRecursively: update.getAllNodesRecursively || source.getAllNodesRecursively,
    displaySchemaName: update.displaySchemaName || source.displaySchemaName,
  };
}
