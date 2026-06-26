import { BitError } from '@teambit/bit-error';

export default class ClientIdInUse extends BitError {
  code: number;
  constructor(public clientId: string) {
    super(
      `fatal: another client is already exporting to the same scopes as yours using the same export id (${clientId}), please try again.`
    );
    this.code = 136;
  }
}
