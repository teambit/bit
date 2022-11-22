import { IndexedAccessTypeNode, Node, SyntaxKind } from 'typescript';
import { IndexedAccessSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class IndexedAccessTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.IndexedAccessType;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: IndexedAccessTypeNode, context: SchemaExtractorContext) {
    const objectType = await context.computeSchema(node.objectType);
    const indexType = await context.computeSchema(node.indexType);
    return new IndexedAccessSchema(context.getLocation(node), objectType, indexType);
  }
}
