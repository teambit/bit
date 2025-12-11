import type { Node, TypeQueryNode } from 'typescript';
import ts from 'typescript';
import { TypeQuerySchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

/**
 * e.g. `typeof Foo`
 */
export class TypeQueryTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeQuery;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TypeQueryNode, context: SchemaExtractorContext) {
    const displaySig = await context.getQuickInfoDisplayString(node.exprName);
    const type = await context.resolveType(node.exprName, node.exprName.getText());
    const location = context.getLocation(node);
    return new TypeQuerySchema(location, type, displaySig);
  }
}
