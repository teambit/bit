import { BitError } from '@teambit/bit-error';

export default class ServerIsBusy extends BitError {
  code: number;
  constructor(public queueSize: number, public currentExportId: string) {
    super(
      `fatal: the server is busy by other exports. total exports (including yours) in the queue: ${queueSize},
the current export-id in queue is "${currentExportId}".
in a few minutes, bit.cloud will try to complete the export for you.
if the remote scopes are not updated, please contact support.
`
    );
    this.code = 137;
  }
}
