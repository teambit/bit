import ts, { Node, TypeReferenceNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';

export class TypeReferenceTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeReference;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(typeReference: TypeReferenceNode, context: SchemaExtractorContext) {
    const name = typeReference.typeName.getText();
    const type = await context.resolveType(typeReference, name, true);
    return type;
  }
}
