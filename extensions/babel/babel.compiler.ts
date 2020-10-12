import * as babel from '@babel/core';
import { mapSeries } from 'bluebird';
import fs from 'fs-extra';
import { BuildContext, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import { Compiler, TranspileOpts, TranspileOutput } from '@teambit/compiler';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import path from 'path';
import { BabelCompilerOptions } from './compiler-options';
import { BabelAspect } from './babel.aspect';

export class BabelCompiler implements Compiler {
  constructor(private logger: Logger, private options: BabelCompilerOptions) {}

  /**
   * compile one file on the workspace
   */
  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    const fileExtension = path.extname(options.filePath);
    if (!supportedExtensions.includes(fileExtension) || options.filePath.endsWith('.d.ts')) {
      return null; // file is not supported
    }
    const transformOptions = this.options.babelTransformOptions || {};
    // the `sourceRoot` and `sourceFileName` are manually set because the dists are written into the
    // node_modules dir, so the debugger needs to know where to find the source.
    transformOptions.sourceRoot = options.componentDir;
    transformOptions.sourceFileName = options.filePath;
    const result = babel.transformSync(fileContent, this.options.babelTransformOptions);
    if (!result) {
      throw new Error(`babel returns no result`);
    }
    const code = result.code || '';
    const outputPath = this.replaceFileExtToJs(options.filePath);
    const mapFilePath = `${outputPath}.map`;
    const outputText = result.map ? `${code}\n\n//# sourceMappingURL=${mapFilePath}` : code;
    const outputFiles = [{ outputText, outputPath }];
    if (result.map) {
      outputFiles.push({
        outputText: JSON.stringify(result.map),
        outputPath: mapFilePath,
      });
    }
    return outputFiles;
  }

  /**
   * compile multiple components on the capsules
   */
  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const capsules = context.capsuleGraph.seedersCapsules;
    const componentsResults: ComponentResult[] = [];
    const longProcessLogger = this.logger.createLongProcessLogger('compile babel components', capsules.length);
    await mapSeries(capsules, async (capsule) => {
      const currentComponentResult: Partial<ComponentResult> = { errors: [] };
      currentComponentResult.component = capsule.component;
      currentComponentResult.startTime = Date.now();
      longProcessLogger.logProgress(capsule.component.id.toString());
      await this.buildOneCapsule(capsule);
      currentComponentResult.endTime = Date.now();
      componentsResults.push({ ...currentComponentResult } as ComponentResult);
    });

    return {
      artifacts: this.getArtifactDefinition(),
      componentsResults,
    };
  }

  private async buildOneCapsule(capsule: Capsule) {
    const sourceFiles = capsule.component.filesystem.files.map((file) => file.relative);
    await fs.ensureDir(path.join(capsule.path, this.getDistDir()));
    await Promise.all(
      sourceFiles.map(async (filePath) => {
        const result = await babel.transformFileAsync(
          path.join(capsule.path, filePath),
          this.options.babelTransformOptions
        );
        if (!result || !result.code) return;
        capsule.fs.writeFileSync(path.join(this.getDistDir(), filePath), result.code);
        if (result.map) {
          capsule.fs.writeFileSync(path.join(this.getDistDir(), `${filePath}.map`), result.map.mappings);
        }
      })
    );
  }

  getArtifactDefinition() {
    return [
      {
        generatedBy: BabelAspect.id,
        name: 'dist',
        globPatterns: [`${this.getDistDir()}/**`],
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
    return (
      (filePath.endsWith('.ts') ||
        filePath.endsWith('.tsx') ||
        filePath.endsWith('.js') ||
        filePath.endsWith('.jsx')) &&
      !filePath.endsWith('.d.ts')
    );
  }

  private replaceFileExtToJs(filePath: string): string {
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = path.extname(filePath);
    return filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
  }
}
