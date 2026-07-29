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

    // The export is literally named `default` in TS (`export { Foo as default }`). Use that as the
    // schema's stable name/alias — the target symbol is preserved on the wrapped `TypeRefSchema.name`.
    // Baking a `"Foo (default)"` label into the name instead produced an invalid signature
    // (`export { Foo as Foo (default) }`) and an unstable diff key that flip-flopped with the
    // extractor's fallback representation across builds (surfacing as a phantom "added" export).
    if (exportNode) {
      return new ExportSchema(
        location,
        'default',
        new TypeRefSchema(
          exportNode.location,
          exportNode.name,
          exportNode.componentId,
          exportNode.packageName,
          exportNode.internalFilePath
        ),
        'default'
      );
    }

    const schemaNode = await context.computeSchema(specifier);
    return new ExportSchema(location, 'default', schemaNode, 'default');
  }
}
