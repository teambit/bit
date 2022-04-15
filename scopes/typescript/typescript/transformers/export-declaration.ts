import { Export, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, SyntaxKind, ExportDeclaration as ExportDeclarationNode, NamedExports } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

export class ExportDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportDeclaration;
  }

  async getIdentifiers(exportDec: ExportDeclarationNode, context: SchemaExtractorContext) {
    if (exportDec.exportClause?.kind === ts.SyntaxKind.NamedExports) {
      exportDec.exportClause as NamedExports;
      return exportDec.exportClause.elements.map((elm) => {
        return new ExportIdentifier(elm.name.getText(), elm.getSourceFile().fileName);
      });
    }

    if (exportDec.exportClause?.kind === ts.SyntaxKind.NamespaceExport) {
      return [new ExportIdentifier(exportDec.exportClause.name.getText(), exportDec.getSourceFile().fileName)];
    }

    if (exportDec.moduleSpecifier) {
      return context.getFileExports(exportDec);
    }

    return [];
  }

  async transform(node: Node, context: SchemaExtractorContext): Promise<SchemaNode> {
    const exportDec = node as ExportDeclarationNode;
    // sourceFile.sear
    const exportClause = exportDec.exportClause;
    if (exportClause?.kind === SyntaxKind.NamedExports) {
      exportClause as NamedExports;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const schemas: SchemaNode[] = await Promise.all(
        exportClause.elements.map(async (element) => {
          return context.visitDefinition(element.name);
        })
      );

      return new Export();
      // return exports.map((identifier) => {
      //   // const type = context.resolveType(identifier);
      // });
    }

    return {};
  }
}
