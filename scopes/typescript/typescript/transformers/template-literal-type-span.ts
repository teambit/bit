import { Node, SyntaxKind, TemplateLiteralTypeSpan } from 'typescript';
import { TemplateLiteralTypeSpanSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TemplateLiteralTypeSpanTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TemplateLiteralTypeSpan;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: TemplateLiteralTypeSpan, context: SchemaExtractorContext) {
    const type = await context.computeSchema(node.type);
    const literal = node.literal.text;
    return new TemplateLiteralTypeSpanSchema(context.getLocation(node), literal, type);
  }
}
