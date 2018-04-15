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
import GeneralError from '../../error/general-error';

export type ImportOptions = {
  ids: string[], // array might be empty
  verbose: boolean, // default: false
  withEnvironments: boolean, // default: false
  writeToPath?: string,
  writePackageJson: boolean, // default: true
  writeBitJson: boolean, // default: false
  writeDists: boolean, // default: true
  override: boolean, // default: false
  installNpmPackages: boolean, // default: true
  objectsOnly: boolean, // default: false
  writeToFs: boolean, // default: false. relevant only for import-all, where "objectsOnly" flag is default to true.
  saveDependenciesAsComponents?: boolean // default: false
};

type ImportedVersions = { [id: string]: string[] };
export type ImportStatus = 'added' | 'updated' | 'up to date';
export type ImportDetails = { id: string, versions: string[], status: ImportStatus };
export type ImportResult = Promise<{
  dependencies: ComponentWithDependencies[],
  envDependencies?: Component[],
  importDetails: ImportDetails[]
}>;

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
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    await this._warnForModifiedOrNewComponents(bitIds);
    const componentsWithDependencies = await this.consumer.scope.getManyWithAllVersions(bitIds, false);
    await this._writeToFileSystem(componentsWithDependencies);
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsWithDependencies);
    return { dependencies: componentsWithDependencies, importDetails };
  }

  async importAccordingToBitJsonAndBitMap(): ImportResult {
    this.options.objectsOnly = !this.options.writeToFs;

    const dependenciesFromBitJson = BitIds.fromObject(this.consumer.bitJson.dependencies);
    const componentsFromBitMap = this.consumer.bitMap.getAuthoredExportedComponents();

    if ((R.isNil(dependenciesFromBitJson) || R.isEmpty(dependenciesFromBitJson)) && R.isEmpty(componentsFromBitMap)) {
      if (!this.options.withEnvironments) {
        return Promise.reject(new NothingToImport());
      } else if (R.isNil(this.consumer.tester) && R.isNil(this.consumer.compiler)) {
        return Promise.reject(new NothingToImport());
      }
    }
    const allDependenciesIds = dependenciesFromBitJson.concat(componentsFromBitMap);
    await this._warnForModifiedOrNewComponents(allDependenciesIds);
    const beforeImportVersions = await this._getCurrentVersions(allDependenciesIds);

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
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsAndDependencies);
    if (this.options.withEnvironments) {
      const compiler = this.consumer.compiler;
      const tester = this.consumer.tester;
      const envsPromises = [];
      if (compiler) {
        envsPromises.push(compiler.install());
      }
      if (tester) {
        envsPromises.push(tester.install());
      }
      const envComponents = await Promise.all(envsPromises);
      return {
        dependencies: componentsAndDependencies,
        envComponents,
        importDetails
      };
    }

    return { dependencies: componentsAndDependencies, importDetails };
  }

  async _getCurrentVersions(ids: BitId[]): ImportedVersions {
    const versionsP = ids.map(async (id) => {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id);
      const idStr = id.toStringWithoutVersion();
      if (!modelComponent) return [idStr, []];
      return [idStr, modelComponent.listVersions()];
    });
    const versions = await Promise.all(versionsP);
    return R.fromPairs(versions);
  }

  /**
   * get import details, includes the diff between the versions array before import and after import
   */
  async _getImportDetails(
    currentVersions: ImportedVersions,
    components: ComponentWithDependencies[]
  ): Promise<ImportDetails[]> {
    const detailsP = components.map(async (component) => {
      const id = component.component.id;
      const idStr = id.toStringWithoutVersion();
      const beforeImportVersions = currentVersions[idStr];
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id);
      if (!modelComponent) throw new GeneralError(`imported component ${idStr} was not found in the model`);
      const afterImportVersions = modelComponent.listVersions();
      const versionDifference = R.difference(afterImportVersions, beforeImportVersions);
      const getStatus = (): ImportStatus => {
        if (!versionDifference.length) return 'up to date';
        if (!beforeImportVersions.length) return 'added';
        return 'updated';
      };
      return { id: idStr, versions: versionDifference, status: getStatus() };
    });
    return Promise.all(detailsP);
  }

  async _warnForModifiedOrNewComponents(ids: BitId[]) {
    // the typical objectsOnly option is when a user cloned a project with components committed to the source code, but
    // doesn't have the model objects. in that case, calling getComponentStatusById() may return an error as it relies
    // on the model objects when there are dependencies
    if (this.options.override || this.options.objectsOnly) return Promise.resolve();
    const modifiedComponents = await filterAsync(ids, (id) => {
      return this.consumer.getComponentStatusById(id).then(status => status.modified || status.newlyCreated);
    });

    if (modifiedComponents.length) {
      return Promise.reject(
        chalk.yellow(
          `unable to import the following components due to local changes, use --override flag to override your local changes\n${modifiedComponents.join(
            '\n'
          )} `
        )
      );
    }
    return Promise.resolve();
  }

  async _writeToFileSystem(componentsWithDependencies: ComponentWithDependencies, override: boolean = true) {
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
      override
    });
  }
}
