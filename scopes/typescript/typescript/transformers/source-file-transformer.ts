import ts, { Node, SourceFile } from 'typescript';
import { compact, flatten } from 'lodash';
import pMapSeries from 'p-map-series';
import { ModuleSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';
import { IdentifierList } from '../identifier-list';

export class SourceFileTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.SourceFile;
  }

  async getIdentifiers(sourceFile: SourceFile, context: SchemaExtractorContext) {
    const cacheKey = sourceFile.fileName;
    const cachedIdentifiers = context.identifiers.get(cacheKey);

    if (cachedIdentifiers) return cachedIdentifiers.identifiers;

    const exports = this.listExports(sourceFile);
    const internals = this.listInternalNodes(sourceFile);

    const exportIdentifiers = flatten(
      await Promise.all(
        exports.map((node: Node) => {
          return context.getIdentifiers(node);
        })
      )
    ).reduce<ExportIdentifier[]>((acc, current) => {
      const item = acc.find((exportName) => exportName.id === current.id);
      if (!item) acc.push(new ExportIdentifier(current.id, current.filePath));
      return acc;
    }, []);

    const internalIdentifiers = flatten(
      await Promise.all(
        internals.map((node: Node) => {
          return context.getIdentifiers(node);
        })
      )
    ).reduce<Identifier[]>((acc, current) => {
      const item = acc.find((exportName) => exportName.id === current.id);
      if (!item) acc.push(current);
      return acc;
    }, []);

    const identifiers = [...exportIdentifiers, ...internalIdentifiers];

    context.setIdentifiers(sourceFile.fileName, new IdentifierList(identifiers));
    return identifiers;
  }

  async transform(node: SourceFile, context: SchemaExtractorContext) {
    const exports = this.listExports(node);
    const internals = this.listInternalNodes(node);

    const exportDeclarations = await pMapSeries(exports, (exportNode) => {
      return context.computeSchema(exportNode);
    });

    const internalDeclarations = await pMapSeries(internals, (internalNode) => {
      return context.computeSchema(internalNode);
    });

    return new ModuleSchema(context.getLocation(node), exportDeclarations, internalDeclarations, node.fileName);
  }

  /**
   * list all exports of a source file.
   */
  private listExports(ast: SourceFile): Node[] {
    return compact(
      ast.statements.filter((statement) => {
        if (statement.kind === ts.SyntaxKind.ExportDeclaration) return true;
        const isExport = Boolean(
          statement.modifiers?.find((modifier) => {
            return modifier.kind === ts.SyntaxKind.ExportKeyword;
          })
        );
        return isExport;
      })
    );
  }

  private listInternalNodes(ast: SourceFile): Node[] {
    return compact(ast.statements).filter((statement) => {
      if (
        !(statement.kind === ts.SyntaxKind.ExportDeclaration) &&
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
