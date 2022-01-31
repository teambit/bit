interface GlobalFlags {
  _token?: string;
  _header?: string;
}

class GlobalFlags implements GlobalFlags {
  get token(): string | undefined {
    return this._token;
  }

  set token(token: string | undefined) {
    this._token = token;
  }

  get header(): string | undefined {
    return this._header;
  }

  set header(header: string | undefined) {
    this._header = header;
  }

}

const globalFlags = new GlobalFlags();

export default globalFlags;
