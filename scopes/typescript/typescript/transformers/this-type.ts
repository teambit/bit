import type { Node, ThisTypeNode } from 'typescript';
import { SyntaxKind } from 'typescript';
import { ThisTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class ThisTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ThisType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ThisTypeNode, context: SchemaExtractorContext) {
    return new ThisTypeSchema(context.getLocation(node), 'this');
  }
}
