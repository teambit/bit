import { BuildTask, BuiltTaskResult, BuildContext } from '@teambit/builder';
import { Linter } from './linter';

export class LintTask implements BuildTask {
  constructor(readonly aspectId: string, readonly name = 'lint') {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const linter: Linter = context.env.getLinter();
    linter.lint(context);

    return {
      componentsResults: [],
    };
  }
}
