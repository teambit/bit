import path from 'path';
import type { BuildTask, BuiltTaskResult, BuildContext, ComponentResult } from '@teambit/builder';
import { ComponentMap } from '@teambit/component';
import type { CapsuleList } from '@teambit/isolator';
import type { Linter } from './linter';
import type { LinterContext } from './linter-context';

export class LintTask implements BuildTask {
  constructor(
    readonly aspectId: string,
    readonly name = 'lint'
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    if (!context.env.getLinter) {
      return { componentsResults: [] };
    }
    const linter: Linter = context.env.getLinter();
    const rootDir = context.capsuleNetwork.capsulesRootDir;
    const componentsDirMap = this.getComponentsDirectory(rootDir, context.capsuleNetwork.originalSeedersCapsules);

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

  private getComponentsDirectory(capsuleRootDir: string, capsuleList: CapsuleList): ComponentMap<string> {
    return ComponentMap.as<string>(capsuleList.getAllComponents(), (component) => {
      const fullPath = capsuleList.getCapsule(component.id)?.path || '';
      const relativePath = path.relative(capsuleRootDir, fullPath);
      return relativePath;
    });
  }
}
