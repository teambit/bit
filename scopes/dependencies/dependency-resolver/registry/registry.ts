export class Registry {
  constructor(
    /**
     * uri of the registry.
     */
    readonly uri: string,

    /**
     * always authenticate.
     */
    readonly alwaysAuth: boolean,

    /**
     * authentication header.
     */
    readonly authHeaderValue?: string
  ) {}

  get token(): string | undefined {
    if (!this.authHeaderValue || !this.authHeaderValue.startsWith('Bearer')) return undefined;
    return this.authHeaderValue.replace('Bearer ', '');
  }

  /**
   * Support for basic token or user/pass
   */
  get baseToken(): string | undefined {
    if (!this.authHeaderValue || !this.authHeaderValue.startsWith('Basic')) return undefined;
    return this.authHeaderValue.replace('Basic ', '');
  }
}
