const R = require('ramda');
const parseBitFullId = require('../bit-id/parse-bit-full-id');
const findLatestVersion = require('../bit-id/find-latest-version');
const { ID_DELIMITER, LATEST_VERSION } = require('../constants');
const { InvalidVersionException } = require('../exceptions');

export class Dependency {
  constructor({ scope, box, name, version }, consumerPath) {
    this.consumerPath = consumerPath;
    this.scope = scope;
    this.box = box;
    this.name = name;
    this.versionString = version;
    this.realVersion = null;
  }

  get id() {
    return `${this.scope}/${this.box}/${this.name}` // eslint-disable-line
    + (this.versionString ? `::${this.versionString}` : '');
  }

  get version() {
    if (this.realVersion) return this.realVersion;
    if (!this.versionString || this.versionString === LATEST_VERSION) {
      this.realVersion = findLatestVersion({
        scope: this.scope,
        box: this.box,
        name: this.name,
        consumerPath: this.consumerPath,
      });

      return this.realVersion;
    }

    if (!R.is(String, this.versionString) || isNaN(parseInt(this.versionString, 10))) {
      throw new InvalidVersionException(this.id);
    }

    this.realVersion = this.versionString;
    return this.realVersion;
  }

  static load(id, version, consumerPath) {
    return new Dependency(parseBitFullId({ id, version }), consumerPath);
  }
}

export default class DependencyMap {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  getDependencies() {
    return this.dependencies;
  }

  static load(rawDependencies, consumerPath) {
    const dependencies =
      R.mergeAll(
        R.map(
          dep => R.objOf(`${dep.box}${ID_DELIMITER}${dep.name}`, dep),
          R.values(
            R.mapObjIndexed((version, id) =>
              Dependency.load(id, version, consumerPath), rawDependencies),
          ),
        ),
      );

    return new DependencyMap(dependencies);
  }
}

module.exports = DependencyMap;
