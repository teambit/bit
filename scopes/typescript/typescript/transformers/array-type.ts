import type { ArrayTypeNode, Node } from 'typescript';
import ts from 'typescript';
import { TypeArraySchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class ArrayTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ArrayType;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ArrayTypeNode, context: SchemaExtractorContext) {
    const type = await context.computeSchema(node.elementType);
    const location = context.getLocation(node);
    return new TypeArraySchema(location, type);
  }
}
