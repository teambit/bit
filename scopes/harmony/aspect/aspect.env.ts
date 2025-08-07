import { JestTask, jestWorkerPath } from '@teambit/defender.jest-tester';
import type { JestWorker } from '@teambit/defender.jest-tester';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { BabelCompiler } from '@teambit/compilation.babel-compiler';
import type { Compiler, CompilerMain } from '@teambit/compiler';
import type {
  DependenciesEnv,
  PackageEnv,
  PipeServiceModifier,
  PipeServiceModifiersMap,
  PreviewEnv,
} from '@teambit/envs';
import { merge } from 'lodash';
import type { PackageJsonProps } from '@teambit/pkg';
import type { TsConfigSourceFile } from 'typescript';
import type { ReactEnv } from '@teambit/react';
import type { BuildTask } from '@teambit/builder';
import { CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { Bundler, BundlerContext } from '@teambit/bundler';
import type { WebpackConfigTransformer } from '@teambit/webpack';
import type { Tester } from '@teambit/tester';
import type { PreviewStrategyName } from '@teambit/preview';
import { COMPONENT_PREVIEW_STRATEGY_NAME } from '@teambit/preview';
import type { ConfigWriterEntry } from '@teambit/workspace-config-files';
import { PrettierConfigWriter } from '@teambit/defender.prettier-formatter';
import { TypescriptConfigWriter } from '@teambit/typescript.typescript-compiler';
import { EslintConfigWriter } from '@teambit/defender.eslint-linter';
import type { Logger } from '@teambit/logger';
import { join } from 'path';
import type { WorkerMain } from '@teambit/worker';

import type { DevFilesMain } from '@teambit/dev-files';
import type { TsConfigTransformer } from '@teambit/typescript';
import type { TesterTask } from '@teambit/defender.tester-task';

import { babelConfig } from './babel/babel-config';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

type GetBuildPipeModifiers = PipeServiceModifiersMap & {
  tsModifier?: PipeServiceModifier;
  jestModifier?: PipeServiceModifier;
};

/**
 * a component environment built for Aspects .
 */
export class AspectEnv implements DependenciesEnv, PackageEnv, PreviewEnv {
  constructor(
    private reactEnv: ReactEnv,
    private aspectLoader: AspectLoaderMain,
    private devFiles: DevFilesMain,
    private compiler: CompilerMain,
    private worker: WorkerMain,
    private logger: Logger
  ) {}

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  getTsConfig(tsConfig: TsConfigSourceFile) {
    const targetConf = merge(tsconfig, tsConfig);
    return targetConf;
  }

  // TODO: should probably use the transformer from the main runtime?
  // TODO: this doesn't seems to work as expected, the getTsConfig is not a transformer and the react env API expect a transformers array not an object
  createTsCompiler(tsConfig: TsConfigSourceFile): Compiler {
    return this.reactEnv.getTsCjsCompiler(this.getTsConfig(tsConfig));
  }

  getCompiler(): Compiler {
    return this.getBabelCompiler();
  }

  private getBabelCompiler() {
    const options = {
      babelTransformOptions: babelConfig,
      distDir: 'dist',
      distGlobPatterns: [`dist/**`, `!dist/**/*.d.ts`, `!dist/tsconfig.tsbuildinfo`],
    };

    const babelCompiler = BabelCompiler.create(options, { logger: this.logger });
    return babelCompiler;
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModulePath?: string): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.reactEnv.createCjsJestTester(config, jestModulePath);
  }

  /**
   * returns the component build pipeline.
   */
  getBuildPipe(modifiers: GetBuildPipeModifiers = {}): BuildTask[] {
    const transformer = (tsConfigMutator) => {
      tsConfigMutator
        .mergeTsConfig(tsconfig)
        .setArtifactName('declaration')
        .setDistGlobPatterns([`dist/**/*.d.ts`])
        .setShouldCopyNonSupportedFiles(false);
      return tsConfigMutator;
    };
    // @ts-expect-error
    const externalTransformer: TsConfigTransformer[] = modifiers?.tsModifier?.transformers || [];
    const tsCompilerTask = this.reactEnv.getCjsCompilerTask([transformer, ...externalTransformer]);
    const babelCompiler = this.getBabelCompiler();
    const babelCompilerTask = this.compiler.createTask('BabelCompiler', babelCompiler);
    const jestTesterTask = this.getJestTesterTask();

    return [babelCompilerTask, tsCompilerTask, jestTesterTask];
  }

  private getJestTesterTask(jestModifier: PipeServiceModifier = {}): TesterTask {
    const pathToSource = pathNormalizeToLinux(__dirname).replace('/dist', '');
    const jestConfigPath = jestModifier?.transformers?.[0]() || join(pathToSource, './jest/jest.config.js');
    const jestPath = jestModifier?.module || require.resolve('jest');
    const worker = this.getJestWorker();
    const testerTask = JestTask.create(
      { config: jestConfigPath, jest: jestPath },
      { logger: this.logger, worker, devFiles: this.devFiles }
    );
    return testerTask;
  }

  private getJestWorker() {
    return this.worker.declareWorker<JestWorker>('jest', jestWorkerPath);
  }

  async getTemplateBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    return this.createTemplateWebpackBundler(context, transformers);
  }

  async createTemplateWebpackBundler(
    context: BundlerContext,
    transformers: WebpackConfigTransformer[] = []
  ): Promise<Bundler> {
    return this.reactEnv.createTemplateWebpackBundler(context, transformers);
  }

  getPackageJsonProps(): PackageJsonProps {
    return {
      ...this.reactEnv.getCjsPackageJsonProps(),
      exports: {
        node: {
          require: './dist/{main}.js',
          import: './dist/esm.mjs',
        },
        default: './dist/{main}.js',
      },
    };
  }

  getNpmIgnore() {
    return [`${CAPSULE_ARTIFACTS_DIR}/*`];
  }

  getPreviewConfig() {
    return {
      strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
      splitComponentBundle: false,
    };
  }

  async getDependencies() {
    return {
      dependencies: {
        react: '-',
        'react-dom': '-',
        'core-js': '^3.0.0',
        // For aspects the babel runtime should be a runtime dep not only dev as they are compiled by babel
        '@babel/runtime': '7.20.0',
      },
      // TODO: add this only if using ts
      devDependencies: {
        react: '-',
        'react-dom': '-',
        '@types/mocha': '-',
        '@types/node': '12.20.4',
        '@types/react': '^17.0.8',
        '@types/react-dom': '^17.0.5',
        '@types/jest': '^26.0.0',
        '@types/testing-library__jest-dom': '5.9.5',
      },
      peerDependencies: {
        // TODO: check if we really need react for aspects (maybe for ink support)
        react: '^16.8.0 || ^17.0.0',
        'react-dom': '^16.8.0 || ^17.0.0',
      },
    };
  }

  workspaceConfig(): ConfigWriterEntry[] {
    return [
      TypescriptConfigWriter.create(
        {
          tsconfig: require.resolve('./typescript/tsconfig.json'),
          // types: resolveTypes(__dirname, ["./types"]),
        },
        this.logger
      ),
      EslintConfigWriter.create(
        {
          configPath: require.resolve('./eslint/eslintrc.js'),
          tsconfig: require.resolve('./typescript/tsconfig.json'),
        },
        this.logger
      ),
      PrettierConfigWriter.create(
        {
          configPath: require.resolve('./prettier/prettier.config.js'),
        },
        this.logger
      ),
    ];
  }
}
