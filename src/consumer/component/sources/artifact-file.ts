import { join } from 'path';
import fs from 'fs-extra';
import { Scope } from '../../../scope';
import { Source } from '../../../scope/models';
import { Ref } from '../../../scope/objects';
import { pathNormalizeToLinux } from '../../../utils';
import { ArtifactSource, ArtifactRef } from './artifact-files';
import { ArtifactVinyl } from './artifact';
import ShowDoctorError from '../../../../dist/error/show-doctor-error';

export type ArtifactModel = { relativePath: string; file: string };

export type ArtifactFileObject = {
  relativePath: string;
  vinyl?: ArtifactVinyl;
};

export class ArtifactFile {
  ref: Ref | undefined | null;
  source: ArtifactSource | undefined | null;

  constructor(public relativePath: string, public vinyl?: ArtifactVinyl) {}

  clone() {
    const vinyl = this.vinyl?.clone();
    return new ArtifactFile(this.relativePath, vinyl);
  }

  static parse(fileObject: ArtifactFileObject): ArtifactFile {
    if (fileObject instanceof ArtifactFile) {
      return fileObject;
    }
    return new ArtifactFile(fileObject.relativePath, fileObject.vinyl);
  }

  getArtifactRef(): ArtifactRef | undefined {
    const ref = this.ref;
    if (!ref) return undefined;
    return {
      ref,
      relativePath: this.relativePath,
    };
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
      this.ref = this.source.source.hash();
    }
  }

  populateRefFromModel({ file }: ArtifactModel) {
    this.ref = file ? Ref.from(file) : null;
  }

  populateVinylFromPath(rootDir: string) {
    const vinyl = new ArtifactVinyl({
      path: this.relativePath,
      contents: fs.readFileSync(join(rootDir, this.relativePath)),
    });
    this.vinyl = vinyl;
  }

  async populateVinylFromRef(scope: Scope) {
    const artifactRef = this.getArtifactRef();
    if (!artifactRef) throw new ShowDoctorError(`failed loading file ${this.relativePath} from the model`);
    const content = (await artifactRef.ref.load(scope.objects)) as Source;
    if (!content) throw new ShowDoctorError(`failed loading file ${this.relativePath} from the model`);
    const vinyl = new ArtifactVinyl({
      base: '.',
      path: this.relativePath,
      contents: content.contents,
      url: artifactRef.url,
    });
    this.vinyl = vinyl;
  }

  toModelObject() {
    return {
      relativePath: this.relativePath,
      file: this.ref?.hash,
    };
  }

  static fromModel(artifactModel: ArtifactModel) {
    const artifactFile = new ArtifactFile(artifactModel.relativePath, undefined);
    artifactFile.populateRefFromModel(artifactModel);
    return artifactFile;
  }
}
