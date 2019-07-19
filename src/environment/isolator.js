// @flow
import R from 'ramda';
import path from 'path';
import semver from 'semver';
import pMapSeries from 'p-map-series';
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
import { ACCEPTABLE_NPM_VERSIONS, DEFAULT_PACKAGE_MANAGER } from '../constants';
import npmClient from '../npm-client';
import { topologicalSortComponentDependencies } from '../scope/graph/components-graph';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import BitMap from '../consumer/bit-map';
import { getManipulateDirForComponentWithDependencies } from '../consumer/component-ops/manipulate-dir';

export default class Isolator {
  capsule: Capsule;
  consumer: ?Consumer;
  scope: Scope;
  capsuleBitMap: BitMap;
  capsulePackageJson: PackageJsonFile; // this is the same packageJson of the main component as it located on the root
  componentWithDependencies: ComponentWithDependencies;
  constructor(capsule: Capsule, scope: Scope, consumer?: ?Consumer) {
    this.capsule = capsule;
    this.scope = scope;
    this.consumer = consumer;
  }

  static async getInstance(containerType: string = 'fs', scope: Scope, consumer?: ?Consumer, dir?: string) {
    logger.debug(`Isolator.getInstance, creating a capsule with an ${containerType} container, dir ${dir || 'N/A'}`);
    const capsule = await createCapsule(containerType, dir);
    return new Isolator(capsule, scope, consumer);
  }

  async isolate(componentId: BitId, opts: Object): Promise<ComponentWithDependencies> {
    const componentWithDependencies: ComponentWithDependencies = await this._loadComponent(componentId);
    if (opts.shouldBuildDependencies) {
      topologicalSortComponentDependencies(componentWithDependencies);
      await pMapSeries(componentWithDependencies.dependencies.reverse(), async (dep: Component) => {
        if (!dep.dists || dep.dists.isEmpty()) {
          await dep.build({ scope: this.scope, consumer: this.consumer });
          dep.dists.stripOriginallySharedDir(dep.originallySharedDir);
        }
      });
    }
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
    this.componentWithDependencies = componentWithDependencies;
    // $FlowFixMe
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    logger.debug('ManyComponentsWriter, writeAllToIsolatedCapsule');
    this._manipulateDir();
    await manyComponentsWriter._populateComponentsFilesToWrite();
    await manyComponentsWriter._populateComponentsDependenciesToWrite();
    await this._persistComponentsDataToCapsule();
    // $FlowFixMe
    this.capsulePackageJson = componentWithDependencies.component.packageJsonFile;
    // $FlowFixMe
    const componentRootDir: string = componentWithDependencies.component.writtenPath;
    await this._addComponentsToRoot(componentRootDir);
    logger.debug('ManyComponentsWriter, install packages on capsule');
    await this._installWithPeerOption(componentRootDir);
    const links = await manyComponentsWriter._getAllLinks();
    await links.persistAllToCapsule(this.capsule);
    this.capsuleBitMap = manyComponentsWriter.bitMap;
    return componentWithDependencies;
  }

  _manipulateDir() {
    const allComponents = [this.componentWithDependencies.component, ...this.componentWithDependencies.allDependencies];
    const manipulateDirData = getManipulateDirForComponentWithDependencies(this.componentWithDependencies);
    allComponents.forEach((component) => {
      component.stripOriginallySharedDir(manipulateDirData);
    });
  }

  /**
   * To write a component into an isolated environment, we need not only its dependencies, but
   * also the dependencies of its dependencies and so on.
   * When loading a component from the model, it's easy to get them all from the
   * flattenedDependencies. However, when loading from the consumer, we have only the dependencies
   * loaded, not the flattened. To get the flattened, we have to load the dependencies and each one
   * of the dependency we need to load its dependencies as well until we got them all.
   * Also, we have to clone each component we load, because when writing them into the capsule, we
   * strip their shared-dir and we don't want these changed paths to affect the workspace
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
    const component = await consumer.loadComponentForCapsule(id);
    const forCapsule = true;
    return loadFlattenedDependencies(consumer, component, forCapsule);
  }

  async _persistComponentsDataToCapsule() {
    const dataToPersist = new DataToPersist();
    const allComponents = [this.componentWithDependencies.component, ...this.componentWithDependencies.allDependencies];
    allComponents.forEach(component => dataToPersist.merge(component.dataToPersist));
    await dataToPersist.persistAllToCapsule(this.capsule);
  }

  async _addComponentsToRoot(rootDir: string): Promise<void> {
    const capsulePath = this.capsule.container.getPath();
    // the capsulePath hack only works for the fs-capsule
    // for other capsule types, we would need to do this
    // (and other things) inside the capsule itself
    // rather than fetching its folder and using it
    const rootPathInCapsule = path.join(capsulePath, rootDir);
    const componentsToAdd = this.componentWithDependencies.allDependencies.reduce((acc, component) => {
      // $FlowFixMe - writtenPath is defined
      const componentPathInCapsule = path.join(capsulePath, component.writtenPath);
      const relativeDepLocation = path.relative(rootPathInCapsule, componentPathInCapsule);
      const locationAsUnixFormat = convertToValidPathForPackageManager(relativeDepLocation);
      const packageName = componentIdToPackageName(component.id, component.bindingPrefix);
      acc[packageName] = locationAsUnixFormat;
      return acc;
    }, {});
    if (R.isEmpty(componentsToAdd)) return;
    this.capsulePackageJson.addDependencies(componentsToAdd);
    await this._writeCapsulePackageJson();
  }

  async _writeCapsulePackageJson() {
    const dataToPersist = new DataToPersist();
    dataToPersist.addFile(this.capsulePackageJson.toVinylFile());
    dataToPersist.persistAllToCapsule(this.capsule);
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

  async _installPackages(directory: string, modules: string[] = []) {
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
    const args = ['install', ...modules, '--no-save'];
    const execResults = await this.capsule.exec(`npm ${args.join(' ')}`, { cwd: directory });
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

  /**
   * it must be done in this order. first, `npm install`, then, `npm list -j` shows the missing
   * peer dependencies, then, add these peerDependencies into devDependencies and run `npm install`
   * again. The reason for adding the missing peer into devDependencies is to not get them deleted
   * once `npm install` is running along the road.
   */
  async _installWithPeerOption(directory: string, installPeerDependencies: boolean = true) {
    await this._installPackages(directory);
    if (installPeerDependencies) {
      const peers = await this._getPeerDependencies(directory);
      if (!R.isEmpty(peers)) {
        this.capsulePackageJson.packageJsonObject.devDependencies = Object.assign(
          this.capsulePackageJson.packageJsonObject.devDependencies || {},
          peers
        );
        await this._writeCapsulePackageJson();
        await this._installPackages(directory);
      }
    }
  }

  async _getPeerDependencies(dir: string): Promise<Object> {
    const packageManager = DEFAULT_PACKAGE_MANAGER;
    let npmList;
    try {
      npmList = await this._getNpmListOutput(dir, packageManager);
    } catch (err) {
      logger.error(err);
      throw new Error(
        `failed running "${packageManager} list -j" to find the peer dependencies due to an error: ${err}`
      );
    }
    return npmClient.getPeerDepsFromNpmList(npmList, packageManager);
  }

  async _getNpmListOutput(dir: string, packageManager: string) {
    const args = [packageManager, 'list', '-j'];
    const execResults = await this.capsule.exec(args.join(' '), { cwd: dir });
    let output = '';
    let outputErr = '';
    return new Promise((resolve, reject) => {
      execResults.stdout.on('data', (data: string) => {
        output += data;
      });
      execResults.stdout.on('error', (error: string) => {
        outputErr += error;
      });
      // @ts-ignore
      execResults.on('close', () => {
        if (output) return resolve(output);
        if (outputErr && outputErr.startsWith('{')) return resolve(output); // it's probably a valid json with errors, that's fine, parse it.
        return reject(outputErr);
      });
    });
  }
}
