/** @flow */
/* eslint-disable */
import os from 'os';
import { v4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import npmInstall from '../utils/npm';
import { loadScope } from '../scope';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { BitId } from '../bit-id';
import { Component } from '../consumer/component/consumer-component'
import { BITS_DIRNAME } from '../constants';
import { mergeAll } from 'ramda';

const root = path.join(os.tmpdir(), 'bit');
const currentPath = process.cwd();

export default class Environment {
  path: string;
  component: Component;

  constructor() {
    this.path = path.join(root, v4());
    console.log(this.path);
  }

  init(): Promise<*> {
    return new Promise((resolve, reject) => {
      fs.ensureDir(this.path, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  importById(rawId: string): Promise<Object> {
    // loadScope works for local scope and remote scope
    return loadScope(currentPath).then((scope) => {
      const bitId = BitId.parse(rawId, scope.name);
      return scope.get(bitId)
        .then((component) => {
          component.component.write(this.path, true, true);
          this.component = component;
          return component;
        })
    });
  }

  writeToEnvironmentDir(componentDependencies: versionDependencies[]): Promise<Component[]> {
    const componentsDir = path.join(this.path, BITS_DIRNAME);
    const components = flattenDependencies(componentDependencies);

    const bitDirForEnvironmentImport = (component: Component) => {
      return path.join(
        componentsDir,
        component.box,
        component.name,
        component.scope,
        component.version.toString(),
      );
    };

    return Promise.all(components.map((component) => {
      const bitPath = bitDirForEnvironmentImport(component);
      return component.write(bitPath, true);
    }));
  }

  importDependencies() {
    // TODO: install also current bit dependencies.
    if (!this.component) return Promise.reject();
    return loadScope(currentPath).then((scope) => {
      // TODO: currently it does not work with flow version 4. it gets invalid json.
      this.component.component.compilerId.version = 'latest';
      this.component.component.testerId.version = 'latest';
      const ids = [this.component.component.compilerId, this.component.component.testerId];
      return scope.getMany(ids).then((componentDependenciesArr) => {
        return this.writeToEnvironmentDir(componentDependenciesArr);
      });
    });
  }

  installNpmPackages(components: ConsumerComponent[]) {
    // components.push(this.component);
    // console.log('installNpmPackages', components);
    const deps = mergeAll(components.map(({ packageDependencies }) => packageDependencies));
    return npmInstall({ deps, dir: this.path, silent: false });
  }

  getPath() {
    return this.path;
  }

  getImplPath() {
    return this.component ? path.join(this.path, this.component.implFile) : undefined;
  }

  getDist() {
    return this.component ? this.component.dist : undefined;
  }

  getMiscFilesPaths() {
    return this.component ? this.component.miscFiles.map(misc => path.join(this.path, misc)) : undefined;
  }

  destroy(): Promise<*> {
    return new Promise((resolve, reject) => {
      fs.remove(this.path, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }
}
