import ts, { SourceFile, VariableStatement, isVariableStatement, isFunctionDeclaration } from 'typescript';
import { readFileSync } from 'fs';
// import { Parser, Module, Export } from '@teambit/schema';
// import { Module, Export } from '@teambit/schema';
import { Parser } from '../schema/parser';
import { Module } from '../schema/schemas';
import { Export } from '../schema/schemas';
// import { Parser } from '../';

import * as path from 'path';
import { Extractor, ExtractorConfig, ExtractorResult } from '@microsoft/api-extractor';

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

  public extractApi(modulePath: string) {
    const apiExtractorJsonPath: string = path.join(__dirname, './config/api-extractor.json');
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

    const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
      // Equivalent to the "--local" command-line parameter
      localBuild: true,

      // Equivalent to the "--verbose" command-line parameter
      showVerboseMessages: true,
    });

    if (extractorResult.succeeded) {
      console.error(`API Extractor completed successfully`);
      process.exitCode = 0;
    } else {
      console.error(
        `API Extractor completed with ${extractorResult.errorCount} errors` +
          ` and ${extractorResult.warningCount} warnings`
      );
      process.exitCode = 1;
    }

    console.log(`Not Implemented (modulePath: ${modulePath})`);
    return new Module([]);
  }
}

// Temp
const t = new TypeScriptParser().extractApi('./typescript.compiler.ts');
