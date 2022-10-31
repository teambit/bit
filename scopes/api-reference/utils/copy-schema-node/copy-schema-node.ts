import { DocSchema, SchemaNode, Location } from '@teambit/semantics.entities.semantic-schema';

export function copySchemaNode(
  source: SchemaNode,
  updatedKeys: {
    doc?: DocSchema;
    signature?: string;
    name?: string;
    location?: Location;
    toString?: () => string;
    toObject?: () => Record<string, any>;
  }
): SchemaNode {
  return {
    ...source,
    ...updatedKeys,
    location: updatedKeys.location || source.location,
    toString: updatedKeys.toString || source.toString,
    toObject: updatedKeys.toObject || source.toObject,
  };
}
