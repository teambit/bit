import { join, extname } from 'path';
import { Compiler, CompilerOptions, TranspileOutput, TranspileOpts } from '@teambit/compiler';
import { BuiltTaskResult, BuildContext, TaskResultsList } from '@teambit/builder';
import { mergeComponentResults } from '@teambit/modules.merge-component-results';

export type MultiCompilerOptions = {
  targetExtension?: string;
};

export class MultiCompiler implements Compiler {
  displayName = 'Multi compiler';

  shouldCopyNonSupportedFiles = this.compilerOptions.shouldCopyNonSupportedFiles || true;

  distDir = 'dist';

  constructor(
    readonly id: string,
    readonly compilers: Compiler[],
    readonly compilerOptions: Partial<CompilerOptions> = {},
    readonly options: MultiCompilerOptions = {}
  ) {}

  getArtifactDefinition() {
    return [
      {
        generatedBy: this.id,
        name: this.compilerOptions.artifactName || 'dist',
        globPatterns: this.compilerOptions.distGlobPatterns || [
          `${this.distDir}/**`,
          `!${this.distDir}/tsconfig.tsbuildinfo`,
        ],
      },
    ];
  }

  private getOptions() {
    const defaultOpts = {
      targetExtension: '.js',
    };

    return Object.assign(defaultOpts, this.options);
  }

  displayConfig() {
    return this.compilers
      .map((compiler) => {
        return `${compiler.displayName}\n${compiler.displayConfig}\n`;
      })
      .join('\n');
  }

  /**
   * the multi-compiler applies all applicable defined compilers on given content.
   */
  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    const output: TranspileOutput = [];

    this.compilers.forEach((compiler) => {
      if (!compiler.isFileSupported(options.filePath)) return fileContent;
      const compiledContent = compiler.transpileFile(fileContent, options);
      if (!compiledContent) return null;
      compiledContent[0].outputPath;
      output.push(...compiledContent);
      return compiledContent;
    }, fileContent);

    return output;
  }

  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const builds = await Promise.all(
      this.compilers.map(async (compiler) => {
        const buildResult = await compiler.build(context);
        return buildResult.componentsResults;
      })
    );

    return {
      componentsResults: mergeComponentResults(builds),
      artifacts: this.getArtifactDefinition(),
    };
  }

  async preBuild(context: BuildContext) {
    await Promise.all(
      this.compilers.map(async (compiler) => {
        if (!compiler.preBuild) return;
        await compiler.preBuild(context);
      })
    );
  }

  async postBuild(context: BuildContext, taskResults: TaskResultsList) {
    await Promise.all(
      this.compilers.map(async (compiler) => {
        if (!compiler.postBuild) return;
        await compiler.postBuild(context, taskResults);
      })
    );
  }

  private replaceFileExtToTarget(filePath: string): string {
    const { targetExtension } = this.getOptions();
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = extname(filePath);
    return filePath.replace(new RegExp(`${fileExtension}$`), targetExtension); // makes sure it's the last occurrence
  }

  /**
   * given a source file, return its parallel in the dists. e.g. "index.ts" => "dist/index.js"
   * both, the return path and the given path are relative paths.
   */
  getDistPathBySrcPath(srcPath: string): string {
    return join(this.distDir, this.replaceFileExtToTarget(srcPath));
  }

  /**
   * only supported files matching get compiled. others, are copied to the dist dir.
   */
  isFileSupported(filePath: string): boolean {
    return !!this.compilers.find((compiler) => compiler.isFileSupported(filePath));
  }

  /**
   * returns the version of the current compiler instance (e.g. '4.0.1').
   */
  version(): string {
    return this.compilers
      .map((compiler) => {
        return `${compiler.displayName}@${compiler.version()}`;
      })
      .join('\n');
  }
}
