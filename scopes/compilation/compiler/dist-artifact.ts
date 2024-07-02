import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';

export class DistArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  getFile(path: string) {
    return this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative) === path;
    });
  }
}
