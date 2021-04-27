import { BitError } from '@teambit/bit-error';
import { ClientError } from 'graphql-request';
import { PermissionDenied } from '.';

/**
 * @see https://www.npmjs.com/package/graphql-request#error-handling
 */
export class GraphQLClientError extends BitError {
  constructor(private err: ClientError, private url: string, private scopeName: string) {
    super(JSON.stringify(err, undefined, 2));
    this.stack = err.stack;
  }
  report() {
    if (!this.err.response.errors) {
      if (this.err.response.status && this.err?.response?.status === 403) {
        return new PermissionDenied(this.getRemoteInfo()).report();
      }
      return this.message;
    }
    const errors = this.err.response.errors.map((error) => error.message).join('\n');
    return `fatal: graphql found the following error(s), use --log to see the request, response and the full stack\n\n${errors}`;
  }
  getRemoteInfo(): string {
    return `"${this.scopeName}" (${this.url})`;
  }
}
