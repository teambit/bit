import { TestResult } from './test-results';

export class TestsFiles {
  constructor(
    public file: string,

    public tests: TestResult[],

    public pass: number,

    public failed: number,

    public pending: number,

    public duration?: number,

    public slow?: boolean,

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
