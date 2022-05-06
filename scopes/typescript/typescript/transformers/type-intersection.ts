import ts, { Node, IntersectionTypeNode } from 'typescript';
import pMapSeries from 'p-map-series';
import { TypeIntersectionSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';

export class TypeIntersectionTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.IntersectionType;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(intersectionType: IntersectionTypeNode, context: SchemaExtractorContext) {
    const types = await pMapSeries(intersectionType.types, async (type) => {
      const typeSchema = await context.computeSchema(type);
      return typeSchema;
    });
    return new TypeIntersectionSchema(types);
  }
}
