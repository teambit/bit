import { join } from 'path';
import fs from 'fs-extra';
import { Ref } from '../../../scope/objects';
import { pathNormalizeToLinux } from '../../../utils';
import { ArtifactVinyl } from './artifact';
import { ArtifactSource } from './artifact-files';

export type ArtifactRef = { relativePath: string; ref: Ref };
export type ArtifactStore = { name: string; url?: string; metadata?: Object };
export type LegacyArtifactModel = { relativePath: string; file: string };
export type NewArtifactModel = { relativePath: string; stores?: Array<ArtifactStore> };
export type ArtifactModel = NewArtifactModel | LegacyArtifactModel;

export type ArtifactFileObject = {
  relativePath: string;
  vinyl?: ArtifactVinyl;
  stores?: Array<ArtifactStore>;
};

export class ArtifactFile {
  ref: Ref | undefined | null;
  source: ArtifactSource | undefined | null;
  constructor(public relativePath: string, public vinyl?: ArtifactVinyl, public stores?: Array<ArtifactStore>) {}

  clone() {
    const vinyl = this.vinyl?.clone();
    const stores = this.stores?.map((store) => ({ ...store }));
    return new ArtifactFile(this.relativePath, vinyl, stores);
  }

  static parse(fileObject: ArtifactFileObject): ArtifactFile {
    if (fileObject instanceof ArtifactFile) {
      return fileObject;
    }
    return new ArtifactFile(fileObject.relativePath, fileObject.vinyl, fileObject.stores);
  }

  /**
   * Return the ref of the default resolver if exist
   * @returns
   */
  getRef(): Ref | undefined {
    if (this.ref) return this.ref;
    if (this.ref === null) return undefined;
    const defaultStore = this.getDefaultStore();
    if (!defaultStore) {
      this.ref = null;
      return undefined;
    }

    // @ts-ignore
    const fileHash = defaultStore?.metadata?.file;
    if (!fileHash) {
      this.ref = null;
      return undefined;
    }
    this.ref = new Ref(fileHash);
    return this.ref;
  }

  getArtifactRef(): ArtifactRef | undefined {
    const ref = this.getRef();
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

  getDefaultStore(): ArtifactStore | undefined {
    return this.stores?.find((store) => store.name === 'default');
  }

  populateVinylFromPath(rootDir: string) {
    const vinyl = new ArtifactVinyl({
      path: this.relativePath,
      contents: fs.readFileSync(join(rootDir, this.relativePath)),
    });
    this.vinyl = vinyl;
  }

  compatibleWithBackwardModelObject(): boolean {
    if (this.stores?.length === 1 && this.getDefaultStore()) {
      return true;
    }
    return false;
  }

  toModelObject() {
    // If there is no new stores, save it in the model is it used to be saved
    if (this.compatibleWithBackwardModelObject()) {
      return this.toBackwardCompatibleObject();
    }
    return {
      relativePath: this.relativePath,
      stores: this.stores,
    };
  }

  toBackwardCompatibleObject() {
    return {
      relativePath: this.relativePath,
      file: this.getRef()?.hash,
    };
  }

  static fromModel(artifactModel: ArtifactModel) {
    // @ts-ignore
    if (artifactModel.file) {
      // @ts-ignore
      return this.fromLegacyModel(artifactModel);
    }
    // @ts-ignore
    return new ArtifactFile(artifactModel.relativePath, undefined, artifactModel.stores);
  }

  static fromLegacyModel(artifactModel: LegacyArtifactModel) {
    const store: ArtifactStore = {
      name: 'default',
      metadata: { file: artifactModel.file },
    };
    return new ArtifactFile(artifactModel.relativePath, undefined, [store]);
  }
}
