import { TestsFiles } from './tests-files';

export class TestsResultList {
  constructor(
    public testFiles: TestsFiles[],

    public success?: boolean,

    public start?: number
  ) {}
}
