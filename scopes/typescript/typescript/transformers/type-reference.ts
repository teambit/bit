import ts, { Node, TypeReferenceNode } from 'typescript';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TypeReferenceTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeReference;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: TypeReferenceNode, context: SchemaExtractorContext) {
    const name = node.typeName.getText();
    const type = await context.resolveType(node, name, false);
    if (node.typeArguments && type instanceof TypeRefSchema) {
      const args = await pMapSeries(node.typeArguments, (arg) => context.computeSchema(arg));
      type.typeArgs = args;
    }
    return type;
  }
}
