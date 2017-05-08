/** @flow */
import { v4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import npmClient from '../npm-client';
import { loadScope, Scope } from '../scope';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { BitId } from '../bit-id';
import { Component } from '../consumer/component/consumer-component';
import { BITS_DIRNAME, ISOLATED_ENV_ROOT } from '../constants';
import { Driver } from '../driver';

export default class Environment {
  path: string;
  scopePath: string;
  scope: Scope;

  constructor(scopePath: string = process.cwd()) {
    this.scopePath = scopePath;
    this.path = path.join(scopePath, ISOLATED_ENV_ROOT, v4());
  }

  init(): Promise<Scope> {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return scope;
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

  importDependencies(component: Component): Promise<Component[]> {
    // TODO: (optimization) importComponent() gets the dependencies data already
    const dependencies = component.dependencies || [];

    if (component.compilerId) {
      dependencies.push(component.compilerId);
    }
    if (component.testerId) {
      dependencies.push(component.testerId);
    }
    return this.scope.getMany(dependencies).then((componentDependenciesArr) => {
      const components = flattenDependencies(componentDependenciesArr);
      return this._writeToEnvironmentDir(components);
    });
  }

  installNpmPackages(components): Promise<*> {
    return Promise.all(components.map((component) => {
      if (R.isEmpty(component.packageDependencies)) return Promise.resolve();
      const componentPath = this.getComponentPath(component);
      return npmClient.install(component.packageDependencies, { cwd: componentPath });
    }));
  }

  bindFromDriver() {
    // TODO: Load the bit.json and pass the lang to the Driver.load().
    const driver = Driver.load().getDriver(false);
    if (driver) return driver.bind({ projectRoot: this.path });
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
      return this.importDependencies(component).then((dependencies) => {
        const components = dependencies.concat(component);
        return this.installNpmPackages(components)
          .then(() => this.bindFromDriver())
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
