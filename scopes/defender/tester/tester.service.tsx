import { Logger } from '@teambit/logger';
import { resolve } from 'path';
import React from 'react';
import { Text, Newline } from 'ink';
import { EnvService, ExecutionContext, EnvDefinition, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { ComponentMap } from '@teambit/component';
import { Workspace } from '@teambit/workspace';
import highlight from 'cli-highlight';
import { PubSubEngine } from 'graphql-subscriptions';
import { DevFilesMain } from '@teambit/dev-files';
import { Tester, Tests, CallbackFn } from './tester';
import { TesterAspect } from './tester.aspect';
import { TesterOptions } from './tester.main.runtime';
import { detectTestFiles } from './utils';

const chalk = require('chalk');

export const OnTestsChanged = 'OnTestsChanged';

type TesterTransformationMap = ServiceTransformationMap & {
  getTester: () => Tester;
};

export type TesterDescriptor = {
  /**
   * id of the tester (e.g. jest/mocha)
   */
  id: string;

  /**
   * display name of the tester (e.g. Jest / Mocha)
   */
  displayName: string;

  /**
   * icon of the configured tester.
   */
  icon: string;

  /**
   * string containing the config for display.
   */
  config: string;

  version?: string;
};

export class TesterService implements EnvService<Tests, TesterDescriptor> {
  name = 'tester';

  constructor(
    readonly workspace: Workspace,

    private logger: Logger,

    private pubsub: PubSubEngine,

    private devFiles: DevFilesMain
  ) {}

  _callback: CallbackFn | undefined;

  render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);
    return (
      <Text key={descriptor?.id}>
        <Text color="cyan">configured tester: </Text>
        <Text>
          {descriptor?.id} ({descriptor?.displayName} @ {descriptor?.version})
        </Text>
        <Newline />
        <Text underline color="cyan">
          tester config:
        </Text>
        <Newline />
        <Text>
          {/* refactor a separate component which highlights for cli */}
          {highlight(descriptor?.config || '', { language: 'javascript', ignoreIllegals: true })}
        </Text>
        <Newline />
      </Text>
    );
  }

  getDescriptor(environment: EnvDefinition) {
    if (!environment.env.getTester) return undefined;
    const tester: Tester = environment.env.getTester();

    return {
      id: tester.id || '',
      displayName: tester.displayName || '',
      icon: tester.icon || '',
      config: tester.displayConfig ? tester.displayConfig() : '',
      version: tester.version ? tester.version() : '?',
    };
  }

  transform(env: Env, context: EnvContext): TesterTransformationMap | undefined {
    // Old env
    if (!env?.tester) return undefined;

    return {
      getTester: () => env.tester()(context),
    };
  }

  onTestRunComplete(callback: CallbackFn) {
    this._callback = callback;
  }

  async run(context: ExecutionContext, options: TesterOptions): Promise<Tests> {
    const tester: Tester = context.env.getTester();
    const specFiles = ComponentMap.as(context.components, (component) => {
      return detectTestFiles(component, this.devFiles);
    });
    const testCount = specFiles.toArray().reduce((acc, [, specs]) => acc + specs.length, 0);

    const componentWithTests = specFiles.toArray().reduce((acc: number, [, specs]) => {
      if (specs.length > 0) acc += 1;
      return acc;
    }, 0);

    if (testCount === 0 && !options.ui) {
      this.logger.consoleWarning(`no tests found for environment ${chalk.cyan(context.id)}\n`);
      return new Tests([]);
    }

    if (!options.ui)
      this.logger.console(`testing ${componentWithTests} components with environment ${chalk.cyan(context.id)}\n`);

    const patterns = ComponentMap.as(context.components, (component) => {
      const componentDir = this.workspace.componentDir(component.id);
      const componentPatterns = this.devFiles.getDevPatterns(component, TesterAspect.id);
      return {
        componentDir,
        paths:
          componentPatterns.map((pattern: string) => ({
            path: resolve(componentDir, pattern),
            relative: pattern,
          })) || [],
      };
    });

    let additionalHostDependencies = [];
    if (
      context.env.getAdditionalTestHostDependencies &&
      typeof context.env.getAdditionalTestHostDependencies === 'function'
    ) {
      additionalHostDependencies = await context.env.getAdditionalTestHostDependencies();
    }

    const testerContext = Object.assign(context, {
      release: false,
      specFiles,
      patterns,
      rootPath: this.workspace.path,
      workspace: this.workspace,
      debug: options.debug,
      watch: options.watch,
      ui: options.ui,
      coverage: options.coverage,
      additionalHostDependencies,
    });

    if (options.watch && options.ui && tester.watch) {
      if (tester.onTestRunComplete) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        tester.onTestRunComplete((results) => {
          if (this._callback) this._callback(results);
          results.components.forEach((component) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.pubsub.publish(OnTestsChanged, {
              testsChanged: {
                id: component.componentId.toString(),
                testsResults: component.results,
                loading: component.loading,
              },
            });
          });
        });
      }

      return tester.watch(testerContext);
    }

    const results = await tester.test(testerContext);

    return results;
  }
}
