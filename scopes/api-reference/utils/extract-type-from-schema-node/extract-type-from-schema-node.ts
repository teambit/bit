import {
  InferenceTypeSchema,
  SchemaNode,
  TypeIntersectionSchema,
  TypeRefSchema,
  TypeSchema,
  TypeUnionSchema,
} from '@teambit/semantics.entities.semantic-schema';

export function extractTypeFromSchemaNode(node: SchemaNode): string {
  if (node instanceof TypeSchema) {
    return extractTypeFromSchemaNode(node.type);
  }

  if (node instanceof InferenceTypeSchema) {
    return (node as InferenceTypeSchema).type;
  }

  if (node instanceof TypeRefSchema) {
    const typeRefNode = node as TypeRefSchema;
    const args = typeRefNode.typeArgs?.map((typeArg) => extractTypeFromSchemaNode(typeArg)).join(', ');
    if (args) {
      return `${typeRefNode.name}<${args}>`;
    }
    return typeRefNode.name;
  }

  if (node instanceof TypeUnionSchema || node instanceof TypeIntersectionSchema) {
    const typeUnionNode = node as TypeUnionSchema | TypeIntersectionSchema;
    const separator = node instanceof TypeUnionSchema ? ' | ' : ' & ';

    return typeUnionNode.types.map((type) => extractTypeFromSchemaNode(type)).join(separator);
  }

  return node.toString();
}
