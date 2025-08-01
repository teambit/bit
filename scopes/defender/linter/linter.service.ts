import chalk from 'chalk';
import { defaults } from 'lodash';
import type {
  EnvService,
  ExecutionContext,
  EnvDefinition,
  ServiceTransformationMap,
  EnvContext,
  Env,
} from '@teambit/envs';
import type { Workspace } from '@teambit/workspace';
import highlight from 'cli-highlight';
import type { Component } from '@teambit/component';
import { ComponentMap } from '@teambit/component';
import type { Linter, LintResults } from './linter';
import type { LinterContext, LinterOptions } from './linter-context';
import type { LinterConfig } from './linter.main.runtime';

type LinterTransformationMap = ServiceTransformationMap & {
  getLinter: () => Linter;
};

export class LinterService implements EnvService<LintResults> {
  name = 'linter';

  constructor(
    private linterConfig: LinterConfig,
    private workspace: Workspace
  ) {}

  async run(context: ExecutionContext, options: LinterOptions): Promise<LintResults> {
    const mergedOpts = this.optionsWithDefaults(options);
    const linterContext = this.mergeContext(mergedOpts, context);
    const linter = this.getLinter(context, options);
    if (!linter) {
      return {
        results: [],
        errors: [],
      };
    }

    const results = await linter.lint(linterContext);
    return results;
  }

  getLinter(context: ExecutionContext, options: LinterOptions): Linter | undefined {
    if (!context.env.getLinter) {
      return undefined;
    }
    const mergedOpts = this.optionsWithDefaults(options);
    const linterContext = this.mergeContext(mergedOpts, context);
    const linter: Linter = context.env.getLinter(linterContext);
    return linter;
  }

  private optionsWithDefaults(options: LinterOptions): LinterOptions {
    return defaults(options, this.linterConfig);
  }

  private mergeContext(options: LinterOptions, context?: ExecutionContext): LinterContext {
    const componentsDirMap = context?.components
      ? this.getComponentsDirectory(context.components)
      : ComponentMap.create<string>([]);
    const linterContext: LinterContext = Object.assign(
      {},
      {
        rootDir: this.workspace?.path,
        quiet: false,
        extensionFormats: options.extensionFormats,
        fixTypes: options.fixTypes,
        fix: options.fix,
        componentsDirMap,
      },
      context
    );
    return linterContext;
  }

  private getComponentsDirectory(components: Component[]): ComponentMap<string> {
    return ComponentMap.as<string>(components, (component) =>
      this.workspace.componentDir(component.id, undefined, { relative: true })
    );
  }

  render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);
    const name = `${chalk.green('configured linter:')} ${descriptor?.id} (${descriptor?.displayName} @ ${
      descriptor?.version
    })`;
    const configLabel = chalk.green('linter config:');
    const configObj = descriptor?.config
      ? highlight(descriptor?.config, { language: 'json', ignoreIllegals: true })
      : '';
    return `${name}\n${configLabel}\n${configObj}`;
  }

  transform(env: Env, context: EnvContext): LinterTransformationMap | undefined {
    // Old env
    if (!env?.linter) return undefined;
    return {
      getLinter: () => env.linter()(context),
    };
  }

  getDescriptor(env: EnvDefinition) {
    if (!env.env.getLinter) return undefined;
    const mergedOpts = this.optionsWithDefaults({});
    const linterContext = this.mergeContext(mergedOpts);
    const linter = env.env.getLinter(linterContext);

    return {
      id: linter.id,
      icon: linter.icon,
      config: linter.displayConfig ? linter.displayConfig() : undefined,
      version: linter.version ? linter.version() : '?',
      displayName: linter.displayName ? linter.displayName : '?',
    };
  }
}
