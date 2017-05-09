/** @flow */
import { v4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import npmClient from '../npm-client';
import { Scope } from '../scope';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { BitId } from '../bit-id';
import { Component } from '../consumer/component/consumer-component';
import { BITS_DIRNAME, ISOLATED_ENV_ROOT } from '../constants';
import { Driver } from '../driver';
import { mkdirp } from '../utils';

export default class Environment {
  path: string;
  scope: Scope;

  constructor(scope: Scope) {
    this.scope = scope;
    this.path = path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
  }

  create(): Promise<> {
    return new Promise((resolve, reject) => {
      mkdirp(this.path, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  importComponent(rawId: string): Promise<Component> {
    const bitId = BitId.parse(rawId, this.scope.name);
    return this.scope.get(bitId)
      .then((component) => {
        return this._writeToEnvironmentDir([component.component])
          .then((components) => {
            // TODO: this is probably incorrect as it doesn't contain the main component
            // and will be overridden by the next import.
            return components[0].writeBitJson(this.path).then(() => components[0]);
          });
      });
  }

  _writeToEnvironmentDir(components: Component[]): Promise<Component[]> {
    return Promise.all(components.map((component) => {
      const bitPath = this.getComponentPath(component);
      return component.write(bitPath, true);
    }));
  }

  importEnvironmentDependencies(component: Component): Promise<Component[]> {
    const ids = [component.compilerId, component.testerId];
    return this.scope.installEnvironment({ ids, verbose: false });
  }

  installNpmPackages(components: Component[]): Promise<*> {
    return Promise.all(components.map((component) => {
      if (R.isEmpty(component.packageDependencies)) return Promise.resolve();
      const componentPath = this.getComponentPath(component);
      return npmClient.install(component.packageDependencies, { cwd: componentPath });
    }));
  }

  bindFromDriver(component: Component) {
    const driver = Driver.load(component.lang).getDriver(false);
    if (driver) {
      return driver.bindSpecificComponents({ projectRoot: this.path, components: [component] });
    }
    return Promise.resolve();
  }

  /**
   * import a component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param rawId
   * @return {Promise.<Component>}
   */
  importE2E(rawId: string): Promise<Component> {
    return this.importComponent(rawId).then((component) => {
      return this.importEnvironmentDependencies(component).then(() => {
        return this.installNpmPackages([component])
          .then(() => this.bindFromDriver(component))
          .then(() => component);
      });
    });
  }

  getComponentPath(component: Component): string {
    return path.join(this.path, BITS_DIRNAME, component.id.toPath());
  }

  getPath(): string {
    return this.path;
  }

  getImplPath(component: Component): string {
    return path.join(this.getComponentPath(component), component.implFile);
  }

  getMiscFilesPaths(component: Component): string[] {
    const componentPath = this.getComponentPath(component);
    return component.miscFiles.map(misc => path.join(componentPath, misc));
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
