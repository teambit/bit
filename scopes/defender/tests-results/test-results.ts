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

    /**
     * failure as an Error object or a string. Use `this.failure` to get it always as a string
     */
    public failureErrOrStr?: Error | string
  ) {}

  /*  failure message */
  get failure(): string | undefined {
    if (!this.failureErrOrStr) return undefined;
    if (typeof this.failureErrOrStr === 'string') return this.failureErrOrStr;
    return this.failureErrOrStr?.message;
  }
}
