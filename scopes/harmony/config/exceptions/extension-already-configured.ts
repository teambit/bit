import { BitError } from 'bit-bin/dist/error/bit-error';

export class ExtensionAlreadyConfigured extends BitError {
  constructor(readonly extensionId: string) {
    super(`error: the extension ${extensionId} is already configured in the config file`);
  }
}
