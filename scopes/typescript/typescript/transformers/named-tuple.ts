import { Node, SyntaxKind, NamedTupleMember } from 'typescript';
import { NamedTupleSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class NamedTupleTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.NamedTupleMember;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: NamedTupleMember, context: SchemaExtractorContext) {
    const name = node.name.getText();
    const location = context.getLocation(node);
    const type = await context.computeSchema(node.type);
    return new NamedTupleSchema(location, type, name);
  }
}
