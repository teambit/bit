import { TestsFiles } from './tests-files';

export class TestsResult {
  constructor(
    /**
     * file tested.
     */
    public testFiles: TestsFiles[],

    /**
     * whether test is successful or not.
     */
    public success?: boolean,

    /**
     * start? ask guy.
     */
    public start?: number
  ) {}
}
