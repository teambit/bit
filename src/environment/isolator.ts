import execa from 'execa';
import mapSeries from 'p-map-series';
import * as path from 'path';
import R from 'ramda';
import semver from 'semver';

import Capsule from '../../legacy-capsule/core/capsule';
import { BitId } from '../bit-id';
import loader from '../cli/loader';
import { ACCEPTABLE_NPM_VERSIONS } from '../constants';
import BitMap from '../consumer/bit-map';
import { FlattenedDependencyLoader } from '../consumer/component-ops/load-flattened-dependencies';
import { getManipulateDirForComponentWithDependencies } from '../consumer/component-ops/manipulate-dir';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../consumer/component-ops/many-components-writer';
import { throwForNonLegacy } from '../consumer/component/component-schema';
import Component from '../consumer/component/consumer-component';
import PackageJsonFile from '../consumer/component/package-json-file';
import { convertToValidPathForPackageManager } from '../consumer/component/package-json-utils';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import Consumer from '../consumer/consumer';
import GeneralError from '../error/general-error';
import logger from '../logger/logger';
import npmClient from '../npm-client';
import { PackageManagerResults } from '../npm-client/npm-client';
import { ComponentWithDependencies, Scope } from '../scope';
import { topologicalSortComponentDependencies } from '../scope/graph/components-graph';
import componentIdToPackageName from '../utils/bit/component-id-to-package-name';
import { PathOsBased } from '../utils/path';
import createCapsule from './capsule-factory';

export interface IsolateOptions {
  writeToPath?: PathOsBased; // Path to write the component to
  override?: boolean; // Override existing files in the folder
  writePackageJson?: boolean; // write the package.json
  writeConfig?: boolean; // Write bit.json file
  writeBitDependencies?: boolean; // Write bit dependencies as package dependencies in package.json
  createNpmLinkFiles?: boolean; // Fix the links to dependencies to be links to the package
  saveDependenciesAsComponents?: boolean; // import the dependencies as bit components instead of as npm packages
  writeDists?: boolean; // Write dist files
  shouldBuildDependencies?: boolean; // Build all depedencies before the isolation (used by tools like ts compiler)
  installNpmPackages?: boolean; // Install the package dependencies
  keepExistingCapsule?: boolean; // Do not delete the capsule after using it (useful for incremental builds)
  installPeerDependencies?: boolean; // Install the peer package dependencies
  installProdPackagesOnly?: boolean;
  verbose?: boolean; // Print more logs
  excludeRegistryPrefix?: boolean; // exclude the registry prefix from the component's name in the package.json
  silentPackageManagerResult?: boolean; // Print environment install result
}

export default class Isolator {
  capsule: Capsule;
  consumer?: Consumer;
  scope: Scope;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  capsuleBitMap: BitMap;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  capsulePackageJson: PackageJsonFile; // this is the same packageJson of the main component as it located on the root
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  componentWithDependencies: ComponentWithDependencies;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  manyComponentsWriter: ManyComponentsWriter;
  _npmVersionHasValidated = false;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  componentRootDir: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dir?: string;

  constructor(capsule: Capsule, scope: Scope, consumer?: Consumer, dir?: string) {
    this.capsule = capsule;
    this.scope = scope;
    this.consumer = consumer;
    this.dir = dir;
  }

  static async getInstance(containerType = 'fs', scope: Scope, consumer?: Consumer, dir?: string): Promise<Isolator> {
    logger.debug(`Isolator.getInstance, creating a capsule with an ${containerType} container, dir ${dir || 'N/A'}`);
    const capsule = await createCapsule(containerType, dir);
    return new Isolator(capsule, scope, consumer, dir);
  }

  async isolate(componentId: BitId, opts: IsolateOptions): Promise<ComponentWithDependencies> {
    const loaderPrefix = `isolating component - ${componentId.name}`;
    loader.setText(loaderPrefix);
    const componentWithDependencies: ComponentWithDependencies = await this._loadComponent(componentId);
    throwForNonLegacy(componentWithDependencies.component.isLegacy, 'evn/Isolator.isolate');
    if (opts.shouldBuildDependencies) {
      topologicalSortComponentDependencies(componentWithDependencies);
      await mapSeries(componentWithDependencies.dependencies.reverse(), async (dep: Component) => {
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
    // default should be true
    const installNpmPackages = typeof opts.installNpmPackages === 'undefined' ? true : opts.installNpmPackages;
    const concreteOpts: ManyComponentsWriterParams = {
      componentsWithDependencies: [componentWithDependencies],
      writeToPath,
      override: opts.override,
      writePackageJson: opts.writePackageJson,
      writeConfig: opts.writeConfig,
      ignoreBitDependencies: !opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      saveDependenciesAsComponents: opts.saveDependenciesAsComponents !== false,
      writeDists: opts.writeDists,
      installNpmPackages,
      installPeerDependencies: !!opts.installPeerDependencies, // convert to boolean
      addToRootPackageJson: false,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult,
      isolated: true,
      isLegacy: this.consumer?.isLegacy,
      applyPackageJsonTransformers: !this.consumer?.isLegacy,
    };
    this.componentWithDependencies = componentWithDependencies;
    this.manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await this.writeComponentsAndDependencies({ keepExistingCapsule: !!opts.keepExistingCapsule });
    await this.installComponentPackages({
      installNpmPackages,
      keepExistingCapsule: !!opts.keepExistingCapsule,
    });
    await this.writeLinks({ keepExistingCapsule: !!opts.keepExistingCapsule });
    this.capsuleBitMap = this.manyComponentsWriter.bitMap;
    return componentWithDependencies;
  }

  async writeComponentsAndDependencies(opts = { keepExistingCapsule: false }) {
    logger.debug('ManyComponentsWriter, writeAllToIsolatedCapsule');
    this._manipulateDir();

    await this.manyComponentsWriter._populateComponentsFilesToWrite();
    await this.manyComponentsWriter._populateComponentsDependenciesToWrite();
    await this._persistComponentsDataToCapsule({ keepExistingCapsule: !!opts.keepExistingCapsule });
  }

  async installComponentPackages(opts = { installNpmPackages: true, keepExistingCapsule: false }) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.capsulePackageJson = this.componentWithDependencies.component.packageJsonFile;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentRootDir = this.componentWithDependencies.component.writtenPath;
    await this._addComponentsToRoot({ keepExistingCapsule: !!opts.keepExistingCapsule });
    logger.debug('ManyComponentsWriter, install packages on capsule');
    if (opts.installNpmPackages) {
      await this._installWithPeerOption();
    }
  }

  async writeLinks(opts = { keepExistingCapsule: false }) {
    const links = await this.manyComponentsWriter._getAllLinks();
    // links is a DataToPersist instance
    await links.persistAllToCapsule(this.capsule, { keepExistingCapsule: !!opts.keepExistingCapsule });
  }

  /**
   * used by compilers that create capsule.
   * when installing packages on the capsule, the links generated on node_modules may be deleted
   */
  async writeLinksOnNodeModules() {
    const links = await this.manyComponentsWriter._getAllLinks();
    const nodeModulesLinks = links.filterByPath((filePath) => filePath.startsWith('node_modules'));
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
    const flattenedDependencyLoader = new FlattenedDependencyLoader(consumer);
    return flattenedDependencyLoader.load(component);
  }

  async _persistComponentsDataToCapsule(opts = { keepExistingCapsule: false }) {
    const dataToPersist = new DataToPersist();
    const allComponents = [this.componentWithDependencies.component, ...this.componentWithDependencies.allDependencies];
    allComponents.forEach((component) => dataToPersist.merge(component.dataToPersist));
    await dataToPersist.persistAllToCapsule(this.capsule, { keepExistingCapsule: !!opts.keepExistingCapsule });
  }

  // amit - here we need to add a map of all the capsules so we can link the components
  async _addComponentsToRoot(opts = { keepExistingCapsule: false }): Promise<void> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const capsulePath = this.capsule.container.getPath();
    // the capsulePath hack only works for the fs-capsule
    // for other capsule types, we would need to do this
    // (and other things) inside the capsule itself
    // rather than fetching its folder and using it
    const rootPathInCapsule = path.join(capsulePath, this.componentRootDir);
    const componentsToAdd = this.componentWithDependencies.allDependencies.reduce((acc, component) => {
      // $FlowFixMe - writtenPath is defined
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const componentPathInCapsule = path.join(capsulePath, component.writtenPath);
      const relativeDepLocation = path.relative(rootPathInCapsule, componentPathInCapsule);
      const locationAsUnixFormat = convertToValidPathForPackageManager(relativeDepLocation);
      const packageName = componentIdToPackageName(component);
      acc[packageName] = locationAsUnixFormat;
      return acc;
    }, {});
    if (R.isEmpty(componentsToAdd)) return;
    this.capsulePackageJson.addDependencies(componentsToAdd);
    await this._writeCapsulePackageJson({ keepExistingCapsule: !!opts.keepExistingCapsule });
  }

  async _writeCapsulePackageJson(opts = { keepExistingCapsule: false }) {
    const dataToPersist = new DataToPersist();
    dataToPersist.addFile(this.capsulePackageJson.toVinylFile());
    return dataToPersist.persistAllToCapsule(this.capsule, { keepExistingCapsule: !!opts.keepExistingCapsule });
  }

  async _getNpmVersion() {
    const { stdout: versionString } = await this.capsuleExecUsingExeca('npm', ['--version']);
    const validVersion = semver.coerce(versionString);
    return validVersion ? validVersion.raw : null;
  }

  async installPackagesOnRoot(modules: string[] = []) {
    await this._throwForOldNpmVersion();
    const args = ['install', ...modules, '--no-save'];
    return this.capsuleExecUsingExeca('npm', args, this.componentRootDir);
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

  async capsuleExecUsingExeca(pkgManager: string, args: string[], dir = ''): Promise<PackageManagerResults> {
    // @ts-ignore fs-container has path.
    const capsuleDir = this.capsule.container.path;
    const cwd = path.join(capsuleDir, dir);
    return execa(pkgManager, args, { cwd });
  }

  async capsuleExec(cmd: string, options?: Record<string, any> | null | undefined): Promise<PackageManagerResults> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const execResults = await this.capsule.exec({ command: cmd.split(' '), options });
    let stdout = '';
    let stderr = '';
    return new Promise((resolve, reject) => {
      execResults.stdout.on('data', (data: string) => {
        stdout += data;
      });
      execResults.stdout.on('error', (error: string) => {
        return reject(error);
      });
      // @ts-ignore
      execResults.on('close', () => {
        return resolve({ stdout, stderr });
      });
      execResults.stderr.on('error', (error: string) => {
        return reject(error);
      });
      execResults.stderr.on('data', (data: string) => {
        stderr += data;
      });
    });
  }

  /**
   * it must be done in this order. first, `npm install`, then, `npm list -j` shows the missing
   * peer dependencies, then, add these peerDependencies into devDependencies and run `npm install`
   * again. The reason for adding the missing peer into devDependencies is to not get them deleted
   * once `npm install` is running along the road.
   */
  async _installWithPeerOption(installPeerDependencies = true) {
    await this.installPackagesOnRoot();
    if (installPeerDependencies) {
      const peers = await this._getPeerDependencies();
      if (!R.isEmpty(peers)) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.capsulePackageJson.packageJsonObject.devDependencies = Object.assign(
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          this.capsulePackageJson.packageJsonObject.devDependencies || {},
          peers
        );
        await this._writeCapsulePackageJson();
        await this.installPackagesOnRoot();
      }
    }
  }

  async _getPeerDependencies(): Promise<Record<string, any>> {
    const packageManager = 'npm';
    let npmList;
    try {
      npmList = await this._getNpmListOutput(packageManager);
    } catch (err) {
      logger.error(`failed running "${packageManager} list -j"`, err);
      throw new Error(
        `failed running "${packageManager} list -j" to find the peer dependencies due to an error: ${err}`
      );
    }
    return npmClient.getPeerDepsFromNpmList(npmList, packageManager);
  }

  async _getNpmListOutput(packageManager: string): Promise<string> {
    const args = ['list', '-j'];
    try {
      const { stdout, stderr } = await this.capsuleExecUsingExeca(packageManager, args, this.componentRootDir);
      if (stderr && stderr.startsWith('{')) return stderr;
      return stdout;
    } catch (err) {
      if (err.stdout && err.stdout.startsWith('{')) {
        // it's probably a valid json with errors, that's fine, parse it.
        return err.stdout;
      }
      logger.error('npm-client got an error', err);
      throw new Error(`failed running ${err.cmd} to find the peer dependencies due to an error: ${err.message}`);
    }
  }
}
