import type { PnpmError } from '@pnpm/error';
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
  const msg = renderErrorMessage(err);
  const newErr = new BitErrorWithRichMessage(msg, msg);
  newErr.cause = err;
  return newErr;
}

function renderErrorMessage(err: PnpmError): string {
  let output = err.message;
  if (err.hint) {
    output += `\n\n${err.hint}`;
  }
  if (err.pkgsStack != null) {
    if (err.pkgsStack.length > 0) {
      output += `\n\n${formatPkgsStack(err.pkgsStack)}`;
    } else if (err.prefix) {
      output += `\n\nThis error happened while installing a direct dependency of ${err.prefix as string}`;
    }
  }
  return output;
}

function formatPkgsStack(pkgsStack: Array<{ id: string; name: string; version: string }>) {
  return `This error happened while installing the dependencies of \
${pkgsStack[0].name}@${pkgsStack[0].version}\
${pkgsStack
  .slice(1)
  .map(({ name, version }) => `\n at ${name}@${version}`)
  .join('')}`;
}
