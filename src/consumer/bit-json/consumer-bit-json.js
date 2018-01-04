/** @flow */
import fs from 'fs';
import R from 'ramda';
import path from 'path';
import AbstractBitJson from './abstract-bit-json';
import { BitJsonNotFound, BitJsonAlreadyExists, InvalidBitJson } from './exceptions';
import { BIT_JSON, DEFAULT_DIR_STRUCTURE, DEFAULT_DIR_DEPENDENCIES_STRUCTURE } from '../../constants';

function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export default class ConsumerBitJson extends AbstractBitJson {
  distTarget: ?string; // path where to store build artifacts
  // path to remove while storing build artifacts. If, for example the code is in 'src' directory, and the component
  // is-string is in src/components/is-string, the dists files will be in dists/component/is-string (without the 'src')
  distEntry: ?string;
  componentsDefaultDirectory: string;
  dependenciesDirectory: string;
  saveDependenciesAsComponents: boolean; // save hub dependencies as bit components rather than npm packages

  constructor({
    impl,
    spec,
    compiler,
    tester,
    dependencies,
    saveDependenciesAsComponents,
    lang,
    distTarget,
    distEntry,
    componentsDefaultDirectory,
    dependenciesDirectory,
    bindingPrefix,
    extensions
  }) {
    super({ impl, spec, compiler, tester, dependencies, lang, bindingPrefix, extensions });
    this.distTarget = distTarget;
    this.distEntry = distEntry;
    this.componentsDefaultDirectory = componentsDefaultDirectory || DEFAULT_DIR_STRUCTURE;
    this.dependenciesDirectory = dependenciesDirectory || DEFAULT_DIR_DEPENDENCIES_STRUCTURE;
    this.saveDependenciesAsComponents = saveDependenciesAsComponents || false;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const consumerObject = R.merge(superObject, {
      componentsDefaultDirectory: this.componentsDefaultDirectory,
      dependenciesDirectory: this.dependenciesDirectory,
      saveDependenciesAsComponents: this.saveDependenciesAsComponents
    });
    if (this.distEntry || this.distTarget) {
      const dist = {};
      if (this.distEntry) dist.entry = this.distEntry;
      if (this.distTarget) dist.target = this.distTarget;
      return R.merge(consumerObject, { dist });
    }
    return consumerObject;
  }

  write({ bitDir, override = true }: { bitDir: string, override?: boolean }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitDir)) {
        throw new BitJsonAlreadyExists();
      }

      const respond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(composePath(bitDir), this.toJson(), respond);
    });
  }

  static create(): ConsumerBitJson {
    return new ConsumerBitJson({});
  }

  static ensure(dirPath): Promise<ConsumerBitJson> {
    return new Promise((resolve) => {
      return this.load(dirPath)
        .then(resolve)
        .catch(() => resolve(this.create()));
    });
  }

  static fromPlainObject(object: Object) {
    const {
      sources,
      env,
      dependencies,
      lang,
      componentsDefaultDirectory,
      dependenciesDirectory,
      dist,
      bindingPrefix,
      extensions,
      saveDependenciesAsComponents
    } = object;

    return new ConsumerBitJson({
      impl: R.propOr(undefined, 'impl', sources),
      spec: R.propOr(undefined, 'spec', sources),
      compiler: R.propOr(undefined, 'compiler', env),
      tester: R.propOr(undefined, 'tester', env),
      lang,
      bindingPrefix,
      extensions,
      dependencies,
      saveDependenciesAsComponents,
      componentsDefaultDirectory,
      dependenciesDirectory,
      distTarget: R.propOr(undefined, 'target', dist),
      distEntry: R.propOr(undefined, 'entry', dist)
    });
  }

  static load(dirPath: string): Promise<ConsumerBitJson> {
    return new Promise((resolve, reject) => {
      if (!hasExisting(dirPath)) return reject(new BitJsonNotFound());
      return fs.readFile(composePath(dirPath), (err, data) => {
        if (err) return reject(err);
        try {
          const file = JSON.parse(data.toString('utf8'));
          return resolve(this.fromPlainObject(file));
        } catch (e) {
          return reject(new InvalidBitJson(e));
        }
      });
    });
  }
}
