import type { Node, TemplateLiteralTypeSpan } from 'typescript';
import { SyntaxKind } from 'typescript';
import { TemplateLiteralTypeSpanSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class TemplateLiteralTypeSpanTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TemplateLiteralTypeSpan;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TemplateLiteralTypeSpan, context: SchemaExtractorContext) {
    const type = await context.computeSchema(node.type);
    const literal = node.literal.text;
    return new TemplateLiteralTypeSpanSchema(context.getLocation(node), literal, type);
  }
}
