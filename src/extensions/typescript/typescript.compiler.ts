import path from 'path';
import fs from 'fs-extra';
import ts from 'typescript';
import { Compiler } from '../compiler';
import { Network } from '../isolator';
import { BuildResults } from '../builder';
import { TranspileOpts, TranspileOutput } from '../compiler/types';

export class TypescriptCompiler implements Compiler {
  constructor(
    /**
     * typescript config.
     */
    readonly tsConfig: Record<string, any>,

    /**
     * path for .d.ts files to include during build.
     */
    private types: string[]
  ) {}

  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    const supportedExtensions = ['.ts', '.tsx'];
    const fileExtension = path.extname(options.filePath);
    if (!supportedExtensions.includes(fileExtension) || options.filePath.endsWith('.d.ts')) {
      return null; // file is not supported
    }
    const compilerOptionsFromTsconfig = ts.convertCompilerOptionsFromJson(this.tsConfig.compilerOptions, '.');
    if (compilerOptionsFromTsconfig.errors.length) {
      // :TODO @david replace to a more concrete error type and put in 'exceptions' directory here.
      throw new Error(`failed parsing the tsconfig.json.\n${compilerOptionsFromTsconfig.errors.join('\n')}`);
    }

    const compilerOptions = compilerOptionsFromTsconfig.options;
    compilerOptions.sourceRoot = options.componentDir;
    const result = ts.transpileModule(fileContent, {
      compilerOptions,
      fileName: options.filePath,
      reportDiagnostics: true,
    });

    if (result.diagnostics && result.diagnostics.length) {
      const formatHost = {
        getCanonicalFileName: (p) => p,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      };
      const error = ts.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost);

      // :TODO @david please replace to a more concrete error type and put in 'exceptions' directory here.
      throw new Error(error);
    }

    const outputPath = this.replaceFileExtToJs(options.filePath);
    const outputFiles = [{ outputText: result.outputText, outputPath }];
    if (result.sourceMapText) {
      outputFiles.push({
        outputText: result.sourceMapText,
        outputPath: `${outputPath}.map`,
      });
    }
    return outputFiles;
  }

  async build({ capsuleGraph }: { capsuleGraph: Network }): Promise<BuildResults> {
    const capsules = capsuleGraph.capsules;
    const capsuleDirs = capsules.getAllCapsuleDirs();

    capsuleDirs.forEach((capsuleDir) => {
      fs.writeFileSync(path.join(capsuleDir, 'tsconfig.json'), JSON.stringify(this.tsConfig, undefined, 2));

      this.writeTypes(capsuleDir);
    });

    const compilerOptionsFromTsconfig = ts.convertCompilerOptionsFromJson(this.tsConfig.compilerOptions, '.');
    if (compilerOptionsFromTsconfig.errors.length) {
      throw new Error(`failed parsing the tsconfig.json.\n${compilerOptionsFromTsconfig.errors.join('\n')}`);
    }
    const diagnostics: ts.Diagnostic[] = [];
    const diagAccumulator = (diag) => diagnostics.push(diag);
    const host = ts.createSolutionBuilderHost(undefined, undefined, diagAccumulator);
    const solutionBuilder = ts.createSolutionBuilder(host, capsuleDirs, { dry: false, verbose: false });
    solutionBuilder.clean();
    const result = solutionBuilder.build();
    if (result > 0 && !diagnostics.length) {
      throw new Error(`typescript exited with status code ${result}, however, no errors are found in the diagnostics`);
    }
    const formatHost = {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: () => '', // it helps to get the files with absolute paths
      getNewLine: () => ts.sys.newLine,
    };
    const componentsErrors = diagnostics.map((diagnostic) => {
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
    const components = capsules.map((capsule) => {
      const id = capsule.id;
      const errors = componentsErrors.filter((c) => c.componentId.isEqual(id)).map((c) => c.error);
      return { id, errors };
    });

    return { artifacts: [{ dirName: this.getDistDir() }], components };
  }

  /**
   * returns the dist directory on the capsule
   */
  getDistDir() {
    return 'dist';
  }

  /**
   * given a source file, return its parallel in the dists. e.g. index.ts => dist/index.js
   */
  getDistPathBySrcPath(srcPath: string) {
    const fileWithJSExtIfNeeded = this.replaceFileExtToJs(srcPath);
    return path.join(this.getDistDir(), fileWithJSExtIfNeeded);
  }

  isFileSupported(filePath: string): boolean {
    return (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && !filePath.endsWith('.d.ts');
  }

  private writeTypes(rootDir: string) {
    this.types.forEach((typePath) => {
      const contents = fs.readFileSync(typePath, 'utf8');
      const filename = path.basename(typePath);

      fs.outputFileSync(path.join(rootDir, 'types', filename), contents);
    });
  }

  private replaceFileExtToJs(filePath: string): string {
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = path.extname(filePath);
    return filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
  }
}
