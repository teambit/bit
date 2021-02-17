import { getAuthDataFromHeader } from '@teambit/legacy/dist/scope/network/http/http';

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
    const authData = getAuthDataFromHeader(this.authHeaderValue);
    return authData && authData.type === 'Bearer' ? authData.credentials : undefined;
  }

  /**
   * Support for basic token or user/pass
   */
  get baseToken(): string | undefined {
    const authData = getAuthDataFromHeader(this.authHeaderValue);
    return authData && authData.type === 'Basic' ? authData.credentials : undefined;
  }
}
