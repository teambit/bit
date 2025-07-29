import type { Node, TemplateLiteralTypeNode } from 'typescript';
import { SyntaxKind } from 'typescript';
import pMapSeries from 'p-map-series';
import type { TemplateLiteralTypeSpanSchema } from '@teambit/semantics.entities.semantic-schema';
import { TemplateLiteralTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class TemplateLiteralTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TemplateLiteralType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
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
