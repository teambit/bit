import { BitError } from '@teambit/bit-error';

export default class ClientIdInUse extends BitError {
  code: number;
  constructor(public clientId: string) {
    super(
      `fatal: another client started exporting to the same scopes as yours within the exact same millisecond (${clientId}), please try again.`
    );
    this.code = 136;
  }
}
