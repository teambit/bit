import { Compiler } from '@teambit/compiler';
import { EnvHandler } from '@teambit/envs';
import { CAPSULE_ARTIFACTS_DIR, Pipeline } from '@teambit/builder';
import { PackageGenerator } from '@teambit/pkg';
import type { PackageJsonProps } from '@teambit/pkg';
import {
  BabelCompiler,
  BabelCompilerOptions,
  BabelTask,
} from '@teambit/compilation.babel-compiler';
import {
  resolveTypes,
  TypescriptTask,
  TypescriptConfigWriter,
} from '@teambit/typescript.typescript-compiler';
import {
  ESLintLinter,
  EslintConfigWriter,
} from '@teambit/defender.eslint-linter';
import { MochaTester, MochaTask } from '@teambit/defender.mocha-tester';
import {
  PrettierFormatter,
  PrettierConfigWriter,
} from '@teambit/defender.prettier-formatter';
import { Tester } from '@teambit/tester';
import { ConfigWriterList } from '@teambit/workspace-config-files';
import { SchemaExtractor } from '@teambit/schema';
import { TypeScriptExtractor } from '@teambit/typescript';

// export class NodeBabelMocha extends ReactEnv {
export class NodeBabelMocha {
  /* a shorthand name for the env */
  name = 'aspect';

  type = 'aspect';
  /**
   * icon for the env. use this to build a more friendly env.
   */
  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  protected tsconfigPath = require.resolve('./config/tsconfig.json');

  protected tsTypesPath = './types';

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
  packageJson: PackageJsonProps = {
    main: 'dist/{main}.js',
    types: '{main}.ts',
    exports: {
      '.': {
          require: './dist/{main}.js',
          import: './dist/esm.mjs',
      }
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
    keywords: [
      'bit',
      'components',
      'collaboration',
      'web',
    ],
  };

  /**
   * Default npm ignore paths.
   * Will ignore the "artifacts" directory by default.
   */
  npmIgnore = [
    // Ignores all the contents inside the artifacts directory.
    // Asterisk (*) is needed in order to ignore all other contents of the artifacts directory,
    // especially when specific folders are excluded from the ignore e.g. in combination with `!artifacts/ui-bundle`.
    `${CAPSULE_ARTIFACTS_DIR}/*`,
  ];

  protected previewMounter = require.resolve('./preview/mounter');

  protected previewDocsTemplate = require.resolve('./preview/docs');

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

  tester(): EnvHandler<Tester> {
    /**
     * @see https://bit.dev/reference/jest/using-jest
     * */
    return MochaTester.from({
      mochaConfigPath: this.mochaConfigPath,
      babelConfig: require.resolve('./config/mocha.babel.config.js'),
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
   * returns an instance of the default TypeScript extractor.
   * used by default for type inference for both JS and TS.
   */
  schemaExtractor(): EnvHandler<SchemaExtractor> {
    return TypeScriptExtractor.from({
      tsconfig: this.tsconfigPath,
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
        singleProgramCompilation: {},
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
      MochaTask.from({
        /* you can use a different mocha config file for the build process */
        mochaConfigPath: this.mochaConfigPath,
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

  private getBabelBaseOpts(): BabelCompilerOptions {
    return {
      distGlobPatterns: [
        `dist/**`,
        `!dist/**/*.d.ts`,
        `!dist/tsconfig.tsbuildinfo`,
      ],
      concatDistDir: true,
      supportedFilesGlobPatterns: ['**/*.ts', '!excluded-fixtures/**'],
    };
  }

  getCJSbabelCompilerOptions(
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
    const opts = this.getCJSbabelCompilerOptions(
      distDir,
      targetExtension,
      concatDistDir
    );
    const cjsBabelCompiler = BabelCompiler.from(opts);
    return cjsBabelCompiler;
  }

  private getESMbabelCompilerHandler(
    distDir = 'dist/esm'
  ): EnvHandler<Compiler> {
    const baseOpts = this.getBabelBaseOpts();
    const esmBabelCompiler = BabelCompiler.from({
      ...baseOpts,
      distDir,
      babelConfig: require.resolve('./config/esm.babel.config'),
    });
    return esmBabelCompiler;
  }
}

export default new NodeBabelMocha();
