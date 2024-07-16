import {
  TypescriptTask,
} from '@teambit/typescript.typescript-compiler';
import { resolve } from 'path';
import { Pipeline } from "@teambit/builder";
import { Tester, TesterContext } from '@teambit/tester';
import { EnvHandler } from '@teambit/envs';
import { Component } from '@teambit/component';
import { ReactEnv } from '@teambit/react.react-env';
import type { ReactEnvInterface } from '@teambit/react.react-env';
import { JestTask, JestTester } from '@teambit/defender.jest-tester';

function generateResolveSpecPathsFunc(pattern: string) {
  return (component: Component, context: TesterContext) => {
    const componentPatternValue = context.patterns.get(component);
    if (!componentPatternValue) return [] as string[];
    const [, patternEntry] = componentPatternValue;
    return [resolve(patternEntry.componentDir, pattern)]
  }
}

export class InvalidJestConfigTesterEnv extends ReactEnv implements ReactEnvInterface {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'invalid-jest-config-tester';

  /**
   * icon for the env. use this to build a more friendly env.
   * uses react by default.
   */
  icon = 'https://static.bit.dev/extensions-icons/react.svg';

  protected jestConfigPath = require.resolve('./config/jest.config');
  protected tsconfigPath = require.resolve('./config/tsconfig.json');

  tester(): EnvHandler<Tester> {
    return JestTester.from({
      config: this.jestConfigPath,
    });
  }

  build() {
    return Pipeline.from([
      TypescriptTask.from({
        tsconfig: this.tsconfigPath,
      }),
      JestTask.from({
        config: this.jestConfigPath,
      })
    ]);
  }
}

export default new InvalidJestConfigTesterEnv();
