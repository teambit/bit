import { glob } from 'glob';
import { BuildContext, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import typescript from 'typescript';
import { EnvContext, EnvHandler } from '@teambit/envs';
import { Compiler, TranspileFileParams, TranspileFileOutput } from '@teambit/compiler';
import { CapsuleList, Network } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { compact, uniq } from 'lodash';
import fs from 'fs-extra';
import path from 'path';
import { BitError } from '@teambit/bit-error';
import { TypeScriptCompilerOptions } from './typescript-compiler-options';
import { computeTsConfig } from './get-ts-config';
import { resolveTypes } from './resolve-types';

export class TypescriptCompiler implements Compiler {
  distDir: string;

  distGlobPatterns: string[];

  shouldCopyNonSupportedFiles: boolean;

  artifactName: string;

  constructor(
    readonly id: string = 'typescript-compiler',
    private logger: Logger,
    private options: TypeScriptCompilerOptions,
    private rawTsConfig: Record<string, any>,
    private tsModule: typeof typescript
  ) {
    this.distDir = options.distDir || 'dist';
    this.distGlobPatterns = options.distGlobPatterns || [`${this.distDir}/**`, `!${this.distDir}/tsconfig.tsbuildinfo`];
    this.shouldCopyNonSupportedFiles =
      typeof options.shouldCopyNonSupportedFiles === 'boolean' ? options.shouldCopyNonSupportedFiles : true;
    this.artifactName = options.artifactName || 'dist';
    this.rawTsConfig ||= {};
    this.rawTsConfig.compilerOptions ||= {};
    // mutate the outDir, otherwise, on capsules, the dists might be written to a different directory and make confusion
    this.rawTsConfig.compilerOptions.outDir = this.distDir;
    this.options.types = this.options.types || this.getDefaultGlobalTypes();
    this.options.compileJs ??= true;
    this.options.compileJsx ??= true;
  }

  // eslint-disable-next-line react/static-property-placement
  displayName = 'TypeScript';

  deleteDistDir = false;

  /**
   * get the computed tsconfig for the instance.
   * TODO: @gilad support transformers here.
   */
  get tsconfig() {
    return this.rawTsConfig;
  }

  displayConfig() {
    return this.stringifyTsconfig(this.tsconfig);
  }

  getDistDir() {
    return this.distDir;
  }

  /**
   * compile one file on the workspace
   */
  transpileFile(fileContent: string, options: TranspileFileParams): TranspileFileOutput {
    if (!this.isFileSupported(options.filePath)) {
      return null; // file is not supported
    }
    const compilerOptionsFromTsconfig = this.tsModule.convertCompilerOptionsFromJson(
      this.rawTsConfig.compilerOptions,
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
    const typescriptTransformers = this.options.typescriptTransformers || {};
    // const fileName = this.getFilePathForTranspileFile(options.filePath);
    if (this.options.esm) {
      compilerOptions.module = this.tsModule.ModuleKind.ESNext;
      compilerOptions.moduleResolution = this.tsModule.ModuleResolutionKind.Node10;
    }
    const fileName = options.filePath;
    const result = this.tsModule.transpileModule(fileContent, {
      compilerOptions,
      fileName,
      reportDiagnostics: true,
      transformers: typescriptTransformers,
    });

    if (result.diagnostics && result.diagnostics.length) {
      const formatHost = this.getFormatDiagnosticsHost();
      const error = this.tsModule.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost);

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
    await this.writeTsConfig(capsules, context.capsuleNetwork);
    await this.writeTypes(capsuleDirs, context.envDefinition.id);
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

  /**
   * The postBuild function processes and modifies .cjs files in the originalSeedersCapsules of the context's capsule
   * network.
   * It will remove the `export {};` statement from the end of the .cjs files.
   * As this is not valid JavaScript, it is necessary to remove this statement to ensure that the .cjs files can be used
   * as expected.
   * See: https://github.com/microsoft/TypeScript/issues/50647
   * Once this is merged into the TypeScript compiler, this function will no longer be necessary.
   * @param {BuildContext} context - The `context` parameter in the `postBuild` function seems to be of type
   * `BuildContext`. It is used to access information and perform actions related to the build process. In the provided
   * code snippet, the `postBuild` function is processing capsules in the `capsuleNetwork` of the context
   */
  async postBuild(context: BuildContext): Promise<void> {
    await Promise.all(
      context.capsuleNetwork.originalSeedersCapsules.map(async (capsule) => {
        const distdir = path.join(capsule.path, this.distDir);
        const cjsFiles = await glob('**/*.cjs', { cwd: distdir });
        await Promise.all(
          cjsFiles.map(async (cjsFile) => {
            const content = await fs.readFile(path.join(distdir, cjsFile), 'utf8');
            const newContent = content.replace('export {};', '');
            await fs.writeFile(path.join(distdir, cjsFile), newContent);
          })
        );
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
    const isSupported =
      (['.ts', '.tsx', '.mts', '.cts', '.mtsx', '.ctsx'].some((ext) => filePath.endsWith(ext)) ||
        isJsAndCompile ||
        isJsxAndCompile) &&
      !filePath.endsWith('.d.ts');
    return isSupported;
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
    const capsules = await network.getCapsulesToCompile();
    if (!capsules.length) {
      return [];
    }
    const capsuleDirs = capsules.getAllCapsuleDirs();
    const formatHost = {
      getCanonicalFileName: (p: any) => p,
      getCurrentDirectory: () => '', // it helps to get the files with absolute paths
      getNewLine: () => this.tsModule.sys.newLine,
    };
    const componentsResults: ComponentResult[] = [];
    let currentComponentResult: Partial<ComponentResult> = { errors: [] };
    const reportDiagnostic = (diagnostic: typescript.Diagnostic) => {
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
    const reportSolutionBuilderStatus = (diag: typescript.Diagnostic) => {
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
    // the reason we use the "getNextInvalidatedProject()" way and not simply "build()" is that we want to log
    // per component. show the counter in the output and save the errors and execution time per component.
    // it's not possible to achieve this by running "build()", which simply builds all packages and only emits debug
    // and diagnostic messages.
    // eslint-disable-next-line no-cond-assign
    while ((nextProject = solutionBuilder.getNextInvalidatedProject())) {
      // regex to make sure it will work correctly for both linux and windows
      // it replaces both /tsconfig.json and \tsocnfig.json
      const capsulePath = nextProject.project.replace(/[/\\]tsconfig.json/, '');
      const currentComponentId = network.graphCapsules.getIdByPathInCapsule(capsulePath);
      if (!currentComponentId) throw new Error(`unable to find component for ${capsulePath}`);
      longProcessLogger.logProgress(currentComponentId.toString());
      const capsule = network.graphCapsules.getCapsule(currentComponentId);
      if (!capsule) throw new Error(`unable to find capsule for ${currentComponentId.toString()}`);
      currentComponentResult.component = capsule.component;
      currentComponentResult.startTime = Date.now();
      nextProject.done(undefined, undefined, this.options.typescriptTransformers);
      currentComponentResult.endTime = Date.now();
      componentsResults.push({ ...currentComponentResult } as ComponentResult);
      currentComponentResult = { errors: [] };
    }
    longProcessLogger.end();
    if (!componentsResults.length) {
      // at this stage we know that our tsconfig.json contains capsules, so we expect componentsResults to be filled.
      // there are two reasons why this is not the case:
      // 1. all capsules are up to date.
      // 2. there was some error trying to get the packages to compile. for example, the tsconfig.json of the packages
      // have circular dependencies. (we already take care of this case and don't write the references, but just for the
      // case we missed something). in this case, `solutionBuilder.getNextInvalidatedProject()` returns undefined because
      // it has no package to compile. it doesn't throw an error. obviously, we it's not good for us. we want to know
      // that nothing was compiled. therefore, we run "build()", which is exactly the same as "tsc --build" in the
      // terminal.
      // anyway, those two cases are extremely rare, so we don't need to worry about performance.
      // in case the packages are already up to date, the "build()" won't do anything.
      solutionBuilder.build();
    }

    return componentsResults;
  }

  private getFormatDiagnosticsHost(): typescript.FormatDiagnosticsHost {
    return {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: this.tsModule.sys.getCurrentDirectory,
      getNewLine: () => this.tsModule.sys.newLine,
    };
  }

  private getDefaultGlobalTypes(): string[] {
    return resolveTypes(__dirname, ['global-types']);
  }

  private async writeTypes(dirs: string[], envId: string) {
    const types = this.options.types || this.getDefaultGlobalTypes();
    this.removeDuplicateTypes(envId);
    await Promise.all(
      types.map(async (typePath) => {
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

  private removeDuplicateTypes(envId: string) {
    if (!this.options.types || !this.options.types.length) return;
    const filenames = this.options.types.map((typePath) => path.basename(typePath));
    const duplicatedFilenames = filenames.filter((filename, index) => filenames.indexOf(filename) !== index);
    if (!duplicatedFilenames.length) return;
    uniq(duplicatedFilenames).forEach((filename) => {
      const fullPaths = this.options.types!.filter((typePath) => path.basename(typePath) === filename);
      this.logger.consoleWarning(
        `typescript compiler: found duplicated types file "${filename}", keeping the last one\n${fullPaths.join('\n')}`
      );
      const pathsToRemove = fullPaths.slice(0, fullPaths.length - 1); // keep only the last one
      this.options.types = this.options.types!.filter((typePath) => !pathsToRemove.includes(typePath));
    });
    this.logger.consoleWarning(`the following files are written: ${this.options.types.join('\n')}
It's recommended to fix the env (${envId}) configuration to have only one file per type.`);
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
    const files: string[] = [];
    const references = projects.map((project) => ({ path: project }));
    const tsconfig = { files, references };
    const tsconfigStr = this.stringifyTsconfig(tsconfig);
    await fs.writeFile(path.join(rootDir, 'tsconfig.json'), tsconfigStr);
  }

  private async writeTsConfig(capsules: CapsuleList, network: Network) {
    if (!capsules.length) return [];
    const someCapsule = capsules[0];
    const hasGetDependenciesAPI = Boolean(someCapsule.component.getDependencies);
    // @ts-ignore this is a new API. Remove once deployed.
    const hasGetGraphIdsAPI = Boolean(capsules.getGraphIds);
    const writeTsConfigWithoutProjectReferences = async () => {
      const dirs = capsules.getAllCapsuleDirs();
      const tsconfigStr = this.stringifyTsconfig(this.rawTsConfig);
      await Promise.all(dirs.map((dir) => fs.writeFile(path.join(dir, 'tsconfig.json'), tsconfigStr)));
    };
    if (!hasGetDependenciesAPI || !hasGetGraphIdsAPI) {
      this.logger.consoleWarning(
        `typescript compiler: please update bit version to support references property in tsconfig.json`
      );
      return writeTsConfigWithoutProjectReferences();
    }
    // @ts-ignore this is a new API. Remove once deployed.
    const graph = capsules.getGraphIds();
    if (graph.isCyclic()) {
      this.logger
        .consoleWarning(`typescript compiler: your capsules have circular dependencies, the optimization of Project Reference is disabled.
Please run "bit insights" to see the circular dependencies`);
      return writeTsConfigWithoutProjectReferences();
    }

    const idsPathsMap: Record<string, string> = {};
    const capsulesToCompile = await network.getCapsulesToCompile();

    await Promise.all(
      capsulesToCompile.map(async (current) => {
        idsPathsMap[current.component.id.toString()] = current.path;
      })
    );
    await Promise.all(
      capsules.map(async (capsule) => {
        const deps = capsule.component.getDependencies();
        const paths = deps.map((dep) => idsPathsMap[dep.id]);
        const customTsconfig = { ...this.rawTsConfig };
        customTsconfig.references = compact(paths).map((p) => ({ path: p }));
        customTsconfig.compilerOptions = customTsconfig.compilerOptions || {};
        customTsconfig.compilerOptions.composite = true;
        await fs.writeFile(path.join(capsule.path, 'tsconfig.json'), this.stringifyTsconfig(customTsconfig));
      })
    );
    return undefined;
  }

  private stringifyTsconfig(tsconfig: Record<string, any>) {
    return JSON.stringify(tsconfig, undefined, 2);
  }

  private replaceFileExtToJs(filePath: string): string {
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = path.extname(filePath);
    // take into account mts, cts, mtsx, ctsx, etc.
    const replacement = fileExtension.replace(/([tj]sx?)$/, 'js');
    return filePath.replace(new RegExp(`${fileExtension}$`), replacement); // makes sure it's the last occurrence
  }

  version() {
    return this.tsModule.version;
  }

  static create(options: TypeScriptCompilerOptions, { logger }: { logger: Logger }): Compiler {
    const name = options.name || 'typescript-compiler';
    const rawTsConfig = computeTsConfig({
      tsconfig: options.tsconfig,
      compilerOptions: options.compilerOptions,
    });

    return new TypescriptCompiler(name, logger, options, rawTsConfig, options.typescript || typescript);
  }

  static from(options: TypeScriptCompilerOptions): EnvHandler<Compiler> {
    return (context: EnvContext) => {
      const name = options.name || 'typescript-compiler';
      const logger = context.createLogger(name);
      return TypescriptCompiler.create(options, { logger });
    };
  }
}
