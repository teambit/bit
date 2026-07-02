import { JestTask, JestTester, jestWorkerPath } from '@teambit/defender.jest-tester';
import type { JestWorker } from '@teambit/defender.jest-tester';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { BabelCompiler } from '@teambit/compilation.babel-compiler';
import type { Compiler, CompilerMain } from '@teambit/compiler';
import type { DependenciesEnv, PackageEnv, PipeServiceModifier, PipeServiceModifiersMap } from '@teambit/envs';
import { merge, cloneDeep } from 'lodash';
import type { PackageJsonProps } from '@teambit/pkg';
import type { TsConfigSourceFile } from 'typescript';
import ts from 'typescript';
import type { BuildTask } from '@teambit/builder';
import { CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { Tester } from '@teambit/tester';
import type { LinterContext, Linter } from '@teambit/linter';
import type { FormatterContext, Formatter } from '@teambit/formatter';
import type { ESLint as ESLintLib } from 'eslint';
import type { ConfigWriterEntry } from '@teambit/workspace-config-files';
import { PrettierConfigWriter, PrettierFormatter } from '@teambit/defender.prettier-formatter';
import type {
  PrettierConfigTransformContext,
  PrettierConfigTransformer,
} from '@teambit/defender.prettier.config-mutator';
import { PrettierConfigMutator } from '@teambit/defender.prettier.config-mutator';
import { TypescriptConfigWriter } from '@teambit/typescript.typescript-compiler';
import { EslintConfigWriter, ESLintLinter } from '@teambit/defender.eslint-linter';
import type { ESLintOptions } from '@teambit/defender.eslint-linter';
import type { EslintConfigTransformContext, EslintConfigTransformer } from '@teambit/defender.eslint.config-mutator';
import { EslintConfigMutator } from '@teambit/defender.eslint.config-mutator';
import type { Logger } from '@teambit/logger';
import { join, resolve } from 'path';
import type { WorkerMain } from '@teambit/worker';

import type { DevFilesMain } from '@teambit/dev-files';
import type { TsConfigTransformer, TypescriptMain, TypeScriptCompilerOptions } from '@teambit/typescript';
import type { SchemaExtractor } from '@teambit/schema';
import type { TesterTask } from '@teambit/defender.tester-task';

import { babelConfig } from './babel/babel-config';

const tsconfig = require('./typescript/tsconfig.json');
const baseTsConfig = require('./typescript/tsconfig.base.json');
const buildTsConfig = require('./typescript/tsconfig.build.json');
const eslintConfig = require('./eslint/eslintrc');
const prettierConfig = require('./prettier/prettier.config.js');

export const AspectEnvType = 'aspect';

type GetBuildPipeModifiers = PipeServiceModifiersMap & {
  tsModifier?: PipeServiceModifier;
  jestModifier?: PipeServiceModifier;
};

export function runTransformersWithContext<P, T extends Function, C>(config: P, transformers: T[] = [], context: C): P {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}

/**
 * a component environment built for Aspects. standalone - built directly on top of the core
 * typescript/babel/jest tooling (it used to extend the react env, which is no longer a core aspect).
 */
export class AspectEnv implements DependenciesEnv, PackageEnv {
  constructor(
    private tsAspect: TypescriptMain,
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

  getTsConfig(tsConfig?: TsConfigSourceFile) {
    const targetConf = merge(cloneDeep(tsconfig), tsConfig);
    return targetConf;
  }

  private createTsCompilerOptions(mode: 'dev' | 'build' = 'dev'): TypeScriptCompilerOptions {
    const baseConfig = mode === 'dev' ? cloneDeep(baseTsConfig) : cloneDeep(buildTsConfig);
    const pathToSource = pathNormalizeToLinux(__dirname).replace('/dist', '');
    return {
      tsconfig: baseConfig,
      types: [resolve(pathToSource, './typescript/style.d.ts'), resolve(pathToSource, './typescript/asset.d.ts')],
      compileJs: true,
      compileJsx: true,
    };
  }

  createTsCjsCompiler(mode: 'dev' | 'build' = 'dev', transformers: TsConfigTransformer[] = [], tsModule = ts) {
    const tsCompileOptions = this.createTsCompilerOptions(mode);
    return this.tsAspect.createCjsCompiler(tsCompileOptions, transformers, tsModule);
  }

  createTsCompiler(tsConfig: TsConfigSourceFile): Compiler {
    const mergeConfTransformer: TsConfigTransformer = (configMutator) => {
      configMutator.mergeTsConfig(this.getTsConfig(tsConfig));
      return configMutator;
    };
    return this.createTsCjsCompiler('dev', [mergeConfTransformer]);
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
    const worker = this.getJestWorker();
    return JestTester.create(
      {
        jest: jestModulePath || require.resolve('jest'),
        config,
      },
      { logger: this.logger, worker, devFiles: this.devFiles }
    );
  }

  /**
   * returns the component linter.
   */
  getLinter(context: LinterContext, transformers: EslintConfigTransformer[] = []): Linter {
    const tsconfigPath = require.resolve('./typescript/tsconfig.json');
    const mergedOptions = {
      // @ts-ignore - this is a bug in the @types/eslint types
      overrideConfig: eslintConfig as ESLintLib.Options,
      extensions: context.extensionFormats,
      useEslintrc: false,
      cwd: __dirname,
      fix: !!context.fix,
      fixTypes: context.fixTypes as ESLintLib.Options['fixTypes'],
    } as ESLintOptions;
    const configMutator = new EslintConfigMutator(mergedOptions);
    const transformerContext: EslintConfigTransformContext = { fix: !!context.fix };
    configMutator.setTsConfig(tsconfigPath);
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    return ESLintLinter.create(afterMutation.raw, { logger: this.logger });
  }

  /**
   * returns the component formatter.
   */
  getFormatter(context: FormatterContext, transformers: PrettierConfigTransformer[] = []): Formatter {
    const configMutator = new PrettierConfigMutator(prettierConfig);
    const transformerContext: PrettierConfigTransformContext = { check: !!context?.check };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    return PrettierFormatter.create({ config: afterMutation.raw }, { logger: this.logger });
  }

  getSchemaExtractor(
    tsconfigSource?: TsConfigSourceFile,
    tsserverPath?: string,
    contextPath?: string
  ): SchemaExtractor {
    return this.tsAspect.createSchemaExtractor(this.getTsConfig(tsconfigSource), tsserverPath, contextPath);
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
    // @ts-ignore
    const externalTransformer: TsConfigTransformer[] = modifiers?.tsModifier?.transformers || [];
    const tsCjsCompiler = this.createTsCjsCompiler('build', [transformer, ...externalTransformer]);
    const tsCompilerTask = this.compiler.createTask('TSCompiler', tsCjsCompiler);
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

  getPackageJsonProps(): PackageJsonProps {
    return {
      ...this.tsAspect.getCjsPackageJsonProps(),
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
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        '@types/jest': '^26.0.0',
        '@types/testing-library__jest-dom': '5.9.5',
      },
      peerDependencies: {
        // TODO: check if we really need react for aspects (maybe for ink support)
        react: '^17.0.0 || ^18.0.0 || ^19.0.0',
        'react-dom': '^17.0.0 || ^18.0.0 || ^19.0.0',
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
