import { Node, SyntaxKind } from 'typescript';
import { KeywordTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

/**
 * whether it's kind of `ts.KeywordTypeSyntaxKind`
 */
export class KeywordTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    switch (node.kind) {
      case SyntaxKind.AnyKeyword:
      case SyntaxKind.BigIntKeyword:
      case SyntaxKind.BooleanKeyword:
      case SyntaxKind.IntrinsicKeyword:
      case SyntaxKind.NeverKeyword:
      case SyntaxKind.NumberKeyword:
      case SyntaxKind.ObjectKeyword:
      case SyntaxKind.StringKeyword:
      case SyntaxKind.SymbolKeyword:
      case SyntaxKind.UndefinedKeyword:
      case SyntaxKind.UnknownKeyword:
      case SyntaxKind.VoidKeyword:
        return true;
      default:
        return false;
    }
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: Node, context: SchemaExtractorContext) {
    const location = context.getLocation(node);
    return new KeywordTypeSchema(location, node.getText());
  }
}
