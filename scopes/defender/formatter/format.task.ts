import { BuildTask, BuiltTaskResult, BuildContext, ComponentResult } from '@teambit/builder';
import { Formatter } from './formatter';

export class FormatTask implements BuildTask {
  constructor(readonly aspectId: string, readonly name = 'format') {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const formatter: Formatter = context.env.getFormatter();
    // TODO: add option to select between check and format here
    const results = await formatter.check(context);
    const componentsResults = results.results.map((formatResult): ComponentResult => {
      return {
        component: formatResult.component,
        metadata: {
          output: formatResult.output,
          results: formatResult.results,
        },
        errors: [],
      };
    });

    return {
      componentsResults,
    };
  }
}
