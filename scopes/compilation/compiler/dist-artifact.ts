import { AbstractVinyl } from '@teambit/component.sources';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';

export class DistArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  getFile(path: string) {
    return this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative) === path;
    });
  }
}
