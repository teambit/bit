import { EnvService, ExecutionContext } from '@teambit/envs';
import { Linter, LintResults } from './linter';
import { LinterContext } from './linter-context';
import { LinterConfig } from './linter.main.runtime';

export class LinterService implements EnvService<LintResults> {
  name = 'linter';

  constructor(private linterConfig: LinterConfig) {}

  async run(context: ExecutionContext): Promise<LintResults> {
    const linter: Linter = context.env.getLinter();

    const linterContext: LinterContext = Object.assign(context, {
      quiet: false,
      extensionFormats: this.linterConfig.extensionFormats,
    });

    const results = await linter.lint(linterContext);
    return results;
  }
}
