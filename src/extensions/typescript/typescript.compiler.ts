import path from 'path';
import fs from 'fs-extra';
import ts from 'typescript';
import { Compiler } from '../compile';

export class TypescriptCompiler implements Compiler {
  constructor(readonly tsConfig: Record<string, any>) {}
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
  compileOnCapsules(capsuleDirs: string[]) {
    capsuleDirs.forEach(capsuleDir =>
      fs.writeFileSync(path.join(capsuleDir, 'tsconfig.json'), JSON.stringify(this.tsConfig, undefined, 2))
    );
    const compilerOptionsFromTsconfig = ts.convertCompilerOptionsFromJson(this.tsConfig.compilerOptions, '.');
    if (compilerOptionsFromTsconfig.errors.length) {
      throw new Error(`failed parsing the tsconfig.json.\n${compilerOptionsFromTsconfig.errors.join('\n')}`);
    }
    const diagnostics: ts.Diagnostic[] = [];
    const diagAccumulator = diag => diagnostics.push(diag);
    const host = ts.createSolutionBuilderHost(undefined, undefined, diagAccumulator);
    const solutionBuilder = ts.createSolutionBuilder(host, capsuleDirs, { dry: false, verbose: false });
    solutionBuilder.clean();
    const result = solutionBuilder.build();
    let errorStr = '';
    if (diagnostics.length) {
      const formatHost = {
        getCanonicalFileName: p => p,
        // @todo: replace this with the capsule dir for better error message
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine
      };
      errorStr = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);
    }

    return { resultCode: result, error: errorStr ? new Error(errorStr) : null };
  }
}
