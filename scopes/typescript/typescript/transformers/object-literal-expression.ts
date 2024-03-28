import ts, { Node, ObjectLiteralExpression } from 'typescript';
import pMapSeries from 'p-map-series';
import { ObjectLiteralExpressionSchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';

export class ObjectLiteralExpressionTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ObjectLiteralExpression;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(node: ObjectLiteralExpression, context: SchemaExtractorContext) {
    const properties = await pMapSeries(node.properties, async (prop) => {
      const schema = await context.computeSchema(prop);
      if (schema instanceof UnImplementedSchema) {
        const typeRef = await context.resolveType(prop, prop.getText());
        return typeRef;
      }
      return schema;
    });
    const location = context.getLocation(node);
    return new ObjectLiteralExpressionSchema(properties, location);
  }
}
