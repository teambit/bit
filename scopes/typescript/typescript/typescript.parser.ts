import { Export, Module, Parser } from '@teambit/schema';
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
        const text = (child as any).name.text;
        return new Export(text);
      }

      if (isFunctionDeclaration(statement)) {
        if (!statement.name) return undefined;
        return new Export(statement.name.text);
      }

      if (isClassDeclaration(statement)) {
        if (!statement.name) return undefined;
        return new Export(statement.name.text);
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
    const displayNames = collectDisplayNames(ast);

    moduleExports.forEach((exp) => {
      const name = displayNames.get(exp.identifier);
      if (name) {
        exp.displayName = name;
      }
    });

    return new Module(moduleExports);
  }
}

function collectDisplayNames(sourceFile: SourceFile) {
  const displayNames = sourceFile.statements
    .map((statement) => {
      if (statement.kind !== ts.SyntaxKind.ExpressionStatement) return undefined;

      if (!ts.isExpressionStatement(statement)) return undefined;
      if (!ts.isBinaryExpression(statement.expression)) return undefined;
      // TODO - verify operationToken
      // if(statement.expression.operatorToken !== ts.SyntaxKind.EqualsToken) return undefined;
      if (!ts.isPropertyAccessExpression(statement.expression.left)) return undefined;
      if (!ts.isIdentifier(statement.expression.left.expression)) return undefined;

      const tagetName = statement.expression.left.expression.text;
      const propertyName = statement.expression.left.name.text;
      if (propertyName !== 'compositionName') return undefined;

      if (!ts.isStringLiteral(statement.expression.right)) return undefined;

      const value = statement.expression.right.text;

      return [tagetName, value] as const;
    })
    .filter((x) => !!x) as [string, string][];

  return new Map(displayNames);
}
