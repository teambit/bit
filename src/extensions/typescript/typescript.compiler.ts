import path from 'path';
import ts from 'typescript';
import { Compiler } from '../compile';

export class TypescriptCompiler implements Compiler {
  constructor(readonly tsConfig: Record<string, any>) {}

  defineCompiler() {
    return { taskFile: 'transpile' };
  }
  compileFile(
    fileContent: string,
    options: { componentDir: string; filePath: string }
  ): { outputText: string; outputPath: string }[] | null {
    const supportedExtensions = ['.ts', '.tsx'];
    const fileExtension = path.extname(options.filePath);
    if (!supportedExtensions.includes(fileExtension)) {
      return null; // file is not supported
    }
    const compilerOptionsFromTsconfig = ts.convertCompilerOptionsFromJson(this.tsConfig.compilerOptions, '.');
    if (compilerOptionsFromTsconfig.errors.length) {
      throw new Error(`failed parsing the tsconfig.json.\n${compilerOptionsFromTsconfig.errors.join('\n')}`);
    }
    const compilerOptions = compilerOptionsFromTsconfig.options;
    compilerOptions.sourceRoot = options.componentDir;
    const result = ts.transpileModule(fileContent, {
      compilerOptions,
      fileName: options.filePath,
      reportDiagnostics: true
    });

    if (result.diagnostics && result.diagnostics.length) {
      const formatHost = {
        getCanonicalFileName: p => p,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine
      };
      const error = ts.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost);

      throw new Error(error);
    }

    const replaceExtToJs = filePath => filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
    const outputPath = replaceExtToJs(options.filePath);
    const outputFiles = [{ outputText: result.outputText, outputPath }];
    if (result.sourceMapText) {
      outputFiles.push({
        outputText: result.sourceMapText,
        outputPath: `${outputPath}.map`
      });
    }
    return outputFiles;
  }
}
