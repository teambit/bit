import { Node, SyntaxKind, TemplateLiteralTypeNode } from 'typescript';
import pMapSeries from 'p-map-series';
import { TemplateLiteralTypeSchema, TemplateLiteralTypeSpanSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TemplateLiteralTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TemplateLiteralType;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: TemplateLiteralTypeNode, context: SchemaExtractorContext) {
    const templateSpans = (await pMapSeries(node.templateSpans, (span) =>
      context.computeSchema(span)
    )) as TemplateLiteralTypeSpanSchema[];
    const head = node.head.text;
    return new TemplateLiteralTypeSchema(context.getLocation(node), head, templateSpans);
  }
}
