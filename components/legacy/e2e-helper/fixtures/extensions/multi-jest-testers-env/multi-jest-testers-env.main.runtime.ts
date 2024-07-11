import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { JestAspect, JestMain } from '@teambit/jest';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { MultiJestTestersEnv } from './multi-jest-testers-env.aspect';
import { join, resolve } from 'path';
import { Component } from '@teambit/component';
import { TesterContext } from '@teambit/tester';
import { MultiTesterAspect, MultiTesterMain } from '@teambit/multi-tester';


export class MultiJestTestersEnvMain {
  static slots = [];

  static dependencies = [ReactAspect, EnvsAspect, JestAspect, MultiTesterAspect];

  static runtime = MainRuntime;

  static async provider([react, envs, jestAspect, multiTester]: [ReactMain, EnvsMain, JestMain, MultiTesterMain]) {
    function getJestTester(jestConfigName: string, pattern: string) {
      const pathToSource = __dirname.replace('/dist', '');
      const configPath = join(pathToSource, `./jest/${jestConfigName}`);
      const opts = {
        resolveSpecPaths: (component: Component, context: TesterContext) => {
          const componentPatternValue = context.patterns.get(component);
          if (!componentPatternValue) return [] as string[];
          const [, patternEntry] = componentPatternValue;
          return [resolve(patternEntry.componentDir, pattern)]
        }
      }
      const jestTester = jestAspect.createTester(configPath, undefined, opts);
      return jestTester;
    }

    const templatesReactEnv = envs.compose(react.reactEnv, [
      envs.override({
        getTester: () => {
          const custom1JestTester = getJestTester('jest.config.js', '**/*.custom-pattern-1.spec.+(js|ts|jsx|tsx)')
          const custom2JestTester = getJestTester('jest.config.js', '**/*.custom-pattern-2.spec.+(js|ts|jsx|tsx)')
          const combinedTester = multiTester.createTester([custom1JestTester, custom2JestTester]);
          return combinedTester;
        }
      }),
    ]);
    envs.registerEnv(templatesReactEnv);
    return new MultiJestTestersEnvMain();
  }
}

MultiJestTestersEnv.addRuntime(MultiJestTestersEnvMain);
