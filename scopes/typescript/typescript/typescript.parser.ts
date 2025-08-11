import type { Parser } from '@teambit/schema';
import type { StaticProperties } from '@teambit/semantics.entities.semantic-schema';
import { Export } from '@teambit/semantics.entities.semantic-schema';
import type { Logger } from '@teambit/logger';
import { readFileSync } from 'fs-extra';
import ts from 'typescript';

export class TypeScriptParser implements Parser {
  public extension = /^.*\.(js|jsx|ts|tsx)$/;

  getExports(sourceFile: ts.SourceFile): Export[] {
    const staticProperties = this.parseStaticProperties(sourceFile);
    const exportModels: Export[] = [];

    sourceFile.statements.forEach((statement) => {
      // export default
      if (ts.isExportAssignment(statement)) {
        // export default
      }

      // export declarations or re-exports
      if (ts.isExportDeclaration(statement)) {
        if (statement.exportClause) {
          if (ts.isNamedExports(statement.exportClause)) {
            statement.exportClause.elements.forEach((element) => {
              // Handle both Identifier and StringLiteral export names (TypeScript 5.6+ arbitrary module namespace identifiers)
              const name = ts.isIdentifier(element.name) ? element.name.escapedText.toString() : element.name.text;
              if (name !== 'default') {
                exportModels.push(new Export(name, staticProperties.get(name)));
              }
            });
          }
          if (ts.isNamespaceExport(statement.exportClause)) {
            // Handle both Identifier and StringLiteral export names (TypeScript 5.6+ arbitrary module namespace identifiers)
            const name = ts.isIdentifier(statement.exportClause.name)
              ? statement.exportClause.name.escapedText.toString()
              : statement.exportClause.name.text;
            exportModels.push(new Export(name, staticProperties.get(name)));
          }
        }
      }

      // export modifiers
      // - variable statement
      // - function statement
      // - class statement
      const statementModifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      if (statementModifiers) {
        statementModifiers.some((modifier) => {
          if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
            if (ts.isVariableStatement(statement)) {
              const child = statement.declarationList.declarations[0];
              if (ts.isIdentifier(child.name)) {
                const name = child.name.escapedText.toString();
                exportModels.push(new Export(name, staticProperties.get(name)));
              }
            } else if (ts.isFunctionDeclaration(statement)) {
              if (statement.name) {
                const name = statement.name.escapedText.toString();
                exportModels.push(new Export(name, staticProperties.get(name)));
              }
            } else if (ts.isClassDeclaration(statement)) {
              if (statement.name) {
                const name = statement.name.escapedText.toString();
                exportModels.push(new Export(name, staticProperties.get(name)));
              }
            }
            return true;
          }
          return false;
        });
      }
    });

    const withoutEmpty = exportModels.filter((exportModel) => exportModel !== undefined);
    // @ts-ignore
    return withoutEmpty;
  }

  parseModule(modulePath: string, content?: string) {
    const ast = ts.createSourceFile(modulePath, content ?? readFileSync(modulePath, 'utf8'), ts.ScriptTarget.Latest);

    const moduleExports = this.getExports(ast);
    return moduleExports;
  }

  parseStaticProperties(sourceFile: ts.SourceFile) {
    // TODO - should we also parse staticProperties inside classes / objects?

    const exportStaticProperties = new Map<string, StaticProperties>();

    sourceFile.statements.forEach((statement) => {
      try {
        if (!ts.isExpressionStatement(statement)) return;
        if (!ts.isBinaryExpression(statement.expression)) return;
        if (statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
        if (!ts.isPropertyAccessExpression(statement.expression.left)) return;
        if (!ts.isIdentifier(statement.expression.left.expression)) return;

        const targetName = statement.expression.left.expression.text;
        const propertyName = statement.expression.left.name.text;

        if (!exportStaticProperties.has(targetName)) exportStaticProperties.set(targetName, new Map());

        const existingProperties = exportStaticProperties.get(targetName);

        if (ts.isStringLiteral(statement.expression.right)) {
          existingProperties?.set(propertyName, statement.expression.right.text);
        } else if (ts.isNumericLiteral(statement.expression.right)) {
          existingProperties?.set(propertyName, +statement.expression.right.text);
        } else if (statement.expression.right.kind === ts.SyntaxKind.UndefinedKeyword) {
          existingProperties?.set(propertyName, undefined);
        } else if (statement.expression.right.kind === ts.SyntaxKind.NullKeyword) {
          existingProperties?.set(propertyName, null);
        } else if (statement.expression.right.kind === ts.SyntaxKind.TrueKeyword) {
          existingProperties?.set(propertyName, true);
        } else if (statement.expression.right.kind === ts.SyntaxKind.FalseKeyword) {
          existingProperties?.set(propertyName, false);
        }
      } catch (err) {
        this.logger?.error('failed parsing static properties', err);
      }
    });

    return exportStaticProperties;
  }

  constructor(private logger?: Logger | undefined) {}
}
