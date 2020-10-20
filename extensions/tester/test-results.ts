export class TestResult {
  constructor(
    /** ancestor Titles  */
    public ancestor: string[],

    /** name of test  */
    public name: string,

    /*  the status of test (passing, skipped, failed) */
    public status: string,

    /** test object data  */
    public duration?: number | null,

    /*  error log */
    public error?: string
  ) {}
}
