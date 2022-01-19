import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';

export class PreviewArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  getPaths() {
    return this.artifacts.map((artifact) => artifact.relative);
  }

  getFile(path: string) {
    return this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative) === path;
    });
  }

  getFileEndsWith(path: string) {
    return this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative).endsWith(path);
    });
  }
}
