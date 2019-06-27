// @flow
import R from 'ramda';
import path from 'path';
import semver from 'semver';
import Capsule from '../../components/core/capsule';
import createCapsule from './capsule-factory';
import Consumer from '../consumer/consumer';
import { Scope, ComponentWithDependencies } from '../scope';
import { BitId } from '../bit-id';
import ManyComponentsWriter from '../consumer/component-ops/many-components-writer';
import logger from '../logger/logger';
import loadFlattenedDependencies from '../consumer/component-ops/load-flattened-dependencies';

import PackageJsonFile from '../consumer/component/package-json-file';
import type Component from '../consumer/component/consumer-component';
import { convertToValidPathForPackageManager } from '../consumer/component/package-json-utils';
import componentIdToPackageName from '../utils/bit/component-id-to-package-name';
import { ACCEPTABLE_NPM_VERSIONS } from '../constants';

export default class Isolator {
  capsule: Capsule;
  consumer: ?Consumer;
  scope: Scope;
  constructor(capsule: Capsule, scope: Scope, consumer?: ?Consumer) {
    this.capsule = capsule;
    this.scope = scope;
    this.consumer = consumer;
  }

  static async getInstance(containerType: string = 'fs', scope: Scope, consumer?: ?Consumer, dir?: string) {
    logger.debug(`Isolator.getInstance, creating a capsule with an ${containerType} container`);
    const capsule = await createCapsule(containerType, dir);
    return new Isolator(capsule, scope, consumer);
  }

  async isolate(componentId: BitId, opts: Object): Promise<ComponentWithDependencies> {
    const componentWithDependencies = await this._loadComponent(componentId);
    const writeToPath = opts.writeToPath;
    const concreteOpts = {
      // consumer: this.consumer,
      componentsWithDependencies: [componentWithDependencies],
      writeToPath,
      override: opts.override,
      writePackageJson: !opts.noPackageJson,
      writeConfig: opts.conf,
      writeBitDependencies: opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      saveDependenciesAsComponents: opts.saveDependenciesAsComponents !== false,
      writeDists: opts.dist,
      installNpmPackages: !!opts.installPackages, // convert to boolean
      installPeerDependencies: !!opts.installPackages, // convert to boolean
      addToRootPackageJson: false,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult,
      isolated: true,
      capsule: this.capsule
    };
    // $FlowFixMe
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    logger.debug('ManyComponentsWriter, writeAllToIsolatedCapsule');
    await manyComponentsWriter._populateComponentsFilesToWrite();
    await manyComponentsWriter._populateComponentsDependenciesToWrite();
    await this._persistComponentsDataToCapsule([componentWithDependencies]);
    await this._addComponentsToRoot(
      componentWithDependencies.component.writtenPath,
      componentWithDependencies.allDependencies
    );
    logger.debug('ManyComponentsWriter, install packages on capsule');
    await this._installPackages(componentWithDependencies.component.writtenPath);
    const links = await manyComponentsWriter._getAllLinks();
    await links.persistAllToCapsule(this.capsule);
    return componentWithDependencies;
  }

  /**
   * To write a component into an isolated environment, we need not only its dependencies, but
   * also the dependencies of its dependencies and so on.
   * When loading a component from the model, it's easy to get them all from the
   * flattenedDependencies. However, when loading from the consumer, we have only the dependencies
   * loaded, not the flattened. To get the flattened, we have to load the dependencies and each one
   * of the dependency we need to load its dependencies as well until we got them all.
   */
  async _loadComponent(id: BitId): Promise<ComponentWithDependencies> {
    if (this.consumer) {
      return this._loadComponentFromConsumer(id);
    }
    throw new Error('loading components from scope is not implemented yet');
  }

  async _loadComponentFromConsumer(id: BitId): Promise<ComponentWithDependencies> {
    const consumer = this.consumer;
    if (!consumer) throw new Error('missing consumer');
    const component = await consumer.loadComponent(id);
    return loadFlattenedDependencies(consumer, component);
  }

  async _persistComponentsDataToCapsule(componentsWithDependencies: ComponentWithDependencies[]) {
    const persistP = componentsWithDependencies.map((componentWithDeps) => {
      const allComponents = [componentWithDeps.component, ...componentWithDeps.allDependencies];
      return allComponents.map((component) => {
        return component.dataToPersist ? component.dataToPersist.persistAllToCapsule(this.capsule) : Promise.resolve();
      });
    });
    return Promise.all(R.flatten(persistP));
  }

  async _addComponentsToRoot(rootDir: string, components: Component[]): Promise<void> {
    const capsulePath = this.capsule.container.getPath();
    // the capsulePath hack only works for the fs-capsule
    // for other capsule types, we would need to do this
    // (and other things) inside the capsule itself
    // rather than fetching its folder and using it
    const rootPathInCapsule = path.join(capsulePath, rootDir);
    const componentsToAdd = components.reduce((acc, component) => {
      // $FlowFixMe - writtenPath is defined
      const componentPathInCapsule = path.join(capsulePath, component.writtenPath);
      const relativeDepLocation = path.relative(rootPathInCapsule, componentPathInCapsule);
      const locationAsUnixFormat = convertToValidPathForPackageManager(relativeDepLocation);
      const packageName = componentIdToPackageName(component.id, component.bindingPrefix);
      acc[packageName] = locationAsUnixFormat;
      return acc;
    }, {});
    if (R.isEmpty(componentsToAdd)) return;
    const packageJsonFile = await PackageJsonFile.load(rootPathInCapsule);
    packageJsonFile.addDependencies(componentsToAdd);
    await packageJsonFile.write();
  }

  async _getNpmVersion() {
    const execResults = await this.capsule.exec('npm --version');
    const versionString = await new Promise((resolve, reject) => {
      let version = '';
      execResults.stdout.on('data', (data: string) => {
        version += data;
      });
      execResults.stdout.on('error', (error: string) => {
        return reject(error);
      });
      // @ts-ignore
      execResults.on('close', () => {
        return resolve(version);
      });
    });
    const validVersion = semver.coerce(versionString);
    return validVersion ? validVersion.raw : null;
  }

  async _installPackages(directory: string) {
    const npmVersion = await this._getNpmVersion();
    if (!npmVersion) {
      return Promise.reject(new Error('Failed to isolate component: unable to run npm'));
    }
    if (!semver.satisfies(npmVersion, ACCEPTABLE_NPM_VERSIONS)) {
      return Promise.reject(
        new Error(
          `Failed to isolate component: found an old version of npm (${npmVersion}). ` +
            `To get rid of this error, please upgrade to npm ${ACCEPTABLE_NPM_VERSIONS}`
        )
      );
    }
    const execResults = await this.capsule.exec('npm install', { cwd: directory });
    let output = '';
    return new Promise((resolve, reject) => {
      execResults.stdout.on('data', (data: string) => {
        output += data;
      });
      execResults.stdout.on('error', (error: string) => {
        return reject(error);
      });
      // @ts-ignore
      execResults.on('close', () => {
        return resolve(output);
      });
    });
  }
}
