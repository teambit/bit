import ts, { LiteralTypeNode, Node } from 'typescript';
import { LiteralTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

/**
 * e.g. string/boolean
 */
export class LiteralTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.LiteralType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: LiteralTypeNode, context: SchemaExtractorContext) {
    const location = context.getLocation(node);
    return new LiteralTypeSchema(location, node.getText());
  }
}
