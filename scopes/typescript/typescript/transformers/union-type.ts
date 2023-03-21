import ts, { Node, UnionTypeNode } from 'typescript';
import { TypeUnionSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class UnionTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.UnionType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: UnionTypeNode, context: SchemaExtractorContext) {
    const types = await pMapSeries(node.types, async (type) => {
      const typeSchema = context.computeSchema(type);
      return typeSchema;
    });
    const location = context.getLocation(node);
    return new TypeUnionSchema(location, types);
  }
}
