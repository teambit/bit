import ts, { Node, TypeReference, TypeReferenceNode } from 'typescript';
import pMapSeries from 'p-map-series';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TypeReferenceTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeReference;
  }

  async getIdentifiers(node: TypeReferenceNode) {
    return [];
  }

  async transform(typeReference: TypeReferenceNode, context: SchemaExtractorContext) {
    const name = typeReference.typeName.getText();
    const type = await context.resolveType(typeReference, name, true);
    return type;
  }
}
