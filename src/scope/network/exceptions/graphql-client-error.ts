import { ClientError } from 'graphql-request';
import { BitError } from '../../../error/bit-error';

/**
 * @see https://www.npmjs.com/package/graphql-request#error-handling
 */
export class GraphQLClientError extends BitError {
  constructor(private err: ClientError) {
    super(JSON.stringify(err, undefined, 2));
    this.stack = err.stack;
  }
  report() {
    if (!this.err.response.errors) return this.message;
    const errors = this.err.response.errors.map((error) => error.message).join('\n');
    return `fatal: graphql found the following error(s), use --log to see the request, response and the full stack\n\n${errors}`;
  }
}
