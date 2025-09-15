import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { ExportSchema, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import type { Node, ExportAssignment as ExportAssignmentNode } from 'typescript';
import { SyntaxKind } from 'typescript';
import { ExportIdentifier } from '../export-identifier';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { SchemaTransformer } from '../schema-transformer';

/**
 * This is either an export = or an export default declaration.
 * Unless isExportEquals is set, this node was parsed as an export default
 */
export class ExportAssignmentTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportAssignment;
  }

  async getIdentifiers(exportDec: ExportAssignmentNode) {
    return [new ExportIdentifier('default', exportDec.getSourceFile().fileName)];
  }

  async transform(exportDec: ExportAssignmentNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const specifier = exportDec.expression;
    const location = context.getLocation(exportDec);
    const absoluteFilePath = exportDec.getSourceFile().fileName;

    const exportNode = await context.getTypeRef(specifier.getText(), absoluteFilePath, location);

    if (exportNode) {
      return new ExportSchema(
        location,
        `${exportNode.name} (default)`,
        new TypeRefSchema(
          exportNode.location,
          exportNode.name,
          exportNode.componentId,
          exportNode.packageName,
          exportNode.internalFilePath
        ),
        `${exportNode.name} (default)`
      );
    }

    const schemaNode = await context.computeSchema(specifier);
    const nodeName = schemaNode.name ? `${schemaNode.name} (default)` : 'default';
    return new ExportSchema(location, nodeName, schemaNode, nodeName);
  }
}
