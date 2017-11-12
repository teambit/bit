/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { BIT_SOURCES_DIRNAME } from '../../constants';
import { BitId } from '../../bit-id';
import { listDirectories, rmDir, empty } from '../../utils';

export default class Source extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_SOURCES_DIRNAME);
  }

  listVersions(bitId: BitId): number[] {
    return listDirectories(this.composeVersionsPath(bitId.name, bitId.box)).map(version => version);
  }

  resolveVersion(id: BitId) {
    return id.getVersion().resolve(this.listVersions(id));
  }

  isBoxEmpty(box: string) {
    return empty(listDirectories(this.composeBoxPath(box)));
  }

  composeBoxPath(box: string) {
    return path.join(this.getPath(), box);
  }

  clean(bitId: BitId) {
    bitId.version = this.resolveVersion(bitId);
    rmDir(this.composeSourcePath(bitId));

    if (empty(this.listVersions(bitId).length)) {
      rmDir(this.composeVersionsPath(bitId.name, bitId.box));
    }

    if (this.isBoxEmpty(bitId.box)) {
      rmDir(this.composeBoxPath(bitId.box));
    }
  }

  composeVersionsPath(name: string, box: string) {
    return path.join(this.getPath(), box, name);
  }

  composeSourcePath({ name, box = 'global', version }: { name: string, box?: string, version: string }) {
    return path.join(this.getPath(), box, name, version);
  }
}
