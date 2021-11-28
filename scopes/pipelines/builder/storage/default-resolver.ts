import { Component } from '@teambit/component';
import { StorageResolver, StoreResult } from './storage-resolver';
import type { ArtifactList } from '../artifact';
import { FsArtifact } from '../artifact/fs-artifact';

export class DefaultResolver implements StorageResolver {
  name = 'default';

  async store(component: Component, artifactList: ArtifactList<FsArtifact>): Promise<StoreResult> {
    artifactList.artifacts.forEach((artifact) => {
      artifact.files.populateVinylsFromPaths(artifact.rootDir);
    });
    return {};
  }
}
