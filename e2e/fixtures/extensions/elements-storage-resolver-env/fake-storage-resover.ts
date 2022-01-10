import { Component } from "@teambit/component";
import { Artifact, ArtifactVinyl, FileStorageResolver } from "@teambit/builder";
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';

export class FakeStorageResolver implements FileStorageResolver {
  name: 'fake-storage-resolver';

  async storeFile(
    component: Component,
    artifact: Artifact,
    file: ArtifactVinyl
  ): Promise<string> {

    const relativeFilePath = pathNormalizeToLinux(file.relative);
    const url = `http://fake-url/${relativeFilePath}`;

    return url;
  }
}
