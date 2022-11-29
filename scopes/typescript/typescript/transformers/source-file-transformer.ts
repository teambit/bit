import ts, { Node, SourceFile } from 'typescript';
import { compact, flatten } from 'lodash';
import pMapSeries from 'p-map-series';
import { ModuleSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { SchemaExtractorContext } from '../schema-extractor-context';

export class SourceFileTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.SourceFile;
  }

  async getIdentifiers(sourceFile: SourceFile, context: SchemaExtractorContext) {
    const exports = this.listExports(sourceFile);

    const exportNames = await Promise.all(
      exports.map((node: Node) => {
        return context.getExportedIdentifiers(node);
      })
    );

    const exportIds = flatten(exportNames).reduce<ExportIdentifier[]>((acc, current) => {
      const item = acc.find((exportName) => exportName.id === current.id);
      if (!item) acc.push(new ExportIdentifier(current.id, current.filePath));
      return acc;
    }, []);

    return exportIds;
  }

  async transform(node: SourceFile, context: SchemaExtractorContext) {
    const exports = this.listExports(node);
    const schemas = await pMapSeries(exports, (exportNode) => {
      return context.computeSchema(exportNode);
    });

    return new ModuleSchema(context.getLocation(node), schemas, node.fileName);
  }

  /**
   * list all exports of a source file.
   */
  private listExports(ast: SourceFile): Node[] {
    return compact(
      ast.statements.map((statement) => {
        if (statement.kind === ts.SyntaxKind.ExportDeclaration) return statement;
        const isExport = Boolean(
          statement.modifiers?.find((modifier) => {
            return modifier.kind === ts.SyntaxKind.ExportKeyword;
          })
        );

        // eslint-disable-next-line consistent-return
        if (!isExport) return;
        return statement;
      })
    );
  }

  // private listInternalNodes(ast: SourceFile): Node[] {
  //   return compact(ast.statements)
  // }
}
