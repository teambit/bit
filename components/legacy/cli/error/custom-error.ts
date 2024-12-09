import { BitError } from '@teambit/bit-error';

/**
 * useful to throw an error from the remote server and print it as is on the client, without any extra data.
 * this way, in the future, in case we need to throw an error from the server, we don't need to
 * update the client to get the error the way we want it.
 */
export class CustomError extends BitError {
  code: number;
  message: string;

  constructor(message: string) {
    super();
    this.code = 132;
    this.message = message;
  }
}
