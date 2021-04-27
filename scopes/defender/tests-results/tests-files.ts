import { TestResult } from './test-results';

export type Error = {
  failureMessage?: string | null;
  error?: string;
};

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
}
