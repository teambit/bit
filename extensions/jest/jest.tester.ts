import { compact } from 'lodash';
import { Tester, TesterContext, Tests, TestResult, TestsResult } from '@teambit/tester';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { runCLI } from 'jest';
import { TestResult as JestTestResult } from '@jest/test-result';
import { ComponentMap, ComponentID } from '@teambit/component';

export class JestTester implements Tester {
  constructor(readonly jestConfig: any) {}

  private attachTestsToComponent(testerContext: TesterContext, testResult: JestTestResult[]) {
    return ComponentMap.as(testerContext.components, (component) => {
      const componentSpecFiles = testerContext.specFiles.get(component.id.fullName);
      if (!componentSpecFiles) return null;
      const [c, specs] = componentSpecFiles;
      return testResult.filter((test) => {
        return specs.filter((spec) => spec.path === test.testFilePath).length > 0;
      });
    });
  }

  private buildTestsObj(components: ComponentMap<JestTestResult[] | null>) {
    const tests = components.toArray().map(([component, testsFiles]) => {
      if (!testsFiles) return;
      if (testsFiles?.length === 0) return;
      const errors = testsFiles.reduce((errors: { failureMessage: string; file: string }[], test) => {
        if (test.failureMessage)
          errors.push({
            failureMessage: test.failureMessage,
            file: test.testFilePath,
          });
        return errors;
      }, []);

      const tests = testsFiles.reduce((acc: TestResult[], test) => {
        test.testResults.forEach((testResult) => {
          acc.push(
            new TestResult(
              testResult.ancestorTitles,
              testResult.title,
              testResult.status,
              test.testFilePath,
              testResult.duration
            )
          );
        });
        return acc;
      }, []);
      return { componentId: component.id, results: new TestsResult(tests, errors) };
    });
    // TODO: fix type
    return compact(tests) as { componentId: ComponentID; results: TestsResult }[];
  }

  private getErrors(testResult: JestTestResult[]) {
    return testResult.reduce((errors: any[], test) => {
      errors.push(test.testExecError);
      return errors;
    }, []);
  }

  async test(context: TesterContext): Promise<Tests> {
    const config: any = {
      rootDir: context.rootPath,
      watch: context.watch,
      // runInBand: context.debug,
    };
    // eslint-disable-next-line
    const jestConfig = require(this.jestConfig);
    const testFiles = context.specFiles.toArray().reduce((acc: string[], [component, specs]) => {
      specs.forEach((spec) => acc.push(spec.path));
      return acc;
    }, []);

    const jestConfigWithSpecs = Object.assign(jestConfig, {
      testMatch: testFiles,
    });

    const withEnv = Object.assign(jestConfigWithSpecs, config);
    const testsOutPut = await runCLI(withEnv, [this.jestConfig]);
    const testResults = testsOutPut.results.testResults;
    const componentsWithTests = this.attachTestsToComponent(context, testResults);
    const componentTestResults = this.buildTestsObj(componentsWithTests);
    const globalErrors = this.getErrors(testResults);
    return { components: componentTestResults, errors: globalErrors };
  }
}
