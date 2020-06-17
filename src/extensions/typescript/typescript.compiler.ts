import path from 'path';
import fs from 'fs-extra';
import ts from 'typescript';
import { Compiler } from '../compiler';
import { Network } from '../isolator';
import { BuildResults } from '../builder';

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
  async compileOnCapsules({ capsuleGraph }: { capsuleGraph: Network }): Promise<BuildResults> {
    const capsules = capsuleGraph.capsules;
    const capsuleDirs = capsules.getAllCapsuleDirs();
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
    if (result > 0 && !diagnostics.length) {
      throw new Error(`typescript exited with status code ${result}, however, no errors are found in the diagnostics`);
    }
    const formatHost = {
      getCanonicalFileName: p => p,
      getCurrentDirectory: () => '', // it helps to get the files with absolute paths
      getNewLine: () => ts.sys.newLine
    };
    const componentsErrors = diagnostics.map(diagnostic => {
      const errorStr = process.stdout.isTTY
        ? ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost)
        : ts.formatDiagnostic(diagnostic, formatHost);
      if (!diagnostic.file) {
        // this happens for example if one of the components and is not TS
        throw new Error(errorStr);
      }
      const componentId = capsules.getIdByPathInCapsule(diagnostic.file.fileName);
      if (!componentId) throw new Error(`unable to find the componentId by the filename ${diagnostic.file.fileName}`);
      return { componentId, error: errorStr };
    });
    const components = capsules.map(capsule => {
      const id = capsule.id;
      const errors = componentsErrors.filter(c => c.componentId.isEqual(id)).map(c => c.error);
      return { id, errors };
    });

    return { artifacts: [{ dirName: 'dist' }], components };
  }
}
