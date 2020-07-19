import ts, { SourceFile, VariableStatement, isVariableStatement, isFunctionDeclaration } from 'typescript';
import { readFileSync } from 'fs';
import { Parser, Module, Export } from '../schema';

export class TypeScriptParser implements Parser {
  public extension = /.ts/;

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

      return undefined;
    });
    const withoutEmpty = exportModels.filter((exportModel) => exportModel !== undefined);
    // @ts-ignore
    return withoutEmpty;
  }

  parseModule(modulePath: string) {
    const ast = ts.createSourceFile(modulePath, readFileSync(modulePath, 'utf8'), ts.ScriptTarget.Latest);

    return new Module(this.getExports(ast));
  }
}
