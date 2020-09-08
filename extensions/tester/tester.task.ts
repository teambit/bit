import { BuildContext, BuildResults, BuildTask } from '@teambit/builder';
import { join } from 'path';
import { Component } from '@teambit/component';
import { Tester } from './tester';
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
    const components = detectTestFiles(context.components);
    this.attachCapsulePath(context.components, context.capsuleGraph);
    const testMatch = components.reduce((acc: string[], component: any) => {
      const specs = component.specs.map((specFile) => {
        const capsule = context.capsuleGraph.capsules.getCapsule(component.id);
        if (!capsule) throw new Error('capsule not found');
        return join(capsule.wrkDir, specFile);
      });

      acc = acc.concat(specs);
      return acc;
    }, []);

    const testerContext = Object.assign(context, {
      //workspace: context.env.workspace,
      release: true,
      specFiles: testMatch,
      rootPath: context.capsuleGraph.capsulesRootDir,
    });

    // todo: @guy to fix. handle components without tests, define tests results and implement from jest.
    const testsResults = await tester.test(testerContext);
    return {
      artifacts: [],
      components: testsResults.map((componentTests) => ({
        id: componentTests.componentId,
        data: { testSuites: componentTests.testSuites },
        errors: componentTests.error ? [] : [],
      })),
    };
  }

  private attachCapsulePath(components: Component[], capsuleGraph: Network) {
    return components.map((component) => {
      //@ts-ignore
      const specsFiles = component.specs.map((specFile) => {
        const capsule = capsuleGraph.capsules.getCapsule(component.id);
        if (!capsule) throw new Error('capsule not found');
        const specPath = join(capsule.wrkDir, specFile);
        return { path: capsule.wrkDir, file: specFile, fullPath: specPath };
      });

      const componentWithSpecs = Object.assign(component, {
        relativeSpecs: specsFiles,
      });
      return componentWithSpecs;
    });
  }
}
