import { isIdentifier, Node, SyntaxKind, TypePredicateNode } from 'typescript';
import { TypePredicateSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TypePredicateTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TypePredicate;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: TypePredicateNode, context: SchemaExtractorContext) {
    const parameterName = isIdentifier(node.parameterName) ? node.parameterName.getText() : 'this';
    const type = node.type ? await context.computeSchema(node.type) : undefined;
    const hasAssertsModifier = Boolean(node.assertsModifier);
    return new TypePredicateSchema(context.getLocation(node), parameterName, type, hasAssertsModifier);
  }
}
