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
import loadFlattenedDependenciesForCapsule from '../consumer/component-ops/load-flattened-dependencies';
import PackageJsonFile from '../consumer/component/package-json-file';
import Component from '../consumer/component/consumer-component';
import { convertToValidPathForPackageManager } from '../consumer/component/package-json-utils';
import componentIdToPackageName from '../utils/bit/component-id-to-package-name';
import { ACCEPTABLE_NPM_VERSIONS, DEFAULT_PACKAGE_MANAGER } from '../constants';
import npmClient from '../npm-client';
import { topologicalSortComponentDependencies } from '../scope/graph/components-graph';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import BitMap from '../consumer/bit-map';
import { getManipulateDirForComponentWithDependencies } from '../consumer/component-ops/manipulate-dir';
import GeneralError from '../error/general-error';

export default class Isolator {
  capsule: Capsule;
  consumer: ?Consumer;
  scope: Scope;
  capsuleBitMap: BitMap;
  capsulePackageJson: PackageJsonFile; // this is the same packageJson of the main component as it located on the root
  componentWithDependencies: ComponentWithDependencies;
  manyComponentsWriter: ManyComponentsWriter;
  _npmVersionHasValidated: boolean = false;
  componentRootDir: string;
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
        } else {
          // needed for cases when a component is isolated as an individual first, then as a dependency.
          // because when it is isolated in the first time, the 'writeDistsFiles' is manually set to false
          dep.dists.writeDistsFiles = true;
        }
      });
    }
    const writeToPath = opts.writeToPath;
    const concreteOpts = {
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
    this.manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await this.writeComponentsAndDependencies();
    await this.installComponentPackages();
    await this.writeLinks();
    this.capsuleBitMap = this.manyComponentsWriter.bitMap;
    return componentWithDependencies;
  }

  async writeComponentsAndDependencies() {
    logger.debug('ManyComponentsWriter, writeAllToIsolatedCapsule');
    this._manipulateDir();
    await this.manyComponentsWriter._populateComponentsFilesToWrite();
    await this.manyComponentsWriter._populateComponentsDependenciesToWrite();
    await this._persistComponentsDataToCapsule();
  }

  async installComponentPackages() {
    // $FlowFixMe
    this.capsulePackageJson = this.componentWithDependencies.component.packageJsonFile;
    // $FlowFixMe
    this.componentRootDir = this.componentWithDependencies.component.writtenPath;
    await this._addComponentsToRoot();
    logger.debug('ManyComponentsWriter, install packages on capsule');
    await this._installWithPeerOption();
  }

  async writeLinks() {
    const links = await this.manyComponentsWriter._getAllLinks();
    await links.persistAllToCapsule(this.capsule);
  }

  /**
   * used by compilers that create capsule.
   * when installing packages on the capsule, the links generated on node_modules may be deleted
   */
  async writeLinksOnNodeModules() {
    const links = await this.manyComponentsWriter._getAllLinks();
    const nodeModulesLinks = links.filterByPath(filePath => filePath.startsWith('node_modules'));
    await nodeModulesLinks.persistAllToCapsule(this.capsule);
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
    return loadFlattenedDependenciesForCapsule(consumer, component);
  }

  async _persistComponentsDataToCapsule() {
    const dataToPersist = new DataToPersist();
    const allComponents = [this.componentWithDependencies.component, ...this.componentWithDependencies.allDependencies];
    allComponents.forEach(component => dataToPersist.merge(component.dataToPersist));
    await dataToPersist.persistAllToCapsule(this.capsule);
  }

  async _addComponentsToRoot(): Promise<void> {
    const capsulePath = this.capsule.container.getPath();
    // the capsulePath hack only works for the fs-capsule
    // for other capsule types, we would need to do this
    // (and other things) inside the capsule itself
    // rather than fetching its folder and using it
    const rootPathInCapsule = path.join(capsulePath, this.componentRootDir);
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
    const versionString = await this.capsuleExec('npm --version');
    const validVersion = semver.coerce(versionString);
    return validVersion ? validVersion.raw : null;
  }

  async installPackagesOnRoot(modules: string[] = []) {
    await this._throwForOldNpmVersion();
    const args = ['install', ...modules, '--no-save'];
    return this.capsuleExec(`npm ${args.join(' ')}`, { cwd: this.componentRootDir });
  }

  async _throwForOldNpmVersion() {
    if (this._npmVersionHasValidated) {
      return;
    }
    const npmVersion = await this._getNpmVersion();
    if (!npmVersion) {
      throw new Error('Failed to isolate component: unable to run npm');
    }
    if (!semver.satisfies(npmVersion, ACCEPTABLE_NPM_VERSIONS)) {
      throw new GeneralError(
        `Failed to isolate component: found an old version of npm (${npmVersion}). ` +
          `To get rid of this error, please upgrade to npm ${ACCEPTABLE_NPM_VERSIONS}`
      );
    }
    this._npmVersionHasValidated = true;
  }

  async capsuleExec(cmd: string, options?: ?Object): Promise<string> {
    const execResults = await this.capsule.exec(cmd, options);
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
  async _installWithPeerOption(installPeerDependencies: boolean = true) {
    await this.installPackagesOnRoot();
    if (installPeerDependencies) {
      const peers = await this._getPeerDependencies();
      if (!R.isEmpty(peers)) {
        this.capsulePackageJson.packageJsonObject.devDependencies = Object.assign(
          this.capsulePackageJson.packageJsonObject.devDependencies || {},
          peers
        );
        await this._writeCapsulePackageJson();
        await this.installPackagesOnRoot();
      }
    }
  }

  async _getPeerDependencies(): Promise<Object> {
    const packageManager = DEFAULT_PACKAGE_MANAGER;
    let npmList;
    try {
      npmList = await this._getNpmListOutput(packageManager);
    } catch (err) {
      logger.error(err);
      throw new Error(
        `failed running "${packageManager} list -j" to find the peer dependencies due to an error: ${err}`
      );
    }
    return npmClient.getPeerDepsFromNpmList(npmList, packageManager);
  }

  async _getNpmListOutput(packageManager: string): Promise<string> {
    const args = [packageManager, 'list', '-j'];
    try {
      return await this.capsuleExec(args.join(' '), { cwd: this.componentRootDir });
    } catch (err) {
      if (err && err.startsWith('{')) return err; // it's probably a valid json with errors, that's fine, parse it.
      throw err;
    }
  }
}
