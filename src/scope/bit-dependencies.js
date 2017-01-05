/** @flow */
import Bit from '../bit';

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
        bit: bit.toString(),
        dependencies: dependencies.toString
      });
    });
  }
}
