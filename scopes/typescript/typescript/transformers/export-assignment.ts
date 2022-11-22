import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { Node, SyntaxKind, ExportAssignment as ExportAssignmentNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';

export class ExportAssignmentTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportAssignment;
  }

  async getIdentifiers(exportDec: ExportAssignmentNode, context: SchemaExtractorContext) {
    return context.getFileExports(exportDec);
  }

  async transform(exportDec: ExportAssignmentNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const specifier = exportDec.expression;
    return context.computeSchema(specifier);
  }
}
