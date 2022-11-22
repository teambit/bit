import { Node, SyntaxKind, TupleTypeNode } from 'typescript';
import pMapSeries from 'p-map-series';
import { TupleTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TupleTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TupleType;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: TupleTypeNode, context: SchemaExtractorContext) {
    const elements = await pMapSeries(node.elements, async (elem) => {
      const typeSchema = await context.computeSchema(elem);
      return typeSchema;
    });
    return new TupleTypeSchema(context.getLocation(node), elements);
  }
}
