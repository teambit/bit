import type { Node, ObjectLiteralExpression } from 'typescript';
import ts from 'typescript';
import pMapSeries from 'p-map-series';
import {
  ObjectLiteralExpressionSchema,
  UnImplementedSchema,
  PropertyAssignmentSchema,
} from '@teambit/semantics.entities.semantic-schema';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { SchemaTransformer } from '../schema-transformer';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

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

      if (schema instanceof UnImplementedSchema && ts.isPropertyAssignment(prop)) {
        const init = prop.initializer;

        if (ts.isIdentifier(init)) {
          const internalRef = await context.getTypeRef(
            init.getText(),
            context.getIdentifierKeyForNode(init),
            context.getLocation(init)
          );
          if (internalRef) return internalRef;

          return context.getTypeRefForExternalNode(init);
        }

        const qi = await context.getQuickInfo(init);
        const typeStr = (qi?.body?.displayString && parseTypeFromQuickInfo(qi)) || '';
        return context.resolveType(init as ts.Node & { type?: ts.TypeNode }, typeStr);
      }

      if (schema instanceof PropertyAssignmentSchema && ts.isPropertyAssignment(prop)) {
        const init = prop.initializer;
        if (schema.value instanceof UnImplementedSchema && ts.isIdentifier(init)) {
          const internalRef = await context.getTypeRef(
            init.getText(),
            context.getIdentifierKeyForNode(init),
            context.getLocation(init)
          );
          const valueSchema = internalRef ?? (await context.getTypeRefForExternalNode(init));
          return new PropertyAssignmentSchema(schema.name, valueSchema, schema.location, schema.doc);
        }
      }
      return schema;
    });
    const location = context.getLocation(node);
    return new ObjectLiteralExpressionSchema(properties, location);
  }
}
