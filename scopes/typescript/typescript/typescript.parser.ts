import { Parser } from '@teambit/schema';
import { Export, StaticProperties } from '@teambit/semantics.entities.semantic-schema';
import { Logger } from '@teambit/logger';
import { readFileSync } from 'fs-extra';
import ts, {
  isClassDeclaration,
  isFunctionDeclaration,
  isVariableStatement,
  SourceFile,
  VariableStatement,
} from 'typescript';

export class TypeScriptParser implements Parser {
  public extension = /^.*\.(js|jsx|ts|tsx)$/;

  getExports(sourceFile: SourceFile): Export[] {
    const staticProperties = this.parseStaticProperties(sourceFile);

    const exports = sourceFile.statements.filter((statement) => {
      if (!statement.modifiers) return false;
      return statement.modifiers.find((modifier) => {
        return modifier.kind === ts.SyntaxKind.ExportKeyword;
      });
    });

    const exportModels = exports.map((statement) => {
      // todo refactor to a registry of variable statements.
      if (isVariableStatement(statement)) {
        const child = (statement as VariableStatement).declarationList.declarations[0];
        const name = (child as any).name.text;
        return new Export(name, staticProperties.get(name));
      }

      if (isFunctionDeclaration(statement)) {
        if (!statement.name) return undefined;
        const name = statement.name.text;
        return new Export(name, staticProperties.get(name));
      }

      if (isClassDeclaration(statement)) {
        if (!statement.name) return undefined;
        const name = statement.name.text;
        return new Export(name, staticProperties.get(name));
      }

      return undefined;
    });
    const withoutEmpty = exportModels.filter((exportModel) => exportModel !== undefined);
    // @ts-ignore
    return withoutEmpty;
  }

  parseModule(modulePath: string) {
    const ast = ts.createSourceFile(modulePath, readFileSync(modulePath, 'utf8'), ts.ScriptTarget.Latest);

    const moduleExports = this.getExports(ast);
    return moduleExports;
  }

  parseStaticProperties(sourceFile: SourceFile) {
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
