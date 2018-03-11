/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import { NothingToImport } from '../exceptions';
import { BitId, BitIds } from '../../bit-id';
import Component from '../component';
import { Consumer } from '../../consumer';
import { ComponentWithDependencies } from '../../scope';
import loader from '../../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../../cli/loader/loader-messages';
import logger from '../../logger/logger';
import { filterAsync } from '../../utils';

export type ImportOptions = {
  ids?: string[],
  verbose: boolean, // default: false
  withEnvironments: boolean, // default: false
  writeToPath?: string,
  writePackageJson: boolean, // default: true
  writeBitJson: boolean, // default: false
  writeDists: boolean, // default: true
  force: boolean, // default: false
  installNpmPackages: boolean, // default: true
  objectsOnly: boolean, // default: false
  writeToFs: boolean, // default: false. relevant only for import-all, where "objectsOnly" flag is default to true.
  saveDependenciesAsComponents?: boolean // default: false
};

export type ImportResult = Promise<{ dependencies: ComponentWithDependencies[], envDependencies?: Component[] }>;

export default class ImportComponents {
  consumer: Consumer;
  options: ImportOptions;
  constructor(consumer: Consumer, options: ImportOptions) {
    this.consumer = consumer;
    this.options = options;
  }

  importComponents(): ImportResult {
    loader.start(BEFORE_IMPORT_ACTION);
    this.options.saveDependenciesAsComponents = this.consumer.bitJson.saveDependenciesAsComponents;
    if (!this.options.writePackageJson) {
      // if package.json is not written, it's impossible to install the packages and dependencies as npm packages
      this.options.installNpmPackages = false;
      this.options.saveDependenciesAsComponents = true;
    }
    if (!this.options.ids || R.isEmpty(this.options.ids)) {
      return this.importAccordingToBitJsonAndBitMap();
    }
    return this.importSpecificComponents();
  }

  async importSpecificComponents(): ImportResult {
    // $FlowFixMe - we make sure the ids are populated before.
    logger.debug(`importSpecificComponents, Ids: ${this.options.ids.join(', ')}`);
    // $FlowFixMe - we check if there are bitIds before we call this function
    const bitIds = this.options.ids.map(raw => BitId.parse(raw));
    await this._warnForModifiedOrNewComponents(bitIds);
    const componentsWithDependencies = await this.consumer.scope.getManyWithAllVersions(bitIds, false);
    await this._writeToFileSystem(componentsWithDependencies);
    return { dependencies: componentsWithDependencies };
  }

  async importAccordingToBitJsonAndBitMap(): ImportResult {
    this.options.objectsOnly = !this.options.writeToFs;

    const dependenciesFromBitJson = BitIds.fromObject(this.consumer.bitJson.dependencies);
    const componentsFromBitMap = this.consumer.bitMap.getAuthoredExportedComponents();

    if ((R.isNil(dependenciesFromBitJson) || R.isEmpty(dependenciesFromBitJson)) && R.isEmpty(componentsFromBitMap)) {
      if (!this.options.withEnvironments) {
        return Promise.reject(new NothingToImport());
      } else if (R.isNil(this.consumer.testerId) && R.isNil(this.consumer.compilerId)) {
        return Promise.reject(new NothingToImport());
      }
    }
    await this._warnForModifiedOrNewComponents(dependenciesFromBitJson.concat(componentsFromBitMap));

    let componentsAndDependenciesBitJson = [];
    let componentsAndDependenciesBitMap = [];
    if (dependenciesFromBitJson) {
      componentsAndDependenciesBitJson = await this.consumer.scope.getManyWithAllVersions(
        dependenciesFromBitJson,
        false
      );
      await this._writeToFileSystem(componentsAndDependenciesBitJson);
    }
    if (componentsFromBitMap.length) {
      componentsAndDependenciesBitMap = await this.consumer.scope.getManyWithAllVersions(componentsFromBitMap, false);
      // don't write the package.json for an authored component, because its dependencies probably managed by the root
      // package.json. Also, don't install npm packages for the same reason.
      this.options.writePackageJson = false;
      this.options.installNpmPackages = false;
      // don't force the writing to the filesystem because as an author I may have some modified files
      await this._writeToFileSystem(componentsAndDependenciesBitMap, false);
    }
    const componentsAndDependencies = [...componentsAndDependenciesBitJson, ...componentsAndDependenciesBitMap];
    if (this.options.withEnvironments) {
      const envComponents = await this.consumer.scope.installEnvironment({
        ids: [
          { componentId: this.consumer.testerId, type: 'tester' },
          { componentId: this.consumer.compilerId, type: 'compiler' }
        ],
        verbose: this.options.verbose
      });
      return {
        dependencies: componentsAndDependencies,
        envDependencies: envComponents
      };
    }
    return { dependencies: componentsAndDependencies };
  }

  async _warnForModifiedOrNewComponents(ids: BitId[]) {
    // the typical objectsOnly option is when a user cloned a project with components committed to the source code, but
    // doesn't have the model objects. in that case, calling getComponentStatusById() may return an error as it relies
    // on the model objects when there are dependencies
    if (this.options.force || this.options.objectsOnly) return Promise.resolve();
    const modifiedComponents = await filterAsync(ids, (id) => {
      return this.consumer.getComponentStatusById(id).then(status => status.modified || status.newlyCreated);
    });

    if (modifiedComponents.length) {
      return Promise.reject(
        chalk.yellow(
          `unable to import the following components due to local changes, use --force flag to override your local changes\n${modifiedComponents.join(
            '\n'
          )} `
        )
      );
    }
    return Promise.resolve();
  }

  async _writeToFileSystem(componentsWithDependencies: ComponentWithDependencies, force: boolean = true) {
    if (this.options.objectsOnly) return;
    await this.consumer.writeToComponentsDir({
      componentsWithDependencies,
      writeToPath: this.options.writeToPath,
      writePackageJson: this.options.writePackageJson,
      writeBitJson: this.options.writeBitJson,
      writeDists: this.options.writeDists,
      installNpmPackages: this.options.installNpmPackages,
      saveDependenciesAsComponents: this.options.saveDependenciesAsComponents,
      verbose: this.options.verbose,
      force
    });
  }
}
