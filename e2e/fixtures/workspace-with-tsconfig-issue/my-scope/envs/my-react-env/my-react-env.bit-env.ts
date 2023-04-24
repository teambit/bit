/**
 * this env extends react-env
 * @see https://bit.cloud/teambit/react/react-env
 */
import { ReactEnv } from '@teambit/react.react-env';

import { Compiler } from '@teambit/compiler';
import { ReactPreview } from '@teambit/preview.react-preview';
import { EnvHandler } from '@teambit/envs';
import {
  TypescriptCompiler,
  resolveTypes,
  TypescriptTask,
} from '@teambit/typescript.typescript-compiler';
import { ESLintLinter, EslintTask } from '@teambit/defender.eslint-linter';
import { JestTester, JestTask } from '@teambit/defender.jest-tester';
import { PrettierFormatter } from '@teambit/defender.prettier-formatter';
import { Tester } from '@teambit/tester';
import { Preview } from '@teambit/preview';
import hostDependencies from './preview/host-dependencies';
// import { webpackTransformer } from './config/webpack.config';

export class MyReactEnv extends ReactEnv {
  /* a shorthand name for the env */
  name = 'my-react-env';

  /* the compiler to use during development */
  compiler(): EnvHandler<Compiler> {
    /**
     * @see https://bit.dev/reference/typescript/using-typescript
     * */
    return TypescriptCompiler.from({
      tsconfig: require.resolve('./config/tsconfig.json'),
      types: resolveTypes(__dirname, ['./types']),
    });
  }

  /* the test runner to use during development */
  tester(): EnvHandler<Tester> {
    /**
     * @see https://bit.dev/reference/jest/using-jest
     * */
    return JestTester.from({
      jest: require.resolve('jest'),
      config: require.resolve('./config/jest.config'),
    });
  }

  /* the linter to use during development */
  linter() {
    /**
     * @see https://bit.dev/reference/eslint/using-eslint
     * */
    return ESLintLinter.from({
      tsconfig: require.resolve('./config/tsconfig.json'),
      configPath: require.resolve('./config/eslintrc.js'),
      pluginsPath: __dirname,
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
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
      configPath: require.resolve('./config/prettier.config.js'),
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
      mounter: require.resolve('./preview/mounter'),
      hostDependencies,
      // transformers: [webpackTransformer],
    });
  }

  /**
   * a set of processes to be performed before a component is snapped, during its build phase
   * @see https://bit.dev/docs/react-env/build-pipelines
   */
  build() {
    return super.build().replace([
      TypescriptTask.from({
        tsconfig: require.resolve('./config/tsconfig.json'),
        types: resolveTypes(__dirname, ['./types']),
      }),
      EslintTask.from({
        tsconfig: require.resolve('./config/tsconfig.json'),
        configPath: require.resolve('./config/eslintrc.js'),
        pluginsPath: __dirname,
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
      }),
      JestTask.from({
        config: require.resolve('./config/jest.config'),
      }),
    ]);
  }
}

export default new MyReactEnv();
