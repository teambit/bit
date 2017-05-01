/** @flow */
import os from 'os';
import { v4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import npmClient from '../npm-client';
import { mergeAll } from 'ramda';
import { loadScope } from '../scope';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { BitId } from '../bit-id';
import { Component } from '../consumer/component/consumer-component';
import { Consumer } from '../consumer';
import { BITS_DIRNAME } from '../constants';
import { init } from '../api/consumer';

const root = path.join(os.tmpdir(), 'bit');
const currentPath = process.cwd();

export default class Environment {
  path: string;
  component: Component;
  componentsDependencies: ConsumerComponent[] = [];

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
          this.component = component.component;
          return component;
        });
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

  importDependencies(): Promise<ConsumerComponent[]> {
    if (!this.component) return Promise.reject();
    return loadScope(currentPath).then((scope) => {
      // todo: (optimization) import() gets the dependencies data already
      const dependencies = this.component.dependencies || [];

      // TODO: for some reason the current versions of compiler/tester are not working.
      // It returns "invalid json" error.
      if (this.component.compilerId) {
        this.component.compilerId.version = 'latest';
        dependencies.push(this.component.compilerId);
      }
      if (this.component.testerId) {
        this.component.testerId.version = 'latest';
        dependencies.push(this.component.testerId);
      }
      return scope.getMany(dependencies).then((componentDependenciesArr) => {
        return this.writeToEnvironmentDir(componentDependenciesArr);
      }).then((componentsDependencies) => {
        this.componentsDependencies = componentsDependencies;
        return componentsDependencies;
      });
    });
  }

  mimicConsumer() {
    return init(this.path);
  }

  importByConsumer(id) {
    return Consumer.load(this.path).then((consumer) => {
      return consumer.import([id], true, true);
    });
  }

  installNpmPackages(): Promise<*> {
    if (!this.component) return Promise.reject();
    this.componentsDependencies.push(this.component);
    const deps = mergeAll(this.componentsDependencies
      .map(({ packageDependencies }) => packageDependencies));
    return npmClient.install(deps, { cwd: this.path });
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
    return this.component ?
      this.component.miscFiles.map(misc => path.join(this.path, misc)) : undefined;
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
