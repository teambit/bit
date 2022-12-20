import { BuildTask, BuiltTaskResult, BuildContext, ComponentResult } from '@teambit/builder';
import { Component, ComponentMap } from '@teambit/component';
import { CapsuleList } from '@teambit/isolator';
import { Linter } from './linter';
import { LinterContext } from './linter-context';

export class LintTask implements BuildTask {
  constructor(readonly aspectId: string, readonly name = 'lint') {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const linter: Linter = context.env.getLinter();
    const componentsDirMap = this.getComponentsDirectory(context.components, context.capsuleNetwork.graphCapsules);

    // @ts-ignore TODO: fix this
    const linterContext: LinterContext = {
      rootDir: context.capsuleNetwork.capsulesRootDir,
      componentsDirMap,
      ...context,
    };
    const results = await linter.lint(linterContext);
    const componentsResults = results.results.map((lintResult): ComponentResult => {
      return {
        component: lintResult.component,
        metadata: {
          output: lintResult.output,
          results: lintResult.results,
        },
        errors: [],
      };
    });

    return {
      componentsResults,
    };
  }

  private getComponentsDirectory(components: Component[], capsuleList: CapsuleList): ComponentMap<string> {
    return ComponentMap.as<string>(components, (component) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return capsuleList.getCapsule(component.id)!.path;
    });
  }
}
