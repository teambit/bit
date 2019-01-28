/** @flow */
import v4 from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { Scope, ComponentWithDependencies } from '../scope';
import { BitId, BitIds } from '../bit-id';
import { ISOLATED_ENV_ROOT } from '../constants';
import { mkdirp, outputFile } from '../utils';
import logger from '../logger/logger';
import { Consumer } from '../consumer';
import type { PathOsBased } from '../utils/path';
import ManyComponentsWriter from '../consumer/component-ops/many-components-writer';

import { write } from '../consumer/component/package-json';
import { installNpmPackagesForComponents } from '../npm-client/install-packages';
import execa from 'execa';
import promiseLimit from 'promise-limit';

import * as lockfile from '@yarnpkg/lockfile';
import yarnLogicalTree from 'yarn-logical-tree';

const generatePnpMap = require(`${__dirname}/../../src/environment/generate-pnp-map`); // otherwise it gets transpiled, needs to be a separate package anyway

const limit = promiseLimit(10);

export type IsolateOptions = {
  writeToPath: ?string, // Path to write the component to (default to the isolatedEnv path)
  writeBitDependencies: ?boolean, // Write bit dependencies as package dependencies in package.json
  npmLinks: ?boolean, // Fix the links to dependencies to be links to the package
  saveDependenciesAsComponents: ?boolean, // import the dependencies as bit components instead of as npm packages
  installPackages: ?boolean, // Install the package dependencies
  installPeerDependencies: ?boolean, // Install the peer package dependencies
  noPackageJson: ?boolean, // Don't write the package.json
  override: ?boolean, // Override existing files in the folder
  excludeRegistryPrefix: ?boolean, // exclude the registry prefix from the component's name in the package.json
  dist: ?boolean, // Write dist files
  conf: ?boolean, // Write bit.json file
  verbose: boolean, // Print more logs
  silentClientResult: ?boolean // Print environment install result
};

const ENV_IS_INSTALLED_FILENAME = '.bit_env_has_installed';

/**
 * workaround for Mac where `os.tmpdir()` returns /var/folder but `pwd` in that folder returns
 * '/private/var/folders'.
 */
const getTmpPath = () => os.tmpdir().replace('/var/folders/', '/private/var/folders/');

const createSandboxStub = async () => {
  const dir = path.join(getTmpPath(), ISOLATED_ENV_ROOT, v4());
  try {
    await fs.emptydir(dir);
    await fs.rmdir(dir);
  } catch (e) {}
  await fs.ensureDir(dir);
  return {
    updateFs(files) {
      return Promise.all(
        Object.keys(files).map(async (fileName) => {
          const contents = files[fileName];
          const fileFullPath = `${dir}/${fileName}`;
          try {
            await fs.ensureDir(path.dirname(fileFullPath));
          } catch (e) {}
          if (contents) {
            await fs.writeFile(fileFullPath, contents);
          } else {
            await fs.unlink(fileFullPath);
          }
        })
      );
    },
    async exec(command, options) {
      const { stdout } = await execa.shell(command, { cwd: dir });
      return stdout;
    },
    async createSymlinks(symlinks) {
      if (!symlinks) return Promise.resolve();
      return Promise.all(
        Array.from(symlinks.keys()).map((linkName) => {
          const linkDestination = symlinks.get(linkName);
          return fs.ensureSymlink(linkDestination, linkName);
        })
      );
    },
    getSandboxFolder() {
      // this is a temporary helper method for the purposes of the PNP POC - please do not use in prod code
      return dir;
    }
  };
};

export default class Environment {
  path: PathOsBased;
  scope: Scope;
  consumer: Consumer;

  constructor(scope: Scope, dir: ?string) {
    this.scope = scope;
    this.path = dir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    this.yarnlock = fs.readFileSync(`${__dirname}/../../src/environment/yarn.lock`, 'utf-8'); // this is temporary for experimenting, do not commit this
    this.execJestPnp = fs.readFileSync(`${__dirname}/../../src/environment/exec-jest-pnp.js`);
    this.pnpFolderPath = `${__dirname}/../../src/environment/.pnp`;
    logger.debug(`creating a new isolated environment at ${this.path}`);
  }

  async create(): Promise<void> {
    await mkdirp(this.path);
    this.consumer = await Consumer.createWithExistingScope(this.path, this.scope, true);
  }

  async createSandbox(envComponents): Promise<void> {
    this.consumer = await Consumer.createWithExistingScope(this.path, this.scope, true);
    this.masterPackageJson = (await Promise.all(
      envComponents.map(c => write(this.consumer, c, this.consumer.getPath()))
    )).reduce((packageJson, componentPkgJson) => {
      return Object.assign({}, packageJson, {
        devDependencies: Object.assign({}, packageJson.devDependencies || {}, componentPkgJson.devDependencies || {}),
        dependencies: Object.assign({}, packageJson.dependencies || {}, componentPkgJson.dependencies || {}),
        optionalDependencies: Object.assign(
          {},
          packageJson.optionalDependencies || {},
          componentPkgJson.optionalDependencies || {}
        ),
        peerDependencies: Object.assign({}, packageJson.dependencies || {}, componentPkgJson.dependencies || {})
      });
    }, {});
    // TODO: packageJson of dependencies needs to be merged into this
    // componentPackageJson.version = componentPackageJson.version === 'latest' ? '1.0.0' : componentPackageJson.version;
    this.masterPackageJson.version = '1.0.0';
  }

  /**
   * import a component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param {BitId | string} bitId - the component id to isolate
   * @param {IsolateOptions} opts
   * @return {Promise.<Component>}
   */
  async isolateComponent(bitId: BitId | string, opts: IsolateOptions): Promise<ComponentWithDependencies> {
    // add this if statement due to extentions calling this api directly with bitId as string with version
    if (typeof bitId === 'string') {
      bitId = await BitId.parse(bitId, true);
    }
    const saveDependenciesAsComponents =
      opts.saveDependenciesAsComponents === undefined ? true : opts.saveDependenciesAsComponents;
    const componentsWithDependencies = await this.consumer.importComponents(
      BitIds.fromArray([bitId]),
      false,
      saveDependenciesAsComponents
    );
    const componentWithDependencies = componentsWithDependencies[0];
    const writeToPath = opts.writeToPath || this.path;
    const concreteOpts = {
      consumer: this.consumer,
      componentsWithDependencies,
      writeToPath,
      override: opts.override,
      writePackageJson: !opts.noPackageJson,
      writeConfig: opts.conf,
      writeBitDependencies: opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      writeDists: opts.dist,
      installNpmPackages: !!opts.installPackages, // convert to boolean
      installPeerDependencies: !!opts.installPackages, // convert to boolean
      addToRootPackageJson: false,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult
    };
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await manyComponentsWriter.writeAll();
    await Environment.markEnvironmentAsInstalled(writeToPath);
    return componentWithDependencies;
  }

  /**
   * isolate a given component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param {BitId} the component id to isolate
   * @param {IsolateOptions} opts
   * @return {Promise.<Component>}
   */
  async isolateComponentToSandbox(component: Component, envComponents): Promise<ComponentWithDependencies> {
    // TODO: better args
    return limit(async () => {
      const sandbox = await createSandboxStub();
      await sandbox.updateFs(
        envComponents.reduce((envFilesToUpdate, envComponent) => {
          const toUpdate = envComponent.files.concat(envComponent.tester.files).reduce((toUpdate, cFile) => {
            const { relativePath, content } = cFile.toReadableString();
            return Object.assign({}, toUpdate, {
              [relativePath || cFile.relativePath]: content // TODO: fix this (possibly in vinyl abstraction)
            });
          }, {});
          return Object.assign({}, envFilesToUpdate, toUpdate);
          // TODO: better
        }, {})
      );
      // ******* TODO: MOVE THIS ELSEWHERE *******
      const packagePath = sandbox.getSandboxFolder();
      const cacheFolder = '/Users/davidfirst/Library/Caches/Yarn/v4'; // TBD: generate the cache
      const pkgJson = JSON.stringify(this.masterPackageJson, null, 4); // TODO: various fields in package.json (eg. babel configuration)
      const yarnLock = this.yarnlock;
      const yarnLockParsed = lockfile.parse(this.yarnlock);
      const pkgParsed = JSON.parse(pkgJson);
      const logicalDependencyTree = yarnLogicalTree(pkgParsed, yarnLockParsed.object);
      const { pnpjs, symlinks } = await generatePnpMap(logicalDependencyTree, cacheFolder, packagePath);
      // *****************************************

      await sandbox.updateFs({
        'package.json': pkgJson,
        'yarn.lock': this.yarnlock,
        '.pnp.js': pnpjs,
        'exec-jest-pnp.js': this.execJestPnp
      });
      await sandbox.createSymlinks(symlinks);
      console.log(`done isolating component ${component.name}`); // TODO: proper bit logging
      return sandbox;
    });
  }

  /**
   * It helps to make sure an environment is installed. Otherwise, in case a user interrupts the environment
   * installation process, it won't be installed again.
   */
  static markEnvironmentAsInstalled(dir) {
    const filePath = path.join(dir, ENV_IS_INSTALLED_FILENAME);
    return outputFile({ filePath, content: '' });
  }

  static isEnvironmentInstalled(dir) {
    const filePath = path.join(dir, ENV_IS_INSTALLED_FILENAME);
    return fs.existsSync(filePath);
  }

  getPath(): string {
    return this.path;
  }

  destroy(): Promise<*> {
    logger.debug(`destroying the isolated environment at ${this.path}`);
    logger.info(`environment, deleting ${this.path}`);
    return fs.remove(this.path);
  }

  async destroySandboxedEnvs() {
    const envRootFolder = path.join(getTmpPath(), ISOLATED_ENV_ROOT);
    await fs.emptyDir(envRootFolder);
    await fs.rmdir(envRootFolder);
  }

  async destroyIfExist(): Promise<*> {
    const isExist = await fs.exists(this.path);
    if (isExist) {
      logger.debug(`destroying existing environment in path ${this.path}`);
      return this.destroy();
    }
    return false;
  }
}
