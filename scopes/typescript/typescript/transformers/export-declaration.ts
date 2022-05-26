import { SchemaNode, Module } from '@teambit/semantics.entities.semantic-schema';
import { compact } from 'lodash';
import ts, {
  Node,
  SyntaxKind,
  ExportDeclaration as ExportDeclarationNode,
  NamedExports,
  NamespaceExport,
} from 'typescript';
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
    const exportClause = exportDec.exportClause;
    // e.g. `export { button1, button2 } as Composition from './button';
    if (exportClause?.kind === SyntaxKind.NamedExports) {
      exportClause as NamedExports;
      const schemas = await Promise.all(
        exportClause.elements.map(async (element) => {
          return context.visitDefinition(element.name);
        })
      );

      return new Module(context.getLocation(node), compact(schemas));
    }
    // e.g. `export * as Composition from './button';
    if (exportClause?.kind === SyntaxKind.NamespaceExport) {
      exportClause as NamespaceExport;
      const namespace = exportClause.name.getText();
      const filePath = await context.getFilePathByNode(exportClause.name);
      if (!filePath) {
        throw new Error(`unable to find the file-path for "${namespace}"`);
      }
      const sourceFile = context.getSourceFileInsideComponent(filePath);
      if (!sourceFile) {
        // it's a namespace from another component or an external package.
        return context.getTypeRefForExternalPath(namespace, filePath, context.getLocation(node));
      }
      const result = await context.computeSchema(sourceFile);
      if (!(result instanceof Module)) {
        throw new Error(`expect result to be instance of Module`);
      }
      result.namespace = namespace;
      return result;
    }
    // it's export-all, e.g. `export * from './button'`;
    if (!exportClause) {
      const specifier = exportDec.moduleSpecifier;
      if (!specifier) {
        throw new Error(`fatal: no specifier`);
      }
      const sourceFile = await context.getSourceFileFromNode(specifier);
      if (!sourceFile) {
        throw new Error(`unable to find the source-file`);
      }
      return context.computeSchema(sourceFile);
    }

    throw new Error('unrecognized export type');
  }
}
