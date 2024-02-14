import { LiteralValueSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, StringLiteral } from 'typescript';
import { SchemaExtractorContext, SchemaTransformer } from '..';
import { Identifier } from '../identifier';

export type LiteralValueNode =
  | StringLiteral
  | ts.NumericLiteral
  | ts.TrueLiteral
  | ts.FalseLiteral
  | ts.NullLiteral
  | ts.BigIntLiteral
  | ts.RegularExpressionLiteral
  | ts.NewExpression;

export class LiteralValueTransformer implements SchemaTransformer {
  predicate(node: Node): boolean {
    return (
      node.kind === ts.SyntaxKind.StringLiteral ||
      node.kind === ts.SyntaxKind.NumericLiteral ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      node.kind === ts.SyntaxKind.UndefinedKeyword ||
      node.kind === ts.SyntaxKind.BigIntLiteral ||
      node.kind === ts.SyntaxKind.RegularExpressionLiteral ||
      node.kind === ts.SyntaxKind.NewExpression ||
      node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
    );
  }
  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }
  async transform(node: LiteralValueNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    return new LiteralValueSchema(context.getLocation(node), node.getText());
  }
}
