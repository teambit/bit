import type { Node, TupleTypeNode } from 'typescript';
import { SyntaxKind } from 'typescript';
import pMapSeries from 'p-map-series';
import { TupleTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class TupleTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TupleType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
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
