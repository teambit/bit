import { BuildContext, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import { Compiler, TranspileOpts, TranspileOutput } from '@teambit/compiler';
import { ComponentID } from '@teambit/component';
import { Network } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import fs from 'fs-extra';
import path from 'path';
import ts from 'typescript';

import { TypeScriptCompilerOptions } from './compiler-options';

type ComponentError = { componentId: ComponentID; error: string };

export class TypescriptCompiler implements Compiler {
  constructor(private logger: Logger, private options: TypeScriptCompilerOptions) {}

  /**
   * compile one file on the workspace
   */
  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    const supportedExtensions = ['.ts', '.tsx'];
    const fileExtension = path.extname(options.filePath);
    if (!supportedExtensions.includes(fileExtension) || options.filePath.endsWith('.d.ts')) {
      return null; // file is not supported
    }
    const compilerOptionsFromTsconfig = ts.convertCompilerOptionsFromJson(this.options.tsconfig.compilerOptions, '.');
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

  /**
   * compile multiple components on the capsules
   */
  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const capsules = context.capsuleGraph.capsules;
    const capsuleDirs = capsules.getAllCapsuleDirs();
    await this.writeTsConfig(capsuleDirs);
    await this.writeTypes(capsuleDirs);

    const componentsResults = await this.runTscBuild(context.capsuleGraph);

    return {
      artifacts: this.getArtifactDefinition(),
      componentsResults,
    };
  }

  getArtifactDefinition() {
    return [
      {
        name: 'dist',
        globPatterns: [`${this.getDistDir()}/**`, '!dist/tsconfig.tsbuildinfo'],
      },
    ];
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

  /**
   * whether typescript is able to compile the given path
   */
  isFileSupported(filePath: string): boolean {
    return (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && !filePath.endsWith('.d.ts');
  }

  getNpmIgnoreEntries() {
    // when using project-references, typescript adds a file "tsconfig.tsbuildinfo" which is not
    // needed for the package.
    return [`${this.getDistDir()}/tsconfig.tsbuildinfo`];
  }

  /**
   * we have two options here:
   * 1. pass all capsules-dir at the second parameter of createSolutionBuilder and then no
   * need to write the main tsconfig.json with all the references.
   * 2. write main tsconfig.json and pass the capsules root-dir.
   * we went with option #2 because it'll be easier for users to go to the capsule-root and run
   * `tsc --build` to debug issues.
   */
  private async runTscBuild(capsuleGraph: Network): Promise<ComponentResult[]> {
    const rootDir = capsuleGraph.capsulesRootDir;
    const capsules = capsuleGraph.capsules;
    const capsuleDirs = capsules.getAllCapsuleDirs();
    const formatHost = {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: () => '', // it helps to get the files with absolute paths
      getNewLine: () => ts.sys.newLine,
    };
    const componentsResults: ComponentResult[] = [];
    let currentComponentResult: Partial<ComponentResult> = { errors: [] };
    const reportDiagnostic = (diagnostic: ts.Diagnostic) => {
      const errorStr = process.stdout.isTTY
        ? ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost)
        : ts.formatDiagnostic(diagnostic, formatHost);
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
    const host = ts.createSolutionBuilderHost(
      undefined,
      undefined,
      reportDiagnostic,
      reportSolutionBuilderStatus,
      errorCounter
    );
    await this.writeProjectReferencesTsConfig(rootDir, capsuleDirs);
    const solutionBuilder = ts.createSolutionBuilder(host, [rootDir], { verbose: true });
    let nextProject;
    const longProcessLogger = this.logger.createLongProcessLogger('compile typescript components', capsules.length);
    // eslint-disable-next-line no-cond-assign
    while ((nextProject = solutionBuilder.getNextInvalidatedProject())) {
      const capsulePath = nextProject.project.replace(`${path.sep}tsconfig.json`, '');
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

  /**
   * the message is something like: "Building project '/Users/davidfirst/Library/Caches/Bit/capsules/dce2c8055fc028cc39ab2636b027e74c76a6140b/marketing_testimonial/tsconfig.json'..."
   * fetch the capsule path from this message.
   */
  private getCapsulePathFromBuilderStatus(msg: string): string | null {
    // @ts-ignore
    if (!msg || !msg.includes('Building project' || !msg.includes("'"))) return null;
    const msgTextSplit = msg.split("'");
    if (msgTextSplit.length < 2) return null;
    return msgTextSplit[1];
  }
}
