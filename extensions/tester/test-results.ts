export class TestResult {
  constructor(
    /** ancestor Titles  */
    public ancestor: string[],

    /** name of test  */
    public name: string,

    /*  the status of test (passing, skipped) */
    public status: string,

    /*  the file of test */
    public file: string,

    /** test object data  */
    public duration?: number | null,

    /*  error log */
    public error?: string
  ) {}
}
