import { PnpmError } from '@pnpm/error';
import { BitError } from '@teambit/bit-error';

export class BitErrorWithRichMessage extends BitError {
  private richMessage: string;
  constructor(message: string, richMessage: string) {
    super(message);
    this.richMessage = richMessage;
  }
  public report() {
    return this.richMessage;
  }
}

export function pnpmErrorToBitError(err: PnpmError): BitError {
  return new BitErrorWithRichMessage(err.message, renderErrorMessage(err));
}

function renderErrorMessage(err: PnpmError): string {
  if (err.code?.startsWith('ERR_PNPM_FETCH_')) {
    // On fetching errors, pnpm adds information to the error object about the used auth headers.
    // This information is safe to print as the tokens are obfuscated.
    return `${err.message}

${err.hint}`;
  }
  return err.message;
}
