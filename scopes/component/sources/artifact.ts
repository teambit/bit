import AbstractVinyl from './abstract-vinyl';
import { registerRustSnapshotTransactionClass, registerRustSnapshotFunctions } from '@teambit/objects';

export class ArtifactVinyl extends AbstractVinyl {
  url?: string;
  constructor(opts) {
    super(opts);
    if (opts.url) {
      this.url = opts.url;
    }
  }
}

registerRustSnapshotTransactionClass('ArtifactVinyl', ArtifactVinyl);
registerRustSnapshotTransactionClass('Array', Array);
registerRustSnapshotFunctions('SnapshotArtifactVinyl', ArtifactVinyl, ['isCustomProp']);
registerRustSnapshotFunctions('SnapshotArtifactObject', Object, ['keys']);
registerRustSnapshotFunctions('SnapshotArtifactBuffer', Buffer, ['from', 'isBuffer']);
