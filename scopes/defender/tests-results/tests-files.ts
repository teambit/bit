import { TestResult } from './test-results';

/**
 * @todo: rename to `TestsFile` (singular not plural). it represents one file only.
 */
export class TestsFiles {
  constructor(
    public file: string,

    public tests: TestResult[],

    public pass: number,

    public failed: number,

    public pending: number,

    public duration?: number,

    public slow?: boolean,

    /**
     * this should not include any failures.
     * it is relevant only when the tester got an unexpected error.
     *
     * if you're writing a tester, make sure to print this error in the terminal.
     * (e.g. for Jest, it's part of Jest output. for Mocha, this error needs to be explicitly printed using
     * `this.logger.consoleFailure()` method)
     *
     * the reason why this error is not thrown is for the UI to be able to show the test-results for all files and only
     * the ones that got an error, show the error nicely for them.
     */
    public error?: Error
  ) {}

  get totalTests() {
    return this.tests.length;
  }

  get errorStr() {
    if (!this.error) return undefined;
    return this.error.message;
  }
}
