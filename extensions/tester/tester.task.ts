import { flatten } from 'lodash';
import { BuildContext, BuildResults, BuildTask } from '@teambit/builder';
import { join } from 'path';
import { Component, ComponentMap } from '@teambit/component';
import { Tester } from './tester';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { detectTestFiles } from './utils';
import { Network } from '@teambit/isolator';

/**
 * tester build task. Allows to test components during component build.
 */
export class TesterTask implements BuildTask {
  readonly description = 'test components';
  constructor(readonly extensionId: string) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    const tester: Tester = context.env.getTester();

    const componentsSpecFiles = ComponentMap.as(context.components, detectTestFiles);
    // const testMatch = componentSpecFiles.toArray().reduce((acc: AbstractVinyl[], [component, specs]) => {
    //   const files = specs.map((specFile) => specFile);
    //   acc = acc.concat(files);
    //   return acc;
    // }, []);

    const specFilesWithCapsule = ComponentMap.as(context.components, (component) => {
      const componentSpecFiles = componentsSpecFiles.get(component.id.fullName);
      if (!componentSpecFiles) throw new Error('capsule not found');
      const [c, specs] = componentSpecFiles;
      return specs.map((specFile) => {
        const capsule = context.capsuleGraph.capsules.getCapsule(component.id);
        if (!capsule) throw new Error('capsule not found');
        return { path: join(capsule.wrkDir, specFile.relative), relative: specFile.relative };
      });
    });

    const testerContext = Object.assign(context, {
      release: true,
      specFiles: specFilesWithCapsule,
      rootPath: context.capsuleGraph.capsulesRootDir,
    });

    // todo: @guy to fix. handle components without tests, define tests results and implement from jest.
    // todo: fix spec type file need to capsule will return files with type AbstractVinyl
    //@ts-ignore
    const testsResults = await tester.test(testerContext);
    return {
      artifacts: [],
      components: testsResults.components.map((componentTests) => ({
        id: componentTests.componentId,
        data: { tests: componentTests.tests, error: componentTests.error ? componentTests.error : [] },
        errors: testsResults.errors ? [] : [],
      })),
    };
  }
}
