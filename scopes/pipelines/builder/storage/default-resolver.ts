import { Component } from '@teambit/component';
import { WholeArtifactStorageResolver } from './storage-resolver';
import type { Artifact } from '../artifact';

export class DefaultResolver implements WholeArtifactStorageResolver {
  name = 'default';

  async store(component: Component, artifact: Artifact) {
    artifact.files.populateVinylsFromPaths(artifact.rootDir);
  }
}
