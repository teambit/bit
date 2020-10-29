export class Issue {
  constructor(
    /** name of issue */

    readonly name: string,

    /** message of issue */

    readonly message?: string,

    /** affected files */

    readonly files?: string[]
  ) {}
}
