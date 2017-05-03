/** @flow */
import { v4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import npmClient from '../npm-client';
import { Component } from '../consumer/component/consumer-component';
import { ISOLATED_ENV_ROOT } from '../constants';
import { importAction } from '../api/consumer';
import { Consumer } from '../consumer';

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
    return Consumer.ensure(this.path).then((consumer) => {
      this.consumer = consumer;
      return consumer;
    });
  }

  importComponent(id: string): Promise<Component> {
    return importAction({
      ids: [id],
      save: true,
      verbose: true,
      prefix: this.path,
    }).then(bits => bits.dependencies[0].component);
  }

  installDependencies(component: Component, verbose: boolean = false): Promise<*> {
    const testerId = component.testerId;
    const compilerId = component.compilerId;
    if (!testerId && !compilerId) return Promise.resolve(component);
    return this.consumer.scope.installEnvironment({
      ids: [testerId, compilerId],
      consumer: this.consumer,
      verbose
    });
  }

  installNpmPackages(component: Component): Promise<*> {
    if (!component.packageDependencies) return Promise.resolve(component);
    const deps = component.packageDependencies;
    return npmClient.install(deps, { cwd: this.path });
  }

  getComponentPath(component: Component): string {
    return this.consumer.bitDirForConsumerComponent(component);
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
