// @flow
import R from 'ramda';
import pMapSeries from 'p-map-series';
import Capsule from '../../components/core/capsule';
import createCapsule from './capsule-factory';
import Consumer from '../consumer/consumer';
import { Scope, ComponentWithDependencies } from '../scope';
import { BitId } from '../bit-id';
import ManyComponentsWriter from '../consumer/component-ops/many-components-writer';
import logger from '../logger/logger';
import loadFlattenedDependencies from '../consumer/component-ops/load-flattened-dependencies';
import { getAllRootDirectoriesFor } from '../npm-client/install-packages';
import npmClient from '../npm-client';
import { DEFAULT_PACKAGE_MANAGER } from '../constants';
import { topologicalSortComponentDependencies } from '../scope/graph/components-graph';
import DataToPersist from '../consumer/component/sources/data-to-persist';

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
    logger.debug(`Isolator.getInstance, creating a capsule with an ${containerType} container, dir ${dir || 'N/A'}`);
    const capsule = await createCapsule(containerType, dir);
    return new Isolator(capsule, scope, consumer);
  }

  async isolate(componentId: BitId, opts: Object): Promise<ComponentWithDependencies> {
    const componentWithDependencies = await this._loadComponent(componentId);
    if (opts.shouldBuildDependencies) {
      topologicalSortComponentDependencies(componentWithDependencies);
      await pMapSeries(componentWithDependencies.dependencies.reverse(), dep =>
        dep.build({ scope: this.scope, consumer: this.consumer })
      );
      componentWithDependencies.dependencies.forEach(dependency => (dependency.dists._distsPathsAreUpdated = false));
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
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    logger.debug('ManyComponentsWriter, writeAllToIsolatedCapsule');
    await manyComponentsWriter._populateComponentsFilesToWrite();
    await manyComponentsWriter._populateComponentsDependenciesToWrite();
    await this._persistComponentsDataToCapsule([componentWithDependencies]);
    logger.debug('ManyComponentsWriter, install packages on capsule');
    const allRootDirs = getAllRootDirectoriesFor([componentWithDependencies]);
    await this.installPackagesOnDirs(allRootDirs);
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
    const dataToPersist = new DataToPersist();
    componentsWithDependencies.forEach((componentWithDeps) => {
      const allComponents = [componentWithDeps.component, ...componentWithDeps.allDependencies];
      allComponents.forEach(component => dataToPersist.merge(component.dataToPersist));
    });
    await dataToPersist.persistAllToCapsule(this.capsule);
  }

  async installPackagesOnDirs(dirs: string[]) {
    return Promise.all(dirs.map(dir => this._installInOneDirectoryWithPeerOption(dir)));
  }

  async _installPackagesOnOneDirectory(directory: string, modules: string[] = []) {
    await this.capsule.exec('npm version 1.0.0', { cwd: directory });
    // *** ugly hack alert ***
    // we change the version to 1.0.0 here because for untagged
    // components, the version is set by bit to "latest" in the package.json
    // this is an invalid semver, and so npm refuses to install.
    // A better fix would be to change this behaviour of bit, but that is a much bigger
    // change. Until the capsule API is finalized, ths should do
    const args = ['install', ...modules];
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

  async _installInOneDirectoryWithPeerOption(directory: string, installPeerDependencies: boolean = true) {
    await this._installPackagesOnOneDirectory(directory);
    if (installPeerDependencies) {
      const peers = await this._getPeerDependencies(directory);
      if (!R.isEmpty(peers)) {
        await this._installPackagesOnOneDirectory(directory, peers);
      }
    }
  }

  async _getPeerDependencies(dir: string): Promise<string[]> {
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
