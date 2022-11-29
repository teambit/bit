import { Node, SyntaxKind, ThisTypeNode } from 'typescript';
import { ThisTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class ThisTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ThisType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ThisTypeNode, context: SchemaExtractorContext) {
    return new ThisTypeSchema(context.getLocation(node));
  }
}
