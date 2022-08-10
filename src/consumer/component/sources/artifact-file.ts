import { join } from 'path';
import fs from 'fs-extra';
import { Scope } from '../../../scope';
import { Source } from '../../../scope/models';
import { pathNormalizeToLinux } from '../../../utils';
import { ArtifactSource, ArtifactRef, ArtifactModel, ArtifactFileObject } from './artifact-files';
import { ArtifactVinyl } from './artifact';
import { Ref } from '../../../scope/objects';
import ShowDoctorError from '../../../../dist/error/show-doctor-error';

export class ArtifactFile {
  source: ArtifactSource | undefined | null;

  constructor(public path: string, public vinyl?: ArtifactVinyl, public ref?: ArtifactRef | null) {}

  clone() {
    const vinyl = this.vinyl?.clone();
    return new ArtifactFile(this.path, vinyl);
  }

  static parse(fileObject: ArtifactFileObject): ArtifactFile {
    if (fileObject instanceof ArtifactFile) {
      return fileObject;
    }
    return new ArtifactFile(fileObject.path, fileObject.vinyl);
  }

  populateArtifactSourceFromVinyl(): ArtifactSource | undefined {
    if (this.vinyl) {
      const source = {
        relativePath: pathNormalizeToLinux(this.vinyl.relative),
        source: this.vinyl.toSourceAsLinuxEOL(),
      };
      this.source = source;
      return source;
    }
    return undefined;
  }

  populateRefFromSource() {
    if (this.source) {
      this.ref = { ref: this.source.source.hash(), relativePath: this.source.relativePath, url: this.source.url };
    }
  }

  populateVinylFromPath(rootDir: string) {
    const vinyl = new ArtifactVinyl({
      path: this.path,
      contents: fs.readFileSync(join(rootDir, this.path)),
    });
    this.vinyl = vinyl;
  }

  async populateVinylFromRef(scope: Scope) {
    if (!this.ref) throw new ShowDoctorError(`failed loading file ${this.path} from the model`);
    const content = (await this.ref.ref.load(scope.objects)) as Source;
    if (!content) throw new ShowDoctorError(`failed loading file ${this.path} from the model`);
    const vinyl = new ArtifactVinyl({
      base: '.',
      path: this.path,
      contents: content.contents,
      url: this.ref.url,
    });
    this.vinyl = vinyl;
  }

  toModelObject() {
    return {
      relativePath: this.path,
      file: this.ref?.ref.hash,
    };
  }

  static fromModel(artifactModel: ArtifactModel) {
    const artifactRef: ArtifactRef | undefined =
      (artifactModel.relativePath &&
        artifactModel.file && {
          relativePath: artifactModel.relativePath,
          url: artifactModel.url,
          ref: Ref.from(artifactModel.file),
        }) ||
      undefined;
    const artifactFile = new ArtifactFile(artifactModel.relativePath, undefined, artifactRef);
    return artifactFile;
  }
}
