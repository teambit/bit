import { DecoratorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Decorator, Node } from 'typescript';
import pMapSeries from 'p-map-series';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { Identifier } from '../identifier';

export class DecoratorTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.Decorator;
  }

  async getIdentifiers(decorator: Decorator) {
    const identifierText = decorator.expression.getFirstToken()?.getText() || '';
    return [new Identifier(identifierText, decorator.getSourceFile().fileName)];
  }

  async transform(node: Decorator, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = node.expression.getFirstToken()?.getText() || '';
    const location = context.getLocation(node);
    const doc = await context.jsDocToDocSchema(node);
    const args =
      ts.isCallExpression(node.expression) && node.expression.arguments.length
        ? await pMapSeries(node.expression.arguments, (arg) => context.computeSchema(arg))
        : undefined;
    return new DecoratorSchema(location, name, doc, args);
  }
}
