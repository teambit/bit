import { Component } from '@teambit/component';
import { StorageResolver, StoreResult, ArtifactStoreResult, ArtifactFileStoreResult } from './storage-resolver';
import type { ArtifactList } from '../artifact';
import { FsArtifact } from '../artifact/fs-artifact';

export class DefaultResolver implements StorageResolver {
  name = 'default';

  async store(component: Component, artifactList: ArtifactList<FsArtifact>): Promise<StoreResult> {
    const artifactsResults: ArtifactStoreResult[] = [];
    artifactList.artifacts.forEach((artifact) => {
      artifact.files.populateVinylsFromPaths(artifact.rootDir);
      artifact.files.populateArtifactSourceFromVinyl();
      artifact.files.populateRefsFromSources();
      const filesResults: ArtifactFileStoreResult[] = artifact.files.map((file) => {
        return {
          relativePath: file.relativePath,
          metadata: {
            file: file.getRef()?.hash,
          },
        };
      });
      artifactsResults.push({ name: artifact.name, files: filesResults });
    });
    return {
      artifacts: artifactsResults,
    };
  }
}
