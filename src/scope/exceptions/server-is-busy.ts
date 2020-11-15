import { BitError } from '../../error/bit-error';

export default class ServerIsBusy extends BitError {
  code: number;
  constructor(public queueSize: number, public nextClientStale: number) {
    super(
      `fatal: the server is busy exporting from other clients. total clients (including yours) in the queue: ${queueSize},
the next client becomes stale in ${Math.floor(nextClientStale / 1000)} seconds`
    );
    this.code = 137;
  }
}
