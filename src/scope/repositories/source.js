/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { SourceNotFound } from '../exceptions';
import { BIT_SOURCES_DIRNAME } from '../../constants';
import InvalidBit from '../../bit/exceptions/invalid-bit';
import Bit from '../../bit';
import PartialBit from '../../bit/partial-bit';
import { BitId } from '../../bit-id';
import { listDirectories, rmDir } from '../../utils';
import type { BitDependencies } from '../scope';

export default class Source extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_SOURCES_DIRNAME);
  }

  getBitPath(bitName: string) {
    return path.join(this.getPath(), bitName);
  }  

  getPartial(name: string): Promise<PartialBit> {
    return PartialBit.load(path.join(this.getPath(), name), name);
  }

  setSource(bit: Bit, dependencies: BitDependencies): Promise<Bit> {
    if (!bit.validate()) throw new InvalidBit();
    return bit
      .cd(this.composeSourcePath(bit.getId()))
      .write(true)
      .then(() => this.scope.sourcesMap.setBit(bit.getId(), dependencies))
      .then(() => bit);
  }

  listVersions(bitId: BitId): number[] {
    return listDirectories(this.composeVersionsPath(bitId.name, bitId.box))
      .map(version => parseInt(version));
  }

  resolveVersion(id: BitId) {
    return id.getVersion().resolve(this.listVersions(id));
  }

  loadSource(id: BitId): Promise<Bit> {
    try {
      const version = this.resolveVersion(id);
      return Bit.load(this.composeSourcePath({
        name: id.name,
        box: id.box,
        version
      }), id.name, this.scope.name());
    } catch (err) {
      throw new SourceNotFound(id);
    }
  }

  loadSources() {

  }

  clean(bitId: BitId) {
    // bitId.version = this.resolveVersion(bitId);
    // return rmDir(this.composeSourcePath(bitId));
  }

  composeVersionsPath(name: string, box: string) {
    return path.join(this.getPath(), box, name);
  }

  composeSourcePath({ name, box = 'global', version }: {name: string, box?: string, version: number }) {
    return path.join(this.getPath(), box, name, version.toString());
  }
}
