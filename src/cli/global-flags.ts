interface GlobalFlags {
  _token?: string;
}

class GlobalFlags implements GlobalFlags {
  get token(): string | undefined {
    return this._token;
  }

  set token(token: string | undefined) {
    this._token = token;
  }
}

const globalFlags = new GlobalFlags();

export default globalFlags;
