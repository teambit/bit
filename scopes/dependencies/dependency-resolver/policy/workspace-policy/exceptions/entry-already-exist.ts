import { BitError } from '@teambit/bit-error';
import { WorkspacePolicyEntry } from '../workspace-policy';

export class EntryAlreadyExist extends BitError {
  constructor(entry: WorkspacePolicyEntry) {
    super(
      `policy entry with ${entry.dependencyId} already exist, use install -u | --update-existing to update the entry`
    );
  }
}
