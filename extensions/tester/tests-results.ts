import { TestResult } from './test-results';

export type Error = {
  failureMessage: string;
  file: string;
};

export class TestsResult {
  constructor(
    public tests: TestResult[],

    public errors?: Error[]
  ) {}
}
