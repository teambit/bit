import { defaults } from 'lodash';
import React from 'react';
import { EnvService, ExecutionContext, EnvDefinition } from '@teambit/envs';
import { Text, Newline } from 'ink';
import highlight from 'cli-highlight';
import { Formatter, FormatResults } from './formatter';
import { FormatterContext, FormatterOptions } from './formatter-context';
import { FormatterConfig } from './formatter.main.runtime';

export class FormatterService implements EnvService<FormatResults> {
  name = 'formatter';

  constructor(private formatterConfig: FormatterConfig) {}

  async run(context: ExecutionContext, options: FormatterOptions): Promise<FormatResults> {
    const mergedOpts = this.optionsWithDefaults(options);
    const formatterContext: FormatterContext = this.mergeContext(mergedOpts, context);
    const formatter: Formatter = context.env.getFormatter(formatterContext);

    const results = options.check ? await formatter.check(formatterContext) : await formatter.format(formatterContext);
    return results;
  }

  private optionsWithDefaults(options: FormatterOptions): FormatterOptions {
    return defaults(options, this.formatterConfig);
  }

  private mergeContext(options: FormatterOptions, context?: ExecutionContext): FormatterContext {
    const formatterContext: FormatterContext = Object.assign({}, options, context);
    return formatterContext;
  }

  render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);

    return (
      <Text key={descriptor?.id}>
        <Text color="cyan">configured formatter: </Text>
        <Text>
          {descriptor?.id} ({descriptor?.displayName} @ {descriptor?.version})
        </Text>
        <Newline />
        <Text color="cyan">formatter config:</Text>
        <Newline />
        <Text>
          {descriptor?.config && highlight(descriptor?.config, { language: 'javascript', ignoreIllegals: true })}
        </Text>
        <Newline />
      </Text>
    );
  }

  getDescriptor(env: EnvDefinition) {
    if (!env.env.getFormatter) return undefined;
    const mergedOpts = this.optionsWithDefaults({});
    const formatterContext = this.mergeContext(mergedOpts);
    const formatter = env.env.getFormatter(formatterContext);

    return {
      id: formatter.id,
      icon: formatter.icon,
      config: formatter.displayConfig ? formatter.displayConfig() : undefined,
      version: formatter.version ? formatter.version() : '?',
      displayName: formatter.displayName ? formatter.displayName : '?',
    };
  }
}
