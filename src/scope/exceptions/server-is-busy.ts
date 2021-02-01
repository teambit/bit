import { BitError } from '@teambit/bit-error';

export default class ServerIsBusy extends BitError {
  code: number;
  constructor(public queueSize: number, public currentExportId: string) {
    super(
      `fatal: the server is busy exporting from other clients. total clients (including yours) in the queue: ${queueSize},
the current export-id in queue is "${currentExportId}".
if the last export was failed during the persist stage and left the remotes locked, you have the following options:
1. if the failure occurred on your local, just re-run the export command with "--resume <id>".
2. run "bit persist <id> <remotes...>", you will need to list all the remote scopes you want the persist to take place.
`
    );
    this.code = 137;
  }
}
