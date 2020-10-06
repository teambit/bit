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
}
