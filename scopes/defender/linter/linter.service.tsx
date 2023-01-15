import React from 'react';
import { defaults } from 'lodash';
import { EnvService, ExecutionContext, EnvDefinition, ServiceTransformationMap, EnvContext, Env } from '@teambit/envs';
import { Text, Newline } from 'ink';
import { Workspace } from '@teambit/workspace';
import highlight from 'cli-highlight';
import { Component, ComponentMap } from '@teambit/component';
import { Linter, LintResults } from './linter';
import { LinterContext, LinterOptions } from './linter-context';
import { LinterConfig } from './linter.main.runtime';

type LinterTransformationMap = ServiceTransformationMap  & {
  getLinter: () => Linter;
}

export class LinterService implements EnvService<LintResults> {
  name = 'linter';

  constructor(private linterConfig: LinterConfig, private workspace: Workspace) {}

  async run(context: ExecutionContext, options: LinterOptions): Promise<LintResults> {
    const mergedOpts = this.optionsWithDefaults(options);
    const linterContext = this.mergeContext(mergedOpts, context);
    const linter: Linter = context.env.getLinter(linterContext);

    const results = await linter.lint(linterContext);
    return results;
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

    return (
      <Text key={descriptor?.id}>
        <Text color="cyan">configured linter: </Text>
        <Text>
          {descriptor?.id} ({descriptor?.displayName} @ {descriptor?.version})
        </Text>
        <Newline />
        <Text color="cyan">linter config:</Text>
        <Newline />
        <Text>
          {descriptor?.config && highlight(descriptor?.config, { language: 'javascript', ignoreIllegals: true })}
        </Text>
        <Newline />
      </Text>
    );
  }

  transform(env: Env, context: EnvContext): LinterTransformationMap | undefined {
    // Old env
    if (!env?.linter) return undefined;
    return {
      getLinter: () => env.linter()(context),
    }
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
