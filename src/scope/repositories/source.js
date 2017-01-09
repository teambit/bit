/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { SourceNotFound } from '../exceptions';
import { BIT_SOURCES_DIRNAME } from '../../constants';
import InvalidBit from '../../bit/exceptions/invalid-bit';
import Bit from '../../bit';
import PartialBit from '../../bit/partial-bit';
import { BitId, BitIds } from '../../bit-id';
import { listDirectories, rmDir, empty, glob } from '../../utils';

export default class Source extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_SOURCES_DIRNAME);
  }

  getBitPath(bitName: string) {
    return path.join(this.getPath(), bitName);
  }  

  getPartial(name: string): Promise<PartialBit> {
    return PartialBit.load(path.join(this.getPath(), name), name, this.scope.name());
  }

  setSource(bit: Bit, dependencies: Bit[]): Promise<Bit> {
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

  list(): BitIds {
    // function listComponents(components: string[]) {
    //   return components.map((component) => {
    //     return {
    //       name: component,
    //       version: this.resolveVersion('latest')
    //     };
    //   });
    // }

    // return listDirectories(this.getPath())
    //   .map((box) => {
    //     return {
    //       box,
    //       components: listComponents.bind(this,
    //         listDirectories(this.composeBoxPath(box))
    //       ),
    //     };
    //   });
    return glob(path.join(this.getPath(), '*', '*', '*'))
      .then(matches => 
        matches.map((match) => {
          const bitId = path.parse(match);
          return PartialBit.load(match, '', this.scope.name());
        })
      );
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

  composeSourcePath({ name, box = 'global', version }: {name: string, box?: string, version: number }) {
    return path.join(this.getPath(), box, name, version.toString());
  }
}
