import * as babel from '@babel/core';
import mapSeries from 'p-map-series';
import fs from 'fs-extra';
import { BuildContext, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import { Compiler, CompilerMain, TranspileOpts, TranspileOutput } from '@teambit/compiler';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import path from 'path';
import {
  isFileSupported,
  transpileFileContent,
  transpileFilePathAsync,
  replaceFileExtToJs,
  TranspileContext,
} from '@teambit/compilation.modules.babel-compiler';
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
    const context: TranspileContext = {
      filePath: options.filePath,
      rootDir: options.componentDir,
    };
    const outputFiles = transpileFileContent(fileContent, context, transformOptions, this.babelModule);
    return outputFiles;
  }

  /**
   * compile multiple components on the capsules
   */
  async build(context: BuildContext): Promise<BuiltTaskResult> {
    const capsules = context.capsuleNetwork.seedersCapsules;
    const componentsResults: ComponentResult[] = [];
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
        const absoluteFilePath = path.join(capsule.path, filePath);
        try {
          const result = await transpileFilePathAsync(
            absoluteFilePath,

            this.options.babelTransformOptions || {},

            this.babelModule
          );
          if (!result || !result.length) {
            this.logger.debug(
              `getting an empty response from Babel for the file ${filePath}. it might be configured to be ignored`
            );
            return;
          }
          // Make sure to get only the relative path of the dist because we want to add the dist dir.
          // If we use the result outputPath we will get an absolute path here
          const distPath = this.replaceFileExtToJs(filePath);
          const distPathMap = `${distPath}.map`;
          await fs.outputFile(path.join(capsule.path, this.distDir, distPath), result[0].outputText);
          if (result.length > 1) {
            await fs.outputFile(path.join(capsule.path, this.distDir, distPathMap), result[1].outputText);
          }
        } catch (err) {
          componentResult.errors?.push(err);
        }
      })
    );
    componentResult.endTime = Date.now();
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
    return isFileSupported(filePath);
  }

  displayConfig() {
    return JSON.stringify(this.options.babelTransformOptions || {}, null, 2);
  }

  private replaceFileExtToJs(filePath: string): string {
    return replaceFileExtToJs(filePath);
  }
}
