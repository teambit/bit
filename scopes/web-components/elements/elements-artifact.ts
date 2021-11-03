import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';

export class ElementsArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  static defaultMainFilePrefix = 'elements';

  getFile(path: string) {
    return this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative) === path;
    });
  }

  getDefaultMainFilePrefix() {
    return ElementsArtifact.defaultMainFilePrefix;
  }

  getMainElementsBundleFile() {
    return this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative).includes(`${this.getDefaultMainFilePrefix()}.`);
    });
  }
}
