import type { Node, NamedTupleMember } from 'typescript';
import { SyntaxKind } from 'typescript';
import { NamedTupleSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class NamedTupleTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.NamedTupleMember;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: NamedTupleMember, context: SchemaExtractorContext) {
    const name = node.name.getText();
    const location = context.getLocation(node);
    const type = await context.computeSchema(node.type);
    return new NamedTupleSchema(location, type, name);
  }
}
