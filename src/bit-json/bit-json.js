// @flow
const R = require('ramda');
const fs = require('fs-extra');
const path = require('path');
const { BIT_JSON_NAME, VERSION_DELIMITER, ID_DELIMITER } = require('../constants');
const DependencyMap = require('../dependency-map');
const { InvalidBitJsonException, DuplicateComponentException } = require('../exceptions');

const composePath = p => path.join(p, BIT_JSON_NAME);

class BitJson {
  impl: ?string;
  spec: ?string;
  compiler: ?string;
  tester: ?string;
  dependencies: ?{[string]: string};
  packageDepndencies: ?{[string]: string};
  dependencyMap: ?DependencyMap;

  constructor(bitJson: Object) {
    this.impl = R.path(['sources', 'impl'], bitJson);
    this.spec = R.path(['sources', 'spec'], bitJson);
    this.compiler = R.path(['env', 'compiler'], bitJson);
    this.tester = R.path(['env', 'tester'], bitJson);
    this.dependencies = R.prop('dependencies', bitJson);
    this.packageDepndencies = R.prop('packageDepndencies', bitJson);
    this.dependencyMap = null;
  }

  getDependenciesArray(): string[] {
    return R.toPairs(this.dependencies)
    .map(([component, version]) => component + VERSION_DELIMITER + version.toString());
  }

  populateDependencyMap(consumerPath: string) {
    this.dependencyMap = DependencyMap.load(this.dependencies, consumerPath);
  }

  getDependencyMap(consumerPath: string) {
    if (!this.dependencyMap) {
      this.populateDependencyMap(consumerPath);
    }

    // $FlowFixMe
    return this.dependencyMap.getDependencies();
  }

  toObject() {
    return {
      sources: {
        impl: this.impl,
        spec: this.spec,
      },
      env: {
        compiler: this.compiler,
        tester: this.tester,
      },
      dependencies: this.dependencies,
      packageDepndencies: this.packageDepndencies,
    };
  }

  validateDependencies(): void {
    if (!this.dependencies || R.isEmpty(this.dependencies)) return;
    const dependenciesArr = Object.keys(this.dependencies);
    const boxesAndNames = dependenciesArr
      .map(dependency => dependency.substring(dependency.indexOf(ID_DELIMITER) + 1));
    if (R.uniq(boxesAndNames).length !== dependenciesArr.length) {
      throw new DuplicateComponentException();
    }
  }

  write(dir: string): Promise<?Error> {
    return new Promise((resolve, reject) =>
      fs.outputJson(
        composePath(dir),
        this.toObject(),
        (err) => {
          if (err) return reject(err);
          return resolve();
        }),
    );
  }

  static load(bitPath: string): ?BitJson {
    const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
    const composeBitJsonPath = p => path.join(p, BIT_JSON_NAME);
    const bitJsonPath = composeBitJsonPath(bitPath);

    try {
      return new BitJson(readJson(bitJsonPath));
    } catch (e) {
      if (e.code === 'ENOENT') return new BitJson({});
      throw new InvalidBitJsonException(e, bitJsonPath);
    }
  }
}

module.exports = BitJson;
