import path from 'path';
import { BuildTask, BuiltTaskResult, BuildContext, ComponentResult } from '@teambit/builder';
import { Component, ComponentMap } from '@teambit/component';
import { CapsuleList } from '@teambit/isolator';
import { Linter } from './linter';
import { LinterContext } from './linter-context';

export class LintTask implements BuildTask {
  constructor(readonly aspectId: string, readonly name = 'lint') {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const linter: Linter = context.env.getLinter();
    const rootDir = context.capsuleNetwork.capsulesRootDir;
    const componentsDirMap = this.getComponentsDirectory(
      rootDir,
      context.components,
      context.capsuleNetwork.graphCapsules
    );

    // @ts-ignore TODO: fix this
    const linterContext: LinterContext = {
      rootDir,
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

  private getComponentsDirectory(
    capsuleRootDir: string,
    components: Component[],
    capsuleList: CapsuleList
  ): ComponentMap<string> {
    return ComponentMap.as<string>(components, (component) => {
      const fullPath = capsuleList.getCapsule(component.id)?.path || '';
      const relativePath = path.relative(capsuleRootDir, fullPath);
      return relativePath;
    });
  }
}
