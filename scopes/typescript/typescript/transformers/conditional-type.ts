import type { Node, ConditionalTypeNode } from 'typescript';
import { SyntaxKind } from 'typescript';
import { ConditionalTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class ConditionalTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ConditionalType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ConditionalTypeNode, context: SchemaExtractorContext) {
    const checkType = await context.computeSchema(node.checkType);
    const extendsType = await context.computeSchema(node.extendsType);
    const trueType = await context.computeSchema(node.trueType);
    const falseType = await context.computeSchema(node.falseType);
    return new ConditionalTypeSchema(context.getLocation(node), checkType, extendsType, trueType, falseType);
  }
}
