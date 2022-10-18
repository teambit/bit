import React from 'react';
import { defaults } from 'lodash';
import { EnvService, ExecutionContext, EnvDefinition } from '@teambit/envs';
import { Text, Newline } from 'ink';
import highlight from 'cli-highlight';
import { Linter, LintResults } from './linter';
import { LinterContext, LinterOptions } from './linter-context';
import { LinterConfig } from './linter.main.runtime';

export class LinterService implements EnvService<LintResults> {
  name = 'linter';

  constructor(private linterConfig: LinterConfig, private rootDir?: string) {}

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
    const linterContext: LinterContext = Object.assign(
      {},
      {
        rootDir: this.rootDir,
        quiet: false,
        extensionFormats: options.extensionFormats,
        fixTypes: options.fixTypes,
        fix: options.fix,
      },
      context
    );
    return linterContext;
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
