import { Component } from "@teambit/component";
import { Artifact, ArtifactVinyl, FileStorageResolver } from "@teambit/builder";

export class FakeStorageResolver implements FileStorageResolver {
  name: 'fake-storage-resolver';

  async storeFile(
    component: Component,
    artifact: Artifact,
    file: ArtifactVinyl
  ): Promise<string> {

    const relativeFilePath = file.relative;
    const url = `http://fake-url/${relativeFilePath}`;

    return url;
  }
}
