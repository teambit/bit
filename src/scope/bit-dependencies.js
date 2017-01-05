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
        bit: bit.tarball.toString('base64'),
        dependencies: dependencies.map(dep => dep.tarball.toString('base64'))
      });
    });
  }

  static deserialize(str: string): BitDependencies {
    const json = JSON.parse(fromBase64(str));
    return new BitDependencies({
      bit: Bit.fromTar(fromBase64(json.bit)),
      dependencies: json.dependencies.map(Bit.fromTar(fromBase64(json.bit)))
    });
  }

}
