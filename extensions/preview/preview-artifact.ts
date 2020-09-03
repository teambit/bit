import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';

export class PreviewArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  getFile(path: string) {
    return this.artifacts.find((file) => {
      return file.relative === path;
    });
  }
}
