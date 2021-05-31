import { BuildContext, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import { Compiler, TranspileOpts, TranspileOutput } from '@teambit/compiler';
import { Network } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import fs from 'fs-extra';
import path from 'path';
import ts from 'typescript';
import { BitError } from '@teambit/bit-error';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import { TypeScriptCompilerOptions } from './compiler-options';

export class TypescriptCompiler implements Compiler {
  distDir: string;
  distGlobPatterns: string[];
  shouldCopyNonSupportedFiles: boolean;
  artifactName: string;
  constructor(
    readonly id: string,
    private logger: Logger,
    private options: TypeScriptCompilerOptions,
    private tsModule: typeof ts
  ) {
    this.distDir = options.distDir || 'dist';
    this.distGlobPatterns = options.distGlobPatterns || [`${this.distDir}/**`, `!${this.distDir}/tsconfig.tsbuildinfo`];
    this.shouldCopyNonSupportedFiles =
      typeof options.shouldCopyNonSupportedFiles === 'boolean' ? options.shouldCopyNonSupportedFiles : true;
    this.artifactName = options.artifactName || 'dist';
  }

  displayName = 'TypeScript';

  displayConfig() {
    return this.stringifyTsconfig(this.options.tsconfig);
  }

  /**
   * compile one file on the workspace
   */
  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    if (!this.isFileSupported(options.filePath)) {
      return null; // file is not supported
    }
    const compilerOptionsFromTsconfig = this.tsModule.convertCompilerOptionsFromJson(
      this.options.tsconfig.compilerOptions,
      '.'
    );
    if (compilerOptionsFromTsconfig.errors.length) {
      // :TODO @david replace to a more concrete error type and put in 'exceptions' directory here.
      const formattedErrors = this.tsModule.formatDiagnosticsWithColorAndContext(
        compilerOptionsFromTsconfig.errors,
        this.getFormatDiagnosticsHost()
      );
      throw new Error(`failed parsing the tsconfig.json.\n${formattedErrors}`);
    }

    const compilerOptions = compilerOptionsFromTsconfig.options;
    compilerOptions.sourceRoot = options.componentDir;
    compilerOptions.rootDir = '.';
    const result = this.tsModule.transpileModule(fileContent, {
      compilerOptions,
      fileName: options.filePath,
      reportDiagnostics: true,
    });

    if (result.diagnostics && result.diagnostics.length) {
      const formatHost = this.getFormatDiagnosticsHost();
      const error = this.tsModule.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost);

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

  async preBuild(context: BuildContext) {
    const capsules = context.capsuleNetwork.seedersCapsules;
    const capsuleDirs = capsules.map((capsule) => capsule.path);
    await this.writeTsConfig(capsuleDirs);
    await this.writeTypes(capsuleDirs);
    await this.writeNpmIgnore(capsuleDirs);
  }

  /**
   * compile multiple components on the capsules
   */
  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const componentsResults = await this.runTscBuild(context.capsuleNetwork);

    return {
      artifacts: this.getArtifactDefinition(),
      componentsResults,
    };
  }

  async postBuild(context: BuildContext) {
    await Promise.all(
      context.capsuleNetwork.seedersCapsules.map(async (capsule) => {
        const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);
        // the types['index.ts'] is needed only during the build to avoid errors when tsc finds the
        // same type once in the d.ts and once in the ts file.
        if (packageJson.packageJsonObject.types) {
          delete packageJson.packageJsonObject.types;
          await packageJson.write();
        }
      })
    );
  }

  getArtifactDefinition() {
    return [
      {
        generatedBy: this.id,
        name: this.artifactName,
        globPatterns: this.distGlobPatterns,
      },
    ];
  }

  /**
   * given a source file, return its parallel in the dists. e.g. index.ts => dist/index.js
   */
  getDistPathBySrcPath(srcPath: string) {
    const fileWithJSExtIfNeeded = this.replaceFileExtToJs(srcPath);
    return path.join(this.distDir, fileWithJSExtIfNeeded);
  }

  /**
   * whether typescript is able to compile the given path
   */
  isFileSupported(filePath: string): boolean {
    const isJsAndCompile = !!this.options.compileJs && filePath.endsWith('.js');
    const isJsxAndCompile = !!this.options.compileJsx && filePath.endsWith('.jsx');
    return (
      (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || isJsAndCompile || isJsxAndCompile) &&
      !filePath.endsWith('.d.ts')
    );
  }

  /**
   * we have two options here:
   * 1. pass all capsules-dir at the second parameter of createSolutionBuilder and then no
   * need to write the main tsconfig.json with all the references.
   * 2. write main tsconfig.json and pass the capsules root-dir.
   * we went with option #2 because it'll be easier for users to go to the capsule-root and run
   * `tsc --build` to debug issues.
   */
  private async runTscBuild(network: Network): Promise<ComponentResult[]> {
    const rootDir = network.capsulesRootDir;
    const capsules = network.graphCapsules;
    const capsuleDirs = capsules.getAllCapsuleDirs();
    const formatHost = {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: () => '', // it helps to get the files with absolute paths
      getNewLine: () => this.tsModule.sys.newLine,
    };
    const componentsResults: ComponentResult[] = [];
    let currentComponentResult: Partial<ComponentResult> = { errors: [] };
    const reportDiagnostic = (diagnostic: ts.Diagnostic) => {
      const errorStr = process.stdout.isTTY
        ? this.tsModule.formatDiagnosticsWithColorAndContext([diagnostic], formatHost)
        : this.tsModule.formatDiagnostic(diagnostic, formatHost);
      if (!diagnostic.file) {
        // the error is general and not related to a specific file. e.g. tsconfig is missing.
        throw new BitError(errorStr);
      }
      this.logger.consoleFailure(errorStr);
      if (!currentComponentResult.component || !currentComponentResult.errors) {
        throw new Error(`currentComponentResult is not defined yet for ${diagnostic.file}`);
      }
      currentComponentResult.errors.push(errorStr);
    };
    // this only works when `verbose` is `true` in the `ts.createSolutionBuilder` function.
    const reportSolutionBuilderStatus = (diag: ts.Diagnostic) => {
      const msg = diag.messageText as string;
      this.logger.debug(msg);
    };
    const errorCounter = (errorCount: number) => {
      this.logger.info(`total error found: ${errorCount}`);
    };
    const host = this.tsModule.createSolutionBuilderHost(
      undefined,
      undefined,
      reportDiagnostic,
      reportSolutionBuilderStatus,
      errorCounter
    );
    await this.writeProjectReferencesTsConfig(rootDir, capsuleDirs);
    const solutionBuilder = this.tsModule.createSolutionBuilder(host, [rootDir], { verbose: true });
    let nextProject;
    const longProcessLogger = this.logger.createLongProcessLogger('compile typescript components', capsules.length);
    // eslint-disable-next-line no-cond-assign
    while ((nextProject = solutionBuilder.getNextInvalidatedProject())) {
      // regex to make sure it will work correctly for both linux and windows
      // it replaces both /tsconfig.json and \tsocnfig.json
      const capsulePath = nextProject.project.replace(/[/\\]tsconfig.json/, '');
      const currentComponentId = capsules.getIdByPathInCapsule(capsulePath);
      if (!currentComponentId) throw new Error(`unable to find component for ${capsulePath}`);
      longProcessLogger.logProgress(currentComponentId.toString());
      const capsule = capsules.getCapsule(currentComponentId);
      if (!capsule) throw new Error(`unable to find capsule for ${currentComponentId.toString()}`);
      currentComponentResult.component = capsule.component;
      currentComponentResult.startTime = Date.now();
      nextProject.done();
      currentComponentResult.endTime = Date.now();
      componentsResults.push({ ...currentComponentResult } as ComponentResult);
      currentComponentResult = { errors: [] };
    }
    longProcessLogger.end();

    return componentsResults;
  }

  private getFormatDiagnosticsHost(): ts.FormatDiagnosticsHost {
    return {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: this.tsModule.sys.getCurrentDirectory,
      getNewLine: () => this.tsModule.sys.newLine,
    };
  }

  private async writeTypes(dirs: string[]) {
    await Promise.all(
      this.options.types.map(async (typePath) => {
        const contents = await fs.readFile(typePath, 'utf8');
        const filename = path.basename(typePath);

        await Promise.all(
          dirs.map(async (dir) => {
            const filePath = path.join(dir, 'types', filename);
            if (!(await fs.pathExists(filePath))) {
              await fs.outputFile(filePath, contents);
            }
          })
        );
      })
    );
  }

  /**
   * when using project-references, typescript adds a file "tsconfig.tsbuildinfo" which is not
   * needed for the package.
   */
  private async writeNpmIgnore(dirs: string[]) {
    const NPM_IGNORE_FILE = '.npmignore';
    await Promise.all(
      dirs.map(async (dir) => {
        const npmIgnorePath = path.join(dir, NPM_IGNORE_FILE);
        const npmIgnoreEntriesStr = `\n${this.distDir}/tsconfig.tsbuildinfo\n`;
        await fs.appendFile(npmIgnorePath, npmIgnoreEntriesStr);
      })
    );
  }

  private async writeProjectReferencesTsConfig(rootDir: string, projects: string[]) {
    const files = [];
    const references = projects.map((project) => ({ path: project }));
    const tsconfig = { files, references };
    const tsconfigStr = this.stringifyTsconfig(tsconfig);
    await fs.writeFile(path.join(rootDir, 'tsconfig.json'), tsconfigStr);
  }

  private async writeTsConfig(dirs: string[]) {
    const tsconfigStr = this.stringifyTsconfig(this.options.tsconfig);
    await Promise.all(dirs.map((capsuleDir) => fs.writeFile(path.join(capsuleDir, 'tsconfig.json'), tsconfigStr)));
  }

  private stringifyTsconfig(tsconfig) {
    return JSON.stringify(tsconfig, undefined, 2);
  }

  private replaceFileExtToJs(filePath: string): string {
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = path.extname(filePath);
    return filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
  }

  version() {
    return this.tsModule.version;
  }
}
