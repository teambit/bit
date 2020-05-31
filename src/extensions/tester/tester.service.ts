import { EnvService, ExecutionContext } from '../environments';
import { Component } from '../component';
import { Tester, TestResults } from './tester';

export class TesterService implements EnvService {
  constructor(
    /**
     * regex used to identify which files to test.
     */
    readonly testsRegex: string
  ) {}

  /**
   * returns the configured test files for the component
   */
  async testFiles(component: Component) {
    // TODO: refactor to `return component.filesystem.byRegex(this.testsRegex);`
    // and make sure it applies on component files recurisively
    return component.filesystem.readdirSync('/').find((path: string) => {
      return path.match(this.testsRegex);
    });
  }

  async run(context: ExecutionContext): Promise<TestResults> {
    // Object.assign(context, {
    //   testFiles: this.testFiles()
    // });
    const tester = context.apply<Tester>('defineTester', [context]);
    return tester.test(context);
  }
}
