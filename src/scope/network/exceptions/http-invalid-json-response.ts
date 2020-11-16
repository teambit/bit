import { BitError } from '../../../error/bit-error';

export class HttpInvalidJsonResponse extends BitError {
  constructor(public url: string) {
    super(
      `fatal: failed parsing http json response, please make sure the response is a valid json object. url: ${url}`
    );
  }
}
