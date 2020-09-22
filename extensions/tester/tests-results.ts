import { TestsFiles } from './tests-files';

export class TestsResult {
  constructor(
    public testFiles: TestsFiles[],

    public success?: boolean,

    public start?: number
  ) {}
}
