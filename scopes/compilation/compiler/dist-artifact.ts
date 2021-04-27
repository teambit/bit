import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

export class DistArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  getFile(path: string) {
    return this.artifacts.find((file) => {
      return file.relative === path;
    });
  }
}
