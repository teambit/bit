import ts, { Node, ExpressionStatement } from 'typescript';
import { UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class ExpressionStatementTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ExpressionStatement;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ExpressionStatement, context: SchemaExtractorContext) {
    const location = context.getLocation(node);
    return new UnImplementedSchema(location, node.getText(), ts.SyntaxKind[node.kind]);
  }
}
