export class DocModule {
  constructor(
    readonly path: string,

    /**
     * original doc module.
     */
    readonly module: any
  ) {}

  /**
   * get the abstract.
   */
  get abstract() {
    return this.module.abstract || this.module.default?.abstract;
  }
}
