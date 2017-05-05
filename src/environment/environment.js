/** @flow */
import { v4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import npmClient from '../npm-client';
import { Component } from '../consumer/component/consumer-component';
import { ISOLATED_ENV_ROOT } from '../constants';
import { modify, init } from '../api/consumer';
import { Consumer } from '../consumer';
import InlineId from '../consumer/bit-inline-id';

export default class Environment {
  path: string;
  consumer: Consumer;

  constructor() {
    this.path = path.join(ISOLATED_ENV_ROOT, v4());
  }

  getPath(): string {
    return this.path;
  }

  init(): Promise<Consumer> {
    if (this.consumer) return Promise.resolve(Consumer);
    fs.ensureDirSync(this.path);
    return init(this.path).then((consumer) => {
      this.consumer = consumer;
      return consumer;
    });
  }

  importComponent(id: string, verbose: boolean = false): Promise<Component> {
    return modify({ id, no_env: false, verbose, prefix: this.path });
  }

  importDependencies(component: Component): Promise<?Component[]> {
    if (!component.dependencies.length) return Promise.resolve();
    return this.consumer.scope.getMany(component.dependencies)
      .then(components => this.consumer.writeToComponentsDir(components));
  }

  bindFromDriver() {
    const driver = this.consumer.driver;
    if (driver) return driver.bind({ projectRoot: this.path });
    return Promise.resolve();
  }

  installNpmPackages(component: Component): Promise<*> {
    if (!component.packageDependencies) return Promise.resolve();
    const deps = component.packageDependencies;
    return npmClient.install(deps, { cwd: this.path });
  }

  getComponentPath(component: Component): string {
    const inlineId = new InlineId({ box: component.box, name: component.name });
    return inlineId.composeBitPath(this.consumer.getPath());
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
