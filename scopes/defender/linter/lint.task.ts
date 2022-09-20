import { BuildTask, BuiltTaskResult, BuildContext, ComponentResult } from '@teambit/builder';
import { Linter } from './linter';
import { LinterContext } from './linter-context';

export class LintTask implements BuildTask {
  constructor(readonly aspectId: string, readonly name = 'lint') {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const linter: Linter = context.env.getLinter();
    const linterContext: LinterContext = Object.assign(
      {},
      {
        rootDir: context.capsuleNetwork.capsulesRootDir,
      },
      context
    );
    const results = await linter.lint(linterContext);
    const componentsResults = results.results.map(
      (lintResult): ComponentResult => {
        return {
          component: lintResult.component,
          metadata: {
            output: lintResult.output,
            results: lintResult.results,
          },
          errors: [],
        };
      }
    );

    return {
      componentsResults,
    };
  }
}
