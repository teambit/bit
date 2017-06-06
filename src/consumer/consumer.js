/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs-extra';
import R from 'ramda';
import chalk from 'chalk';
import VersionDependencies from '../scope/version-dependencies';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import {
  ConsumerAlreadyExists,
  ConsumerNotFound,
  NothingToImport,
} from './exceptions';
import { Driver } from '../driver';
import DriverNotFound from '../driver/exceptions/driver-not-found';
import ConsumerBitJson from './bit-json/consumer-bit-json';
import { BitId, BitIds } from '../bit-id';
import Component from './component';
import {
  INLINE_BITS_DIRNAME,
  BITS_DIRNAME,
  BIT_HIDDEN_DIR,
 } from '../constants';
import { removeContainingDirIfEmpty } from '../utils';
import { Scope, ComponentDependencies } from '../scope';
import BitInlineId from './bit-inline-id';
import loader from '../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../cli/loader/loader-messages';
import { index } from '../search/indexer';


export type ConsumerProps = {
  projectPath: string,
  created?: boolean,
  bitJson: ConsumerBitJson,
  scope: Scope
};

export default class Consumer {
  projectPath: string;
  created: boolean;
  bitJson: ConsumerBitJson;
  scope: Scope;

  constructor({ projectPath, bitJson, scope, created = false }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson;
    this.created = created;
    this.scope = scope;
    this.warnForMissingDriver();
  }

  get testerId(): ?BitId {
    return BitId.parse(this.bitJson.testerId, this.scope);
  }

  get compilerId(): ?BitId {
    return BitId.parse(this.bitJson.compilerId, this.scope);
  }

  get driver(): Driver {
    return Driver.load(this.bitJson.lang);
  }

  warnForMissingDriver() {
    try {
      this.driver.getDriver(false);
    } catch (err) {
      if (err instanceof DriverNotFound) {
        console.log(chalk.yellow(`Warning: Bit is not be able to run the bind command. Please install bit-${err.lang} driver and run the bind command.`)); // eslint-disable-line
      }
    }
  }

  write(): Promise<Consumer> {
    return this.bitJson
      .write({ bitDir: this.projectPath })
      .then(() => this.scope.ensureDir())
      .then(() => this);
  }

  getInlineBitsPath(): string {
    return path.join(this.projectPath, INLINE_BITS_DIRNAME);
  }

  getComponentsPath(): string {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  getPath(): string {
    return this.projectPath;
  }

  getBitPathInComponentsDir(id: BitId): string {
    return path.join(this.getComponentsPath(), id.toPath());
  }

  loadComponent(id: BitInlineId): Promise<Component> {
    const bitDir = id.composeBitPath(this.getPath());
    return Component.loadFromInline(bitDir, this.bitJson);
  }

  exportAction(rawId: string, rawRemote: string) {
    // @TODO - move this method to api, not related to consumer
    const originalBitId = BitId.parse(rawId, this.scope.name);
    const newBitId = originalBitId.changeScope(this.scope.name);

    return this.scope.exportAction(originalBitId, rawRemote)
      .then(componentDependencies => this.writeToComponentsDir([componentDependencies])
        .then(() => this.removeFromComponents(newBitId)) // @HACKALERT
        .then(() => componentDependencies.component)
      );
  }

  import(rawIds: ?string[], verbose?: bool, withEnvironments: ?bool, cache?: bool = true):
  Promise<{ dependencies: ComponentDependencies[], envDependencies?: Component[] }> {
    const importAccordingToConsumerBitJson = () => {
      const dependencies = BitIds.fromObject(this.bitJson.dependencies);
      if (R.isNil(dependencies) || R.isEmpty(dependencies)) {
        if (!withEnvironments) {
          return Promise.reject(new NothingToImport());
        } else if (R.isNil(this.testerId) || R.isNil(this.compilerId)) {
          return Promise.reject(new NothingToImport());
        }
      }

      return this.scope.getMany(dependencies, cache)
        .then((componentDependenciesArr) => {
          return this.writeToComponentsDir(componentDependenciesArr)
          .then(() => {
            return withEnvironments ?
            this.scope.installEnvironment({
              ids: [this.testerId, this.compilerId],
              consumer: this,
              verbose
            })
            .then(envComponents => ({
              dependencies: componentDependenciesArr,
              envDependencies: envComponents,
            })) : { dependencies: componentDependenciesArr };
          });
        });
    };

    const importSpecificComponents = () => {
      // $FlowFixMe - we check if there are bitIds before we call this function
      const bitIds = rawIds.map(raw => BitId.parse(raw, this.scope.name));
      return this.scope.getMany(bitIds, cache)
      .then((componentDependenciesArr) => {
        return this.writeToComponentsDir(componentDependenciesArr)
          .then(() => ({ dependencies: componentDependenciesArr }));
      });
    };

    loader.start(BEFORE_IMPORT_ACTION);
    if (!rawIds || R.isEmpty(rawIds)) return importAccordingToConsumerBitJson();
    return importSpecificComponents();
  }

  importEnvironment(rawId: ?string, verbose?: bool) {
    if (!rawId) { throw new Error('you must specify bit id for importing'); } // @TODO - make a normal error message
    const bitId = BitId.parse(rawId, this.scope.name);
    return this.scope.installEnvironment({ ids: [bitId], consumer: this, verbose });
  }

  createBit({ id, withSpecs = false, withBitJson = false, force = false }: {
    id: BitInlineId, withSpecs: boolean, withBitJson: boolean, force: boolean
  }): Promise<Component> {
    const bitPath = id.composeBitPath(this.getPath());

    return Component.create({
      name: id.name,
      box: id.box,
      withSpecs,
      consumerBitJson: this.bitJson,
    }, this.scope).write(bitPath, withBitJson, force)
      .then(component => this.driver.runHook('onCreate', component, component));
  }

  removeFromInline(id: BitInlineId): Promise<any> {
    const componentDir = id.composeBitPath(this.getPath());
    return new Promise((resolve, reject) => {
      return fs.remove(componentDir, (err) => {
        if (err) return reject(err);
        return removeContainingDirIfEmpty(componentDir)
          .then(resolve);
      });
    });
  }

  removeFromComponents(id: BitId, currentVersionOnly: boolean = false): Promise<any> {
    const componentsDir = this.getComponentsPath();
    const componentDir = path.join(
      componentsDir,
      id.box,
      id.name,
      id.scope,
      currentVersionOnly ? id.version : ''
    );

    return new Promise((resolve, reject) => {
      return fs.remove(componentDir, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  bitDirForConsumerComponent(component: Component): string {
    const componentsDir = this.getComponentsPath();
    return path.join(
      componentsDir,
      component.box,
      component.name,
      component.scope,
      component.version.toString(),
    );
  }

  writeToComponentsDir(componentDependencies: VersionDependencies[]): Promise<Component[]> {
    const components = flattenDependencies(componentDependencies);

    return Promise.all(components.map((component) => {
      const bitPath = this.bitDirForConsumerComponent(component);
      return component.write(bitPath, true);
    }));
  }

  commit(id: BitInlineId, message: string, force: ?bool, verbose: ?bool) {
    const bitDir = id.composeBitPath(this.getPath());

    return this.loadComponent(id)
      .then(bit =>
        this.scope.put({ consumerComponent: bit, message, force, consumer: this, bitDir, verbose })
        .then(bits => this.writeToComponentsDir([bits]))
        .then(() => this.removeFromInline(id))
        .then(() => index(bit, this.scope.getPath()))
        .then(() => this.driver.runHook('onCommit', bit))
        .then(() => bit)
      );
  }

  runComponentSpecs(id: BitInlineId): Promise<?any> {
    return this.loadComponent(id)
      .then((component) => {
        return component.runSpecs({ scope: this.scope, consumer: this });
      });
  }

  runAllInlineSpecs() {
    return this.listInline().then((components) => {
      return Promise.all(components.map(component => component
        .runSpecs({ scope: this.scope, consumer: this })
        .then((result) => { return { specs: result, component }; })));
    });
  }

  listInline(): Promise<Component[]> {
    return new Promise((resolve, reject) =>
      glob(path.join('*', '*'), { cwd: this.getInlineBitsPath() }, (err, files) => {
        if (err) reject(err);

        const bitsP = files.map((bitRawId) => {
          const parsedId = BitInlineId.parse(bitRawId);
          return this.loadComponent(parsedId);
        });

        return Promise.all(bitsP)
        .then(resolve)
        .catch(reject);
      })
    );
  }

  includes({ inline, bitName }: { inline: ?boolean, bitName: string }): Promise<boolean> {
    const dirToCheck = inline ? this.getInlineBitsPath() : this.getComponentsPath();

    return new Promise((resolve) => {
      return fs.stat(path.join(dirToCheck, bitName), (err) => {
        if (err) return resolve(false);
        return resolve(true);
      });
    });
  }

  static create(projectPath: string = process.cwd()): Promise<Consumer> {
    if (pathHasConsumer(projectPath)) return Promise.reject(new ConsumerAlreadyExists());
    return this.ensure(projectPath);
  }

  static ensure(projectPath: string = process.cwd()): Promise<Consumer> {
    const scopeP = Scope.ensure(path.join(projectPath, BIT_HIDDEN_DIR));
    const bitJsonP = ConsumerBitJson.ensure(projectPath);

    return Promise.all([scopeP, bitJsonP])
    .then(([scope, bitJson]) => {
      return new Consumer({
        projectPath,
        created: true,
        scope,
        bitJson
      });
    });
  }

  static load(currentPath: string): Promise<Consumer> {
    return new Promise((resolve, reject) => {
      const projectPath = locateConsumer(currentPath);
      if (!projectPath) return reject(new ConsumerNotFound());
      const scopeP = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
      const bitJsonP = ConsumerBitJson.load(projectPath);
      return Promise.all([scopeP, bitJsonP])
      .then(([scope, bitJson]) =>
        resolve(
          new Consumer({
            projectPath,
            bitJson,
            scope
          })
        )
      );
    });
  }
}
