import { BitError } from '@teambit/bit-error';
import type { WorkspacePolicyEntry } from '../workspace-policy';

export class EntryAlreadyExist extends BitError {
  constructor(entry: WorkspacePolicyEntry) {
    super(
      `policy entry with ${entry.dependencyId} already exists, use install -u | --update-existing to update the entry`
    );
  }
}
