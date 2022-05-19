import ts, { LiteralTypeNode, Node } from 'typescript';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';

export class LiteralTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.LiteralType;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(literalType: LiteralTypeNode, context: SchemaExtractorContext) {
    const type = literalType.literal.getText();
    return new TypeRefSchema(context.getLocation(literalType), type);
  }
}
