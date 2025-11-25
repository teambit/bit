import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { ArrayLiteralExpressionSchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import type { ArrayLiteralExpression, Node } from 'typescript';
import ts from 'typescript';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { SchemaTransformer } from '../schema-transformer';
import type { Identifier } from '../identifier';

export class ArrayLiteralExpressionTransformer implements SchemaTransformer {
  predicate(node: Node): boolean {
    return node.kind === ts.SyntaxKind.ArrayLiteralExpression;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ArrayLiteralExpression, context: SchemaExtractorContext): Promise<SchemaNode> {
    const members = await pMapSeries(node.elements, async (element) => {
      const schema = await context.computeSchema(element);
      if (schema instanceof UnImplementedSchema) {
        const typeRef = await context.resolveType(element, element.getText());
        return typeRef;
      }
      return schema;
    });
    const location = context.getLocation(node);
    return new ArrayLiteralExpressionSchema(members, location);
  }
}
