import ts, { Node, SourceFile } from 'typescript';
import { flatten } from 'lodash';
import pMapSeries from 'p-map-series';
import { ModuleSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class SourceFileTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.SourceFile;
  }

  async getIdentifiers(sourceFile: SourceFile, context: SchemaExtractorContext) {
    const exports = this.listExports(sourceFile);
    const internals = this.listInternalNodes(sourceFile);

    // change to pMap series
    const exportIdentifiers = flatten(
      await pMapSeries(exports, (node) => {
        return context.getIdentifiers(node);
      })
    ).reduce<ExportIdentifier[]>((acc, current) => {
      const item = acc.find((exportName) => exportName.id === current.id);
      if (!item) acc.push(new ExportIdentifier(current.id, current.filePath));
      return acc;
    }, []);

    const internalIdentifiers = flatten(
      await pMapSeries(internals, (node) => {
        return context.getIdentifiers(node);
      })
    ).reduce<Identifier[]>((acc, current) => {
      const item = acc.find((exportName) => exportName.id === current.id);
      if (!item) acc.push(current);
      return acc;
    }, []);

    const identifiers = [...exportIdentifiers, ...internalIdentifiers];

    return identifiers;
  }

  async transform(node: SourceFile, context: SchemaExtractorContext) {
    const exports = this.listExports(node);
    const internals = this.listInternalNodes(node).filter(
      (internal) => internal.kind !== ts.SyntaxKind.ImportDeclaration
    );

    const exportDeclarations = await pMapSeries(exports, (exportNode) => {
      return context.computeSchema(exportNode);
    });

    const internalDeclarations = await pMapSeries(internals, (internalNode) => {
      return context.computeSchema(internalNode);
    });

    return new ModuleSchema(context.getLocation(node), exportDeclarations, internalDeclarations);
  }

  /**
   * list all exports of a source file.
   */
  private listExports(ast: SourceFile): Node[] {
    return ast.statements.filter((statement) => {
      if (statement.kind === ts.SyntaxKind.ExportDeclaration || statement.kind === ts.SyntaxKind.ExportAssignment)
        return true;
      const isExport = Boolean(
        statement.modifiers?.find((modifier) => {
          return modifier.kind === ts.SyntaxKind.ExportKeyword;
        })
      );
      return isExport;
    });
  }

  private listInternalNodes(ast: SourceFile): Node[] {
    return ast.statements.filter((statement) => {
      if (
        !(statement.kind === ts.SyntaxKind.ExportDeclaration || statement.kind === ts.SyntaxKind.ExportAssignment) &&
        !statement.modifiers?.find((modifier) => {
          return modifier.kind === ts.SyntaxKind.ExportKeyword;
        })
      ) {
        return true;
      }

      return false;
    });
  }
}
