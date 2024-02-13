import ts, { ObjectLiteralExpression } from 'typescript';
import pMapSeries from 'p-map-series';
import { ObjectLiteralExpressionSchema } from '@teambit/semantics.entities.semantic-schema/schemas/object-literal-expression';
import { SchemaExtractorContext, SchemaTransformer } from '..';

export class ObjectLiteralExpressionTransformer implements SchemaTransformer {
  predicate(node: any) {
    return node.kind === ts.SyntaxKind.ObjectLiteralExpression;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(node: ObjectLiteralExpression, context: SchemaExtractorContext) {
    const properties = await pMapSeries(node.properties, (prop) => {
      return context.computeSchema(prop);
    });
    const location = context.getLocation(node);
    return new ObjectLiteralExpressionSchema(properties, location);
  }
}
