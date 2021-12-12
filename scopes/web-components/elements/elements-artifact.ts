import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';

export class ElementsArtifact {
  constructor(private artifacts: ArtifactVinyl[]) {}

  static defaultMainFilePrefix = 'elements';

  isEmpty() {
    return !this.artifacts.length;
  }

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

  getMainElementsFileUrl(): string | undefined {
    const mainFile = this.artifacts.find((file) => {
      return pathNormalizeToLinux(file.relative).includes(`${this.getDefaultMainFilePrefix()}.`);
    });
    return mainFile?.url;
  }
}
