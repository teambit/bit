import { defaults } from 'lodash';
import { EnvService, ExecutionContext } from '@teambit/envs';
import { Linter, LintResults } from './linter';
import { LinterContext, LinterOptions } from './linter-context';
import { LinterConfig } from './linter.main.runtime';

export class LinterService implements EnvService<LintResults> {
  name = 'linter';

  constructor(private linterConfig: LinterConfig) {}

  async run(context: ExecutionContext, options: LinterOptions): Promise<LintResults> {
    const mergedOpts = defaults(options, this.linterConfig);
    const linter: Linter = context.env.getLinter();
    const linterContext: LinterContext = Object.assign(
      {},
      {
        quiet: false,
        extensionFormats: mergedOpts.extensionFormats,
        fixTypes: mergedOpts.fixTypes,
        fix: mergedOpts.fix,
      },
      context
    );

    const results = await linter.lint(linterContext);
    return results;
  }
}
