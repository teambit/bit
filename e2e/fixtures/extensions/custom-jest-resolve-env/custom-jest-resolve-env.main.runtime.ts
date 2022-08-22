import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { JestAspect, JestMain } from '@teambit/jest';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { CustomJestResolveEnv } from './custom-jest-resolve-env.aspect';
import { join, resolve } from 'path';
import { Component } from '@teambit/component';
import { TesterContext } from '@teambit/tester';

export class CustomJestResolveEnvMain {
  static slots = [];

  static dependencies = [ReactAspect, EnvsAspect, JestAspect];

  static runtime = MainRuntime;

  static async provider([react, envs, jestAspect]: [ReactMain, EnvsMain, JestMain]) {
    const templatesReactEnv = envs.compose(react.reactEnv, [
      envs.override({
        getTester: () => {
          const pathToSource = __dirname.replace('/dist', '');
          const configPath = join(pathToSource, './jest/jest.config.js');
          const opts = {
            resolveSpecPaths: (component: Component, context: TesterContext) => {
              const componentPatternValue = context.patterns.get(component);
              if (!componentPatternValue) return [] as string[];
              const [, patternEntry] = componentPatternValue;
              return [resolve(patternEntry.componentDir, '**/*.custom-pattern.spec.+(js|ts|jsx|tsx)')]
            }
          }
          return jestAspect.createTester(configPath, undefined, opts);
        }
      }),
    ]);
    envs.registerEnv(templatesReactEnv);
    return new CustomJestResolveEnvMain();
  }
}

CustomJestResolveEnv.addRuntime(CustomJestResolveEnvMain);
