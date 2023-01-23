import ts, { Node, IntersectionTypeNode } from 'typescript';
import { TypeIntersectionSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class IntersectionTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.IntersectionType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: IntersectionTypeNode, context: SchemaExtractorContext) {
    const types = await pMapSeries(node.types, async (type) => {
      const typeSchema = context.computeSchema(type);
      return typeSchema;
    });
    const location = context.getLocation(node);
    return new TypeIntersectionSchema(location, types);
  }
}
