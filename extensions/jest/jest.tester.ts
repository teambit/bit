import { flatten } from 'lodash';
import { Tester, TesterContext, TestResults, TestResult } from '@teambit/tester';
import { runCLI } from 'jest';
import { TestResult as JestTestResult } from '@jest/test-result';
import { Component } from '@teambit/component';

export class JestTester implements Tester {
  constructor(readonly jestConfig: any) {}

  private attachToComponentId(testResults: JestTestResult[], components: Component[]) {
    const tests = components.map((component) => {
      return {
        componentId: component.id,
        testSuites: this.buildTestsBySpecFiles(testResults, component),
      };
    });

    return flatten(tests.filter((test) => test.testSuites.length != 0));
  }

  private buildTestsBySpecFiles(testResults: JestTestResult[], component: Component) {
    //@ts-ignore
    return component.relativeSpecs.map((spec: { path: string; file: string; fullPath: string }) => {
      const jestTestResult = testResults.find((testResult) => testResult.testFilePath === spec.fullPath);
      if (!jestTestResult) return;
      return {
        file: spec.file,
        tests: this.buildTests(jestTestResult),
        error: jestTestResult.testExecError?.message,
      };
    });
  }

  private buildTests(jestTestResult: JestTestResult) {
    return jestTestResult.testResults.map(
      (test) => new TestResult(test.ancestorTitles, test.title, test.status, test.duration)
    );
  }

  async test(context: TesterContext): Promise<TestResults> {
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
    // :TODO he we should match results to components and format them accordingly. (e.g. const results = runCLI(...))

    const testsOutPut = await runCLI(withEnv, [this.jestConfig]);
    const testResults = testsOutPut.results.testResults;
    const componentTestResults = this.attachToComponentId(testResults, context.components);
    return componentTestResults;
  }
}
