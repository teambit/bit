import { AbstractVinyl } from '@teambit/component.sources';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { uniq } from 'lodash';

export class PreviewArtifact {
  constructor(private artifacts: AbstractVinyl[]) {}

  getPaths() {
    // TODO: check why the artifacts stored twice, then remove this uniq here
    return uniq(this.artifacts.map((artifact) => artifact.relative));
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
