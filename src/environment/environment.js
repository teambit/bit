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
import logger from '../logger/logger';

export default class Environment {
  path: string;
  scope: Scope;

  constructor(scope: Scope) {
    this.scope = scope;
    this.path = path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    logger.debug(`creating a new isolated environment at ${this.path}`);
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
    const bitId = BitId.parse(rawId);
    return this.scope.get(bitId)
      .then((component) => {
        return this._writeToEnvironmentDir([component.component])
          .then(components => components[0]);
      });
  }

  _writeToEnvironmentDir(components: Component[]): Promise<Component[]> {
    return Promise.all(components.map((component) => {
      const bitPath = this.getComponentPath(component);
      return component.write({ bitDir: bitPath });
    }));
  }

  importDependencies(component: Component): Promise<Component[]> {
    if (!component.dependencies || !component.dependencies.length) return Promise.resolve([]);
    const depsIds = component.dependencies.map(dep => dep.id);
    return this.scope.getMany(depsIds).then((componentDependenciesArr) => {
      const components = flattenDependencies(componentDependenciesArr);
      return this._writeToEnvironmentDir(components);
    });
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
      return driver.bind({ projectRoot: this.path });
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
      return this.importDependencies(component).then((dependencies) => {
        const components = dependencies.concat(component);
        return this.installNpmPackages(components)
          .then(() => this.bindFromDriver(component))
          .then(() => component);
      });
    });
  }

  getComponentPath(component: Component): string {
    return path.join(this.path, BITS_DIRNAME, component.id.toFullPath());
  }

  getPath(): string {
    return this.path;
  }

  destroy(): Promise<*> {
    return new Promise((resolve, reject) => {
      fs.remove(this.path, (err) => {
        if (err) return reject(err);
        logger.debug(`destroying the isolated environment at ${this.path}`);
        return resolve();
      });
    });
  }
}
