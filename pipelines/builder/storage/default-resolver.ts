import { Component } from '@teambit/component';
import { StorageResolver } from './storage-resolver';
import type { ArtifactList } from '../artifact';

export class DefaultResolver implements StorageResolver {
  name = 'default';

  async store(component: Component, artifactList: ArtifactList) {
    artifactList.artifacts.forEach((artifact) => {
      artifact.files.populateVinylsFromPaths(artifact.rootDir);
    });
  }
}
