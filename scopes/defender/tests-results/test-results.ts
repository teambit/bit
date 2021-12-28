export class TestResult {
  constructor(
    /** ancestor Titles  */
    public ancestor: string[],

    /** name of test  */
    public name: string,

    /*  the status of test (passing, skipped, failed) */
    public status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled',

    /** test duration in milliseconds */
    public duration?: number | null,

    /*  error message */
    public error?: string,

    /*  failure message */
    public failure?: string
  ) {}
}
