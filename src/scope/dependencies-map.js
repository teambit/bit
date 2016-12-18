/** @flow */
import BitId from '../bit-id';

export default class DependencyMap extends Map<string, string[]> {

  constructor(dependencyTuples: [BitId, BitId[]][]) {
    super(dependencyTuples);
  }

  set(): DependencyMap {
    return this;
  }

  get() {

  }

  toObject() {

  }

  static load() {
    return new DependencyMap();
  }
}
