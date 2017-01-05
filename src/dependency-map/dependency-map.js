const R = require('ramda');
const parseFullId = require('../bit-id/parse-bit-full-id');
const { ID_DELIMITER } = require('../constants');

export class Dependency {
  constructor({ scope, box, name, version }) {
    this.scope = scope;
    this.box = box;
    this.name = name;
    this.version = version;
  }

  getScope() {
    return this.scope;
  }

  getBox() {
    return this.box;
  }

  getName() {
    return this.name;
  }

  getVersion() {
    return this.version;
  }

  static load(version, id) {
    return new Dependency(parseFullId(id, version));
  }
}

export default class DependencyMap {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  getDependencies() {
    return this.dependencies;
  }

  static load(rawDependencies) {
    const dependencies =
      R.mergeAll(
        R.map(
          dep => R.objOf(`${dep.box}${ID_DELIMITER}${dep.name}`, dep),
          R.values(R.mapObjIndexed(Dependency.load, rawDependencies)),
        ),
      );

    return new DependencyMap(dependencies);
  }
}

module.exports = DependencyMap;
