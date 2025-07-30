import type { Node, TypePredicateNode } from 'typescript';
import { isIdentifier, SyntaxKind } from 'typescript';
import { TypePredicateSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class TypePredicateTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TypePredicate;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TypePredicateNode, context: SchemaExtractorContext) {
    const parameterName = isIdentifier(node.parameterName) ? node.parameterName.getText() : 'this';
    const type = node.type ? await context.computeSchema(node.type) : undefined;
    const hasAssertsModifier = Boolean(node.assertsModifier);
    return new TypePredicateSchema(context.getLocation(node), parameterName, type, hasAssertsModifier);
  }
}
