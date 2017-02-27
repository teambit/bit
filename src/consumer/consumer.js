/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs-extra';
import R from 'ramda';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound, NothingToImport } from './exceptions';
import ConsumerBitJson from './bit-json/consumer-bit-json';
import { BitId, BitIds } from '../bit-id';
import Component from './component';
import {
  INLINE_BITS_DIRNAME,
  BITS_DIRNAME,
  BIT_HIDDEN_DIR,
 } from '../constants';
import { flatten, removeContainingDirIfEmpty } from '../utils';
import { Scope, ComponentDependencies } from '../scope';
import BitInlineId from './bit-inline-id';
import type { Results } from '../specs-runner/specs-runner';
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
  }

  get testerId(): ?BitId {
    return BitId.parse(this.bitJson.testerId, this.scope);
  }

  get compilerId(): ?BitId {
    return BitId.parse(this.bitJson.compilerId, this.scope);
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

  loadComponent(id: BitInlineId): Promise<Component> {
    const bitDir = id.composeBitPath(this.getPath());
    return Component.loadFromInline(bitDir, this.bitJson);
  }

  exportAction(rawId: string, rawRemote: string) { 
    // @TODO - move this method to api, not related to consumer
    const bitId = BitId.parse(rawId, this.scope.name);
    
    return this.scope.exportAction(bitId, rawRemote)
      .then(componentDependencies => this.writeToComponentsDir([componentDependencies])
        .then(() => this.removeFromComponents(bitId.changeScope(this.scope.name))) // @HACKALERT
        .then(() => componentDependencies.component)
      );
  }

  import(rawId: ?string, verbose?: ?bool, withEnvironments: ?bool):
  Promise<{ dependencies: Component[], envDependencies?: Component[] }> {
    const importAccordingToConsumerBitJson = () => {
      const dependencies = BitIds.fromObject(this.bitJson.dependencies);
      if (R.isNil(dependencies) || R.isEmpty(dependencies)) {
        if (!withEnvironments) {
          return Promise.reject(new NothingToImport());
        } else if (R.isNil(this.testerId) || R.isNil(this.compilerId)) {
          return Promise.reject(new NothingToImport());
        }
      } 
      
      return this.scope.getMany(dependencies)
        .then((components) => {
          return this.writeToComponentsDir(flatten(components))
          .then((depComponents) => {
            return withEnvironments ? 
            this.scope.installEnvironment({
              ids: [this.testerId, this.compilerId],
              consumer: this,
              verbose
            })
            .then(envComponents => ({ 
              dependencies: depComponents,
              envDependencies: envComponents,
            })) : { dependencies: depComponents };
          });
        });
    };

    const importSpecificComponent = () => {
      const bitId = BitId.parse(rawId, this.scope.name);
      return this.scope.get(bitId)
      .then(component =>
        this.writeToComponentsDir([component])
        .then(dependencies => ({ dependencies }))
      );
    };
    
    loader.start(BEFORE_IMPORT_ACTION);
    if (!rawId) return importAccordingToConsumerBitJson();
    return importSpecificComponent();
  }

  importEnvironment(rawId: ?string, verbose?: ?bool) {
    if (!rawId) { throw new Error('you must specify bit id for importing'); } // @TODO - make a normal error message
    const bitId = BitId.parse(rawId, this.scope.name);
    return this.scope.installEnvironment({ ids: [bitId], consumer: this, verbose });
  }

  createBit({ id, withSpecs = false, withBitJson = false }: {
    id: BitInlineId, withSpecs: boolean, withBitJson: boolean }): Promise<Component> {
    const inlineBitPath = id.composeBitPath(this.getPath());

    return Component.create({ 
      name: id.name,
      box: id.box,
      withSpecs,
      consumerBitJson: this.bitJson,
    }, this.scope).write(inlineBitPath, withBitJson);
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

  removeFromComponents(id: BitId): Promise<any> {
    // @TODO - also consider
    // @HACKALERT - also consider version when removing a directory from components
    
    const componentsDir = this.getComponentsPath();
    const componentDir = path.join(
      componentsDir,
      id.box,
      id.name,
      id.scope
    );

    return new Promise((resolve, reject) => {
      return fs.remove(componentDir, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  writeToComponentsDir(componentDependencies: ComponentDependencies[]): Promise<Component[]> {
    const componentsDir = this.getComponentsPath();
    const components = flattenDependencies(componentDependencies);

    const bitDirForConsumerImport = (component: Component) => {
      return path.join(
        componentsDir,
        component.box,
        component.name,
        component.scope,
        component.version.toString(),
      );
    };

    return Promise.all(components.map((component) => {
      const bitPath = bitDirForConsumerImport(component);
      return component.write(bitPath, true);
    }));
  }

  commit(id: BitInlineId, message: string, force: ?bool) {
    const bitDir = id.composeBitPath(this.getPath());

    return this.loadComponent(id)
      .then(bit =>
        this.scope.put({ consumerComponent: bit, message, force, consumer: this, bitDir })
        .then(bits => this.writeToComponentsDir([bits]))
        .then(() => this.removeFromInline(id))
        .then(() => index(bit, this.scope.getPath()))
        .then(() => bit)
      );
  }

  runComponentSpecs(id: BitInlineId): Promise<?Results> {
    return this.loadComponent(id)
      .then((component) => {
        return component.runSpecs({ scope: this.scope, consumer: this });
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
