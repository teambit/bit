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
    readonly authHeaderValue?: string,

    /**
     * Type of auth as it appears in the npmrc file
     * authToken
     * auth
     * user-pass
     */
    readonly originalAuthType?: string,

    /**
     * original auth value as it appears in npmrc file
     * for user/pass it will appear as user:pass
     */
    readonly originalAuthValue?: string
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
