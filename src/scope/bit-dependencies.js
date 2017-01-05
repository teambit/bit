/** @flow */
import Bit from '../bit';
import { fromBase64 } from '../utils';

export default class BitDependencies {
  bit: Bit;
  dependencies: Bit[];

  constructor(props: { bit: Bit, dependencies: Bit[] }) {
    this.bit = props.bit;
    this.dependencies = props.dependencies || [];
  }

  serialize(): Promise<string> {
    return Promise.all([
      this.bit.toTar(), 
      Promise.all(this.dependencies.map(bit => bit.toTar()))]
    )
    .then(([bit, dependencies]) => {
      return JSON.stringify({
        bit: bit.tarball.toString('ascii'),
        dependencies: dependencies.map(dep => dep.tarball.toString('ascii'))
      });
    });
  }

  static deserialize(str: string, scope: ?string): BitDependencies {
    const json = JSON.parse(fromBase64(str));
    return Promise.all([
      Bit.fromTar({ tarball: new Buffer(json.bit, 'utf8'), scope }), 
      Promise.all(json.dependencies.map(dep => Bit.fromTar({ tarball: new Buffer(dep, 'utf8'), scope })))
    ])
    .then(([bit, dependencies]) => new BitDependencies({ bit, dependencies }));
  }

}
