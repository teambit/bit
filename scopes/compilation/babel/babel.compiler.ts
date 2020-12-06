import * as babel from '@babel/core';
import mapSeries from 'p-map-series';
import fs from 'fs-extra';
import { BuildContext, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import { Compiler, CompilerMain, TranspileOpts, TranspileOutput } from '@teambit/compiler';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import path from 'path';
import { BabelCompilerOptions } from './compiler-options';

export class BabelCompiler implements Compiler {
  distDir: string;
  distGlobPatterns: string[];
  shouldCopyNonSupportedFiles: boolean;
  artifactName: string;
  constructor(
    readonly id: string,
    private logger: Logger,
    private compiler: CompilerMain,
    private options: BabelCompilerOptions,
    private babelModule = babel
  ) {
    this.distDir = options.distDir || 'dist';
    this.distGlobPatterns = options.distGlobPatterns || [`${this.distDir}/**`, `!${this.distDir}/tsconfig.tsbuildinfo`];
    this.shouldCopyNonSupportedFiles =
      typeof options.shouldCopyNonSupportedFiles === 'boolean' ? options.shouldCopyNonSupportedFiles : true;
    this.artifactName = options.artifactName || 'dist';
  }

  displayName = 'Babel';

  version() {
    return this.babelModule.version;
  }

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
    transformOptions.filename = options.filePath;
    this.setConfigFileFalse();
    const result = this.babelModule.transformSync(fileContent, this.options.babelTransformOptions);
    if (!result) {
      this.logger.debug(
        `getting an empty response from Babel for the file ${options.filePath}. it might be configured to be ignored`
      );
      return null;
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
    const capsules = context.capsuleNetwork.seedersCapsules;
    const componentsResults: ComponentResult[] = [];
    this.setConfigFileFalse();
    const longProcessLogger = this.logger.createLongProcessLogger('compile babel components', capsules.length);
    await mapSeries(capsules, async (capsule) => {
      const currentComponentResult: ComponentResult = {
        errors: [],
        component: capsule.component,
      };
      longProcessLogger.logProgress(capsule.component.id.toString());
      await this.buildOneCapsule(capsule, currentComponentResult);
      componentsResults.push({ ...currentComponentResult } as ComponentResult);
    });

    return {
      artifacts: this.getArtifactDefinition(),
      componentsResults,
    };
  }

  createTask(name = 'BabelCompiler') {
    return this.compiler.createTask(name, this);
  }

  private async buildOneCapsule(capsule: Capsule, componentResult: ComponentResult) {
    componentResult.startTime = Date.now();
    const sourceFiles = capsule.component.filesystem.files.map((file) => file.relative);
    await fs.ensureDir(path.join(capsule.path, this.distDir));
    await Promise.all(
      sourceFiles.map(async (filePath) => {
        if (!this.isFileSupported(filePath)) {
          return;
        }
        let result;
        const absoluteFile = path.join(capsule.path, filePath);
        try {
          result = await this.babelModule.transformFileAsync(absoluteFile, this.options.babelTransformOptions);
        } catch (err) {
          componentResult.errors?.push(err);
        }
        if (!result || !result.code) {
          this.logger.debug(
            `getting an empty response from Babel for the file ${filePath}. it might be configured to be ignored`
          );
          return;
        }
        const distPath = this.replaceFileExtToJs(filePath);
        const distPathMap = `${distPath}.map`;
        const code = result.code || '';
        const outputText = result.map ? `${code}\n\n//# sourceMappingURL=${distPathMap}` : code;
        await fs.outputFile(path.join(capsule.path, this.distDir, distPath), outputText);
        if (result.map) {
          await fs.outputFile(path.join(capsule.path, this.distDir, distPathMap), JSON.stringify(result.map));
        }
      })
    );
    componentResult.endTime = Date.now();
  }

  /**
   * if it's not false, it searches for config files, which is probably not the expected behavior
   * here as the configuration is passed programmatically.
   * practically, when the configFile is not set, babel returns `null` for all files in the capsule
   */
  private setConfigFileFalse() {
    this.options.babelTransformOptions = this.options.babelTransformOptions || {};
    this.options.babelTransformOptions.configFile = this.options.babelTransformOptions.configFile || false;
    this.options.babelTransformOptions.babelrc = this.options.babelTransformOptions.babelrc || false;
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
   * whether babel is able to compile the given path
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

  displayConfig() {
    return JSON.stringify(this.options.babelTransformOptions || {}, null, 4);
  }

  private replaceFileExtToJs(filePath: string): string {
    if (!this.isFileSupported(filePath)) return filePath;
    const fileExtension = path.extname(filePath);
    return filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
  }
}
