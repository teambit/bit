import ts, { ArrayTypeNode, Node } from 'typescript';
import { TypeArraySchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class ArrayTypeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ArrayType;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: ArrayTypeNode, context: SchemaExtractorContext) {
    const type = await context.computeSchema(node.elementType);
    const location = context.getLocation(node);
    return new TypeArraySchema(location, type);
  }
}
