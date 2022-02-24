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

    public error?: string
  ) {}

  get totalTests() {
    return this.tests.length;
  }
}
