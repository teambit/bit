import chalk from 'chalk';
import { defaults } from 'lodash';
import { EnvService, ExecutionContext, EnvDefinition, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import highlight from 'cli-highlight';
import { Formatter, FormatResults } from './formatter';
import { FormatterContext, FormatterOptions } from './formatter-context';
import { FormatterConfig } from './formatter.main.runtime';

type FormatterTransformationMap = ServiceTransformationMap & {
  getFormatter: () => Formatter;
};
export class FormatterService implements EnvService<FormatResults> {
  name = 'formatter';

  constructor(private formatterConfig: FormatterConfig) {}

  async run(context: ExecutionContext, options: FormatterOptions): Promise<FormatResults> {
    const mergedOpts = this.optionsWithDefaults(options);
    const formatterContext: FormatterContext = this.mergeContext(mergedOpts, context);
    const formatter = this.getFormatter(context, options);

    const results = options.check ? await formatter.check(formatterContext) : await formatter.format(formatterContext);
    return results;
  }

  getFormatter(context: ExecutionContext, options: FormatterOptions): Formatter {
    const mergedOpts = this.optionsWithDefaults(options);
    const formatterContext: FormatterContext = this.mergeContext(mergedOpts, context);
    const formatter: Formatter = context.env.getFormatter(formatterContext);

    return formatter;
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
    const name = `${chalk.green('configured formatter:')} ${descriptor?.id} (${descriptor?.displayName} @ ${
      descriptor?.version
    })`;
    const configLabel = chalk.green('formatter config:');
    const configObj = descriptor?.config
      ? highlight(descriptor?.config, { language: 'json', ignoreIllegals: true })
      : '';
    return `${name}\n${configLabel}\n${configObj}`;
  }

  transform(env: Env, context: EnvContext): FormatterTransformationMap | undefined {
    // Old env
    if (!env?.formatter) return undefined;
    return {
      getFormatter: () => env.formatter()(context),
    };
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
