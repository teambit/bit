import { ArrayLiteralExpressionSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import ts, { ArrayLiteralExpression, Node } from 'typescript';
import { SchemaExtractorContext, SchemaTransformer } from '..';
import { Identifier } from '../identifier';

export class ArrayLiteralExpressionTransformer implements SchemaTransformer {
  predicate(node: Node): boolean {
    return node.kind === ts.SyntaxKind.ArrayLiteralExpression;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ArrayLiteralExpression, context: SchemaExtractorContext): Promise<SchemaNode> {
    const members = await pMapSeries(node.elements, (element) => {
      return context.computeSchema(element);
    });
    const location = context.getLocation(node);
    return new ArrayLiteralExpressionSchema(members, location);
  }
}
