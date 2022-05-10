import ts, { Node, UnionTypeNode } from 'typescript';
import pMapSeries from 'p-map-series';
import { TypeUnionSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';

export class TypeUnionTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.UnionType;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(unionType: UnionTypeNode, context: SchemaExtractorContext) {
    const types = await pMapSeries(unionType.types, async (type) => {
      const typeSchema = await context.computeSchema(type);
      return typeSchema;
    });
    return new TypeUnionSchema(types);
  }
}
