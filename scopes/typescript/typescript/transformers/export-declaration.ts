import ts, { Node, SyntaxKind, ExportDeclaration as ExportDeclarationNode, NamedExports } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';

export class ExportDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportDeclaration;
  }

  async transform(node: Node, context: SchemaExtractorContext) {
    const exportDec = node as ExportDeclarationNode;
    // sourceFile.sear
    const exportClause = exportDec.exportClause;
    if (exportClause?.kind === SyntaxKind.NamedExports) {
      exportClause as NamedExports;
      const exports = await Promise.all(
        exportClause.elements.map(async (element) => {
          const sig = await context.visitDefinition(element);
          return element.name;
        })
      );

      return exports.map((identifier) => {
        // const type = context.resolveType(identifier);
      });
    }

    return {};
  }
}
