import { join } from 'path';
import pMapSeries from 'p-map-series';
import {
  Compiler,
  CompilerOptions,
  TranspileComponentParams,
  TranspileFileOutput,
  TranspileFileParams,
} from '@teambit/compiler';
import { BuiltTaskResult, BuildContext, TaskResultsList } from '@teambit/builder';
import { mergeComponentResults } from '@teambit/pipelines.modules.merge-component-results';
import { Component } from '@teambit/component';

export type MultiCompilerOptions = {
  targetExtension?: string;
};

export class MultiCompiler implements Compiler {
  displayName = 'Multi compiler';

  shouldCopyNonSupportedFiles =
    typeof this.compilerOptions.shouldCopyNonSupportedFiles === 'boolean'
      ? this.compilerOptions.shouldCopyNonSupportedFiles
      : true;
  distDir = 'dist';

  constructor(
    readonly id: string,
    readonly compilers: Compiler[],
    readonly compilerOptions: Partial<CompilerOptions> = {},
    readonly options: MultiCompilerOptions = {}
  ) {}

  getDistDir() {
    return this.distDir;
  }

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
  transpileFile(fileContent: string, options: TranspileFileParams): TranspileFileOutput {
    const outputs = this.compilers.reduce<any>(
      (files, compiler) => {
        if (!compiler.transpileFile) {
          return files;
        }
        return files?.flatMap((file) => {
          if (!compiler.isFileSupported(file?.outputPath)) return [file];
          const params = Object.assign({}, options, {
            filePath: file.outputPath,
          });
          const compiledContent = compiler.transpileFile?.(file.outputText, params);
          if (!compiledContent) return null;

          return compiledContent;
        });
      },
      [{ outputText: fileContent, outputPath: options.filePath }]
    );

    return outputs;
  }

  async transpileComponent(params: TranspileComponentParams): Promise<void> {
    await Promise.all(
      this.compilers.map((compiler) => {
        return compiler.transpileComponent?.(params);
      })
    );
  }

  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const builds = await pMapSeries(this.compilers, async (compiler) => {
      const buildResult = await compiler.build(context);
      return buildResult.componentsResults;
    });

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

  private firstMatchedCompiler(filePath: string): Compiler | undefined {
    return this.compilers.find((compiler) => compiler.isFileSupported(filePath));
  }

  getPreviewComponentRootPath(component: Component): string {
    const matchedCompiler = this.compilers.find(
      (compiler) => typeof compiler.getPreviewComponentRootPath !== 'undefined'
    );
    if (!matchedCompiler) {
      return '';
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return matchedCompiler.getPreviewComponentRootPath!(component);
  }

  /**
   * given a source file, return its parallel in the dists. e.g. "index.ts" => "dist/index.js"
   * both, the return path and the given path are relative paths.
   */
  getDistPathBySrcPath(srcPath: string): string {
    const matchedCompiler = this.firstMatchedCompiler(srcPath);
    if (!matchedCompiler) {
      return join(this.distDir, srcPath);
    }

    return matchedCompiler.getDistPathBySrcPath(srcPath);
  }

  /**
   * only supported files matching get compiled. others, are copied to the dist dir.
   */
  isFileSupported(filePath: string): boolean {
    return !!this.firstMatchedCompiler(filePath);
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
