import type { Component } from '@teambit/component';
import type { FsArtifact } from '../artifact';
import type { WholeArtifactStorageResolver } from './storage-resolver';

export class DefaultResolver implements WholeArtifactStorageResolver {
  name = 'default';

  async store(component: Component, artifact: FsArtifact) {
    artifact.files.populateVinylsFromPaths(artifact.rootDir);
  }
}
