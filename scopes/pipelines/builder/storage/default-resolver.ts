import { Component } from '@teambit/component';
import { FsArtifact } from '../artifact';
import { WholeArtifactStorageResolver } from './storage-resolver';

export class DefaultResolver implements WholeArtifactStorageResolver {
  name = 'default';

  async store(component: Component, artifact: FsArtifact) {
    artifact.files.populateVinylsFromPaths(artifact.rootDir);
  }
}
