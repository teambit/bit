import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from '@teambit/preview';
import { Compiler } from '@teambit/compiler';
import { ReactPreview } from '@teambit/preview.react-preview';
import { EnvHandler } from '@teambit/envs';
import { CAPSULE_ARTIFACTS_DIR, Pipeline } from '@teambit/builder';
import { PackageGenerator } from '@teambit/pkg';
import { JestTask, JestTester } from '@teambit/defender.jest-tester';
import { BabelCompiler, BabelCompilerOptions, BabelTask } from '@teambit/compilation.babel-compiler';
// import {
//   MultiCompiler,
//   MultiCompilerTask,
// } from '@teambit/compilation.compilers.multi-compiler';
import { resolveTypes, TypescriptTask, TypescriptConfigWriter } from '@teambit/typescript.typescript-compiler';
import { ESLintLinter, EslintTask, EslintConfigWriter } from '@teambit/defender.eslint-linter';
import { MochaTester, MochaTask } from '@teambit/defender.mocha-tester';
import { PrettierFormatter, PrettierConfigWriter } from '@teambit/defender.prettier-formatter';
import { Tester } from '@teambit/tester';
import { Preview } from '@teambit/preview';
import { ConfigWriterList } from '@teambit/workspace-config-files';
import hostDependencies from './preview/host-dependencies';
// import { webpackTransformer } from './config/webpack.config';

// export class CoreAspectEnv extends ReactEnv {
export class CoreAspectEnv {
  /* a shorthand name for the env */
  name = 'aspect';

  protected tsconfigPath = require.resolve('./config/tsconfig.json');

  protected tsTypesPath = './types';

  protected jestConfigPath = require.resolve('./config/jest.config');

  protected eslintConfigPath = require.resolve('./config/eslintrc.js');

  protected mochaConfigPath = require.resolve('./config/mocharc.js');

  protected eslintExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  protected prettierConfigPath = require.resolve('./config/prettier.config.js');

  protected prettierExtensions = [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.json',
    '.css',
    '.scss',
    '.md',
    '.mdx',
    '.html',
    '.yml',
    '.yaml',
  ];

  /**
   * Default package.json modifications.
   */
  packageJson = {
    main: 'dist/{main}.js',
    types: '{main}.ts',
    exports: {
      node: {
        require: './dist/{main}.js',
        import: './dist/esm.mjs',
      },
      default: './dist/{main}.js',
    },
    private: false,
    license: 'Apache-2.0',
    engines: {
      node: '>=16.0.0',
    },
    repository: {
      type: 'git',
      url: 'https://github.com/teambit/bit',
    },
    keywords: ['bit', 'bit-aspect', 'bit-core-aspect', 'components', 'collaboration', 'web'],
  };

  /**
   * Default npm ignore paths.
   * Will ignore the "artifacts" directory by default.
   */
  npmIgnore = [`${CAPSULE_ARTIFACTS_DIR}/`];

  protected previewMounter = require.resolve('./preview/mounter');

  /* the compiler to use during development */
  compiler(): EnvHandler<Compiler> {
    return this.getCJSbabelCompilerHandler('dist', '.js', false);
    // return MultiCompiler.fromCompilerHandlers({
    //   chainTranspilation: false,
    //   compilers: [
    //     this.getCJSbabelCompilerHandler('cjs'),
    //     this.getESMbabelCompilerHandler('esm'),
    //   ],
    // });
  }

  /* the test runner to use during development */
  // tester(): EnvHandler<Tester> {
  //   /**
  //    * @see https://bit.dev/reference/jest/using-jest
  //    * */
  //   return MochaTester.from({
  //     mochaConfigPath: this.mochaConfigPath,
  //     babelConfig: require.resolve('./config/mocha.babel.config.js'),
  //   });
  // }
  tester(): EnvHandler<Tester> {
    return JestTester.from({
      config: this.jestConfigPath,
    });
  }

  /* the linter to use during development */
  linter() {
    /**
     * @see https://bit.dev/reference/eslint/using-eslint
     * */
    return ESLintLinter.from({
      tsconfig: this.tsconfigPath,
      configPath: this.eslintConfigPath,
      pluginsPath: __dirname,
      extensions: this.eslintExtensions,
    });
  }

  /**
   * the formatter to use during development
   * (source files are not formatted as part of the components' build)
   * */
  formatter() {
    /**
     * @see https://bit.dev/reference/prettier/using-prettier
     * */
    return PrettierFormatter.from({
      configPath: this.prettierConfigPath,
    });
  }

  /**
   * generates the component previews during development and during build
   */
  preview(): EnvHandler<Preview> {
    /**
     * @see https://bit.dev/docs/react-env/component-previews
     */
    return ReactPreview.from({
      mounter: this.previewMounter,
      hostDependencies,
      previewConfig: {
        strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
        splitComponentBundle: false,
      },
      // transformers: [webpackTransformer],
    });
  }

  /**
   * configure and control the packaging process of components.
   */
  package() {
    return PackageGenerator.from({
      packageJson: this.packageJson,
      npmIgnore: this.npmIgnore,
    });
  }

  /**
   * a set of processes to be performed before a component is snapped, during its build phase
   * @see https://bit.dev/docs/react-env/build-pipelines
   */
  build() {
    return Pipeline.from([
      TypescriptTask.from({
        name: 'declaration',
        shouldCopyNonSupportedFiles: false,
        tsconfig: this.tsconfigPath,
        types: resolveTypes(__dirname, [this.tsTypesPath]),
      }),
      BabelTask.from(this.getCJSbabelCompilerOptions('dist', '.js', false)),
      // MultiCompilerTask.fromCompilerHandlers({
      //   chainTranspilation: false,
      //   compilers: [
      //     this.getCJSbabelCompilerHandler(),
      //     this.getESMbabelCompilerHandler(),
      //   ],
      // }),
      // TODO: re-enable eslint at some point
      // EslintTask.from({
      //   tsconfig: this.tsconfigPath,
      //   configPath: this.eslintConfigPath,
      //   pluginsPath: __dirname,
      //   extensions: this.eslintExtensions,
      // }),
      // MochaTask.from({
      //   /* you can use a different mocha config file for the build process */
      //   mochaConfigPath: this.mochaConfigPath,
      // }),
      JestTask.from({
        config: this.jestConfigPath,
      }),
    ]);
  }

  snap() {
    return Pipeline.from([]);
  }

  tag() {
    return Pipeline.from([]);
  }

  workspaceConfig(): ConfigWriterList {
    return ConfigWriterList.from([
      TypescriptConfigWriter.from({
        tsconfig: this.tsconfigPath,
        types: resolveTypes(__dirname, [this.tsTypesPath]),
      }),
      EslintConfigWriter.from({
        configPath: this.eslintConfigPath,
        tsconfig: this.tsconfigPath,
      }),
      PrettierConfigWriter.from({
        configPath: this.prettierConfigPath,
      }),
    ]);
  }

  private getBabelBaseOpts() {
    return {
      distGlobPatterns: [`dist/**`, `!dist/**/*.d.ts`, `!dist/tsconfig.tsbuildinfo`],
      concatDistDir: true,
    };
  }

  private getCJSbabelCompilerOptions(
    distDir = 'dist/cjs',
    targetExtension = '.cjs',
    concatDistDir = true
  ): BabelCompilerOptions {
    const baseOpts = this.getBabelBaseOpts();
    const mergedOpts = {
      ...baseOpts,
      distDir,
      babelConfig: require.resolve('./config/cjs.babel.config'),
      targetExtension,
      concatDistDir,
    };
    return mergedOpts;
  }

  private getCJSbabelCompilerHandler(
    distDir = 'dist/cjs',
    targetExtension = '.cjs',
    concatDistDir = true
  ): EnvHandler<Compiler> {
    const opts = this.getCJSbabelCompilerOptions(distDir, targetExtension, concatDistDir);
    const cjsBabelCompiler = BabelCompiler.from(opts);
    return cjsBabelCompiler;
  }

  private getESMbabelCompilerHandler(distDir = 'dist/esm'): EnvHandler<Compiler> {
    const baseOpts = this.getBabelBaseOpts();
    const esmBabelCompiler = BabelCompiler.from({
      ...baseOpts,
      distDir,
      babelConfig: require.resolve('./config/esm.babel.config'),
    });
    return esmBabelCompiler;
  }
}

export default new CoreAspectEnv();
