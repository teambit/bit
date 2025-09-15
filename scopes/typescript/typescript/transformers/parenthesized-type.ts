import type { Node, ParenthesizedTypeNode } from 'typescript';
import { SyntaxKind } from 'typescript';
import { ParenthesizedTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class ParenthesizedTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ParenthesizedType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ParenthesizedTypeNode, context: SchemaExtractorContext) {
    const type = await context.computeSchema(node.type);
    return new ParenthesizedTypeSchema(context.getLocation(node), type);
  }
}
