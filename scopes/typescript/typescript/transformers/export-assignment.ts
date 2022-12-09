import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { Node, SyntaxKind, ExportAssignment as ExportAssignmentNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';

/**
 * This is either an export = or an export default declaration.
 * Unless isExportEquals is set, this node was parsed as an export default
 */
export class ExportAssignmentTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportAssignment;
  }

  /**
   * @todo
   */
  async getIdentifiers() {
    // return context.getFileExports(exportDec);
    return [];
  }

  async transform(exportDec: ExportAssignmentNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const specifier = exportDec.expression;
    return context.computeSchema(specifier);
  }
}
