import { defaults } from 'lodash';
import { EnvService, ExecutionContext } from '@teambit/envs';
import { Formatter, FormatResults } from './formatter';
import { FormatterContext, FormatterOptions } from './formatter-context';
import { FormatterConfig } from './formatter.main.runtime';

export type FormatterServiceOptions = FormatterOptions & {
  check?: boolean;
};

export class FormatterService implements EnvService<FormatResults> {
  name = 'formatter';

  constructor(private formatterConfig: FormatterConfig) {}

  async run(context: ExecutionContext, options: FormatterServiceOptions): Promise<FormatResults> {
    const mergedOpts = defaults(options, this.formatterConfig);
    const formatterContext: FormatterContext = Object.assign({}, mergedOpts, context);
    const formatter: Formatter = context.env.getFormatter(formatterContext);

    const results = options.check ? await formatter.check(formatterContext) : await formatter.format(formatterContext);
    return results;
  }
}
