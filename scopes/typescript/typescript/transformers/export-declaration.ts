import { Node, SyntaxKind, ExportDeclaration as ExportDeclarationNode, NamedExports } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';

export class ExportDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportDeclaration;
  }

  transform(node: Node) {
    const exportDec = node as ExportDeclarationNode;
    const exportClause = exportDec.exportClause;
    if (exportClause?.kind === SyntaxKind.NamedExports) {
      exportClause as NamedExports;
      const exports = exportClause.elements.map((element) => {
        return element.name;
      });

      return exports.map((identifier) => {
        // const type = context.resolveType(identifier);
      });
    }

    return {};
  }
}
