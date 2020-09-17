import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { join } from 'path';
import { ComponentMap } from '@teambit/component';
import { Tester } from './tester';
import { detectTestFiles } from './utils';

/**
 * tester build task. Allows to test components during component build.
 */
export class TesterTask implements BuildTask {
  readonly description = 'test components';
  constructor(readonly id: string) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const tester: Tester = context.env.getTester();
    const componentsSpecFiles = ComponentMap.as(context.components, detectTestFiles);

    const testCount = componentsSpecFiles.toArray().reduce((acc, [, specs]) => acc + specs.length, 0);
    if (testCount === 0)
      return {
        artifacts: [],
        componentsResults: [],
      };

    const specFilesWithCapsule = ComponentMap.as(context.components, (component) => {
      const componentSpecFiles = componentsSpecFiles.get(component);
      if (!componentSpecFiles) throw new Error('capsule not found');
      const [, specs] = componentSpecFiles;
      return specs.map((specFile) => {
        const capsule = context.capsuleGraph.capsules.getCapsule(component.id);
        if (!capsule) throw new Error('capsule not found');
        // TODO: fix spec type file need to capsule will return files with type AbstractVinyl
        return { path: join(capsule.wrkDir, specFile.relative), relative: specFile.relative };
      });
    });

    const testerContext = Object.assign(context, {
      release: true,
      specFiles: specFilesWithCapsule,
      rootPath: context.capsuleGraph.capsulesRootDir,
    });

    // TODO: remove after fix AbstractVinyl on capsule
    // @ts-ignore
    const testsResults = await tester.test(testerContext);
    return {
      artifacts: [], // @ts-ignore
      componentsResults: testsResults.components.map((componentTests) => ({
        id: componentTests.componentId,
        component: context.capsuleGraph.capsules.getCapsule(componentTests.componentId)?.component,
        data: { tests: componentTests.results },
        errors: testsResults.errors ? [] : [],
      })),
    };
  }
}
