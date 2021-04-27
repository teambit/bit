import { BitError } from '@teambit/bit-error';

export class PersistFailed extends BitError {
  constructor(failedScopes: string[], errors: { [scopeName: string]: string }) {
    super(`failed persisting to the following scopes: ${failedScopes.join(', ')}
errors:
${Object.keys(errors)
  .map((scopeName) => `${scopeName} - ${errors[scopeName]}`)
  .join('\n')}

the remote bit.dev will try to re-persist the data for the failed scopes.
   `);
  }
}
