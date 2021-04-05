/**
 * @flow
 * a classic use case of eject is when a user imports a component using `bit import` to update it,
 * but the user has no intention to have the code as part of the project source code.
 * the eject provides the option to delete the component locally and install it via the NPM client.
 *
 * an implementation note, the entire process is done with rollback in mind.
 * since installing the component via NPM client is an error prone process, we do it first, before
 * removing the component files, so then it's easier to rollback.
 */
import R from 'ramda';

import { Consumer } from '..';
import { BitId, BitIds } from '../../bit-id';
import defaultErrorHandler from '../../cli/default-error-handler';
import logger from '../../logger/logger';
import { installPackages } from '../../npm-client/install-packages';
import DependencyGraph from '../../scope/graph/scope-graph';
import { getScopeRemotes } from '../../scope/scope-remotes';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import Component from '../component/consumer-component';
import PackageJsonFile from '../component/package-json-file';
import * as packageJsonUtils from '../component/package-json-utils';
import deleteComponentsFiles from './delete-component-files';

export type EjectResults = {
  ejectedComponents: BitIds;
  failedComponents: FailedComponents;
};

type FailedComponents = {
  modifiedComponents: BitIds;
  stagedComponents: BitIds;
  notExportedComponents: BitIds;
  selfHostedExportedComponents: BitIds;
};

export default class EjectComponents {
  consumer: Consumer;
  componentsIds: BitId[];
  force: boolean;
  idsToEject: BitIds;
  componentsToEject: Component[] = [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  notEjectedDependents: Array<{ dependent: Component; ejectedDependencies: Component[] }>;
  failedComponents: FailedComponents;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageJsonFilesBeforeChanges: PackageJsonFile[]; // for rollback in case of errors
  constructor(consumer: Consumer, componentsIds: BitId[], force?: boolean) {
    this.consumer = consumer;
    this.componentsIds = componentsIds;
    this.force = force || false;
    this.idsToEject = new BitIds();
    this.failedComponents = {
      modifiedComponents: new BitIds(),
      stagedComponents: new BitIds(),
      notExportedComponents: new BitIds(),
      selfHostedExportedComponents: new BitIds(),
    };
  }

  async eject(): Promise<EjectResults> {
    await this.decideWhichComponentsToEject();
    logger.debugAndAddBreadCrumb('eject-components.eject', `${this.idsToEject.length} to eject`);
    await this.loadComponentsToEject();
    if (this.idsToEject.length) {
      this._validateIdsHaveScopesAndVersions();
      await this.findNonEjectedDependents();
      await this.loadPackageJsonFilesForPotentialRollBack();
      await this.removeComponentsFromPackageJsonAndNodeModules();
      await this.addComponentsAsPackagesToPackageJsonFiles();
      await this.installPackagesUsingNPMClient();
      await this.removeComponents();
    }
    logger.debug('eject: completed successfully');
    return {
      ejectedComponents: this.idsToEject,
      failedComponents: this.failedComponents,
    };
  }

  /**
   * needed for update their package.json later with the dependencies version (instead of the
   * relative paths)
   */
  async findNonEjectedDependents() {
    // this also loads all non-nested components into the memory, so retrieving them later is at no cost
    const graph = await DependencyGraph.buildGraphFromCurrentlyUsedComponents(this.consumer);
    const scopeGraph = new DependencyGraph(graph);
    const notEjectedData: Array<{ id: BitId; dependencies: BitId[] }> = [];
    this.idsToEject.forEach((componentId) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const dependents: BitId[] = scopeGraph.getImmediateDependentsPerId(componentId, true);
      const notEjectedDependents: BitId[] = dependents.filter((d) => !this.idsToEject.hasWithoutScopeAndVersion(d));
      notEjectedDependents.forEach((dependentId: BitId) => {
        const foundInNotEjectedData = notEjectedData.find((d) => d.id.isEqual(dependentId));
        if (foundInNotEjectedData) foundInNotEjectedData.dependencies.push(componentId);
        else notEjectedData.push({ id: dependentId, dependencies: [componentId] });
      });
    });
    const notEjectedComponentsDataP = notEjectedData.map(async (notEjectedItem) => {
      const dependent = await this.consumer.loadComponent(notEjectedItem.id);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const { components: ejectedDependencies } = await this.consumer.loadComponents(notEjectedItem.dependencies);
      return { dependent, ejectedDependencies };
    });
    const notEjectedComponentsData = await Promise.all(notEjectedComponentsDataP);
    this.notEjectedDependents = notEjectedComponentsData.filter((d) => d.dependent.packageJsonFile);
  }

  async loadPackageJsonFilesForPotentialRollBack() {
    const rootPackageJson = await PackageJsonFile.load(this.consumer.getPath());
    this.packageJsonFilesBeforeChanges = [rootPackageJson];
    this.notEjectedDependents.forEach(({ dependent }) => {
      // $FlowFixMe notEjectedDependents has only dependents with packageJsonFile
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.packageJsonFilesBeforeChanges.push(dependent.packageJsonFile.clone());
    });
  }

  async decideWhichComponentsToEject(): Promise<void> {
    logger.debug('eject: getting the components status');
    if (R.isEmpty(this.componentsIds)) return;
    const remotes = await getScopeRemotes(this.consumer.scope);
    const hubExportedComponents = new BitIds();
    this.componentsIds.forEach((bitId) => {
      if (!bitId.hasScope()) this.failedComponents.notExportedComponents.push(bitId);
      else if (remotes.isHub(bitId.scope as string)) hubExportedComponents.push(bitId);
      else this.failedComponents.selfHostedExportedComponents.push(bitId);
    });
    if (this.force) {
      this.idsToEject = hubExportedComponents;
    } else {
      await Promise.all(
        hubExportedComponents.map(async (id) => {
          try {
            const componentStatus = await this.consumer.getComponentStatusById(id);
            if (componentStatus.modified) this.failedComponents.modifiedComponents.push(id);
            else if (componentStatus.staged) this.failedComponents.stagedComponents.push(id);
            else this.idsToEject.push(id);
          } catch (err) {
            this.throwEjectError(
              `eject operation failed getting the status of ${id.toString()}, no action has been done.
            please fix the issue to continue.`,
              err
            );
          }
        })
      );
    }
  }

  async loadComponentsToEject() {
    const { components } = await this.consumer.loadComponents(this.idsToEject);
    this.componentsToEject = components;
  }

  async removeComponentsFromPackageJsonAndNodeModules() {
    const action = 'removing the existing components from package.json and node_modules';
    try {
      logger.debugAndAddBreadCrumb('eject', action);
      await packageJsonUtils.removeComponentsFromWorkspacesAndDependencies(this.consumer, this.componentsToEject);
    } catch (err) {
      logger.warn(`eject: failed ${action}, restoring package.json`);
      await this.rollBack(action);
      this.throwEjectError(this._buildExceptionMessageWithRollbackData(action), err);
    }
  }

  async addComponentsAsPackagesToPackageJsonFiles() {
    const action = 'adding the components as packages into package.json';
    try {
      logger.debugAndAddBreadCrumb('eject', action);
      await packageJsonUtils.addComponentsWithVersionToRoot(this.consumer, this.componentsToEject);
      this.notEjectedDependents.forEach(({ dependent, ejectedDependencies }) => {
        const dependenciesToReplace = ejectedDependencies.reduce((acc, dependency) => {
          const packageName = componentIdToPackageName(dependency);
          acc[packageName] = dependency.version;
          return acc;
        }, {});
        // $FlowFixMe notEjectedDependents has only dependents with packageJsonFile
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dependent.packageJsonFile.replaceDependencies(dependenciesToReplace);
      });
      // $FlowFixMe notEjectedDependents has only dependents with packageJsonFile
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      await Promise.all(this.notEjectedDependents.map(({ dependent }) => dependent.packageJsonFile.write()));
    } catch (err) {
      logger.error(`eject: failed ${action}, restoring package.json`, err);
      await this.rollBack(action);
      this.throwEjectError(this._buildExceptionMessageWithRollbackData(action), err);
    }
  }

  async installPackagesUsingNPMClient() {
    const action = 'installing the components using the NPM client';
    try {
      logger.debugAndAddBreadCrumb('eject', action);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const dirs: string[] = this.notEjectedDependents // $FlowFixMe componentMap must be set for authored and imported
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        .map(({ dependent }) => dependent.componentMap.rootDir)
        .filter((x) => x);
      await installPackages(this.consumer, dirs, true, true);
    } catch (err) {
      await this.rollBack(action);
      this.throwEjectError(this._buildExceptionMessageWithRollbackData(action), err);
    }
  }

  async rollBack(action: string): Promise<void> {
    await Promise.all(
      this.packageJsonFilesBeforeChanges.map(async (packageJsonFile) => {
        if (packageJsonFile.fileExist) {
          logger.warn(`eject: failed ${action}, restoring package.json at ${packageJsonFile.filePath}`);
          await packageJsonFile.write();
        } else {
          logger.warn(`eject: failed ${action}, no package.json to restore at ${packageJsonFile.filePath}`);
        }
      })
    );
  }

  _buildExceptionMessageWithRollbackData(action: string): string {
    return `eject failed ${action}.
your package.json (if existed) has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.`;
  }

  async removeComponents() {
    try {
      logger.debug('eject: removing the components files from the filesystem');
      await this.removeLocalComponents();
    } catch (err) {
      this.throwEjectError(
        `eject operation has installed your components successfully using the NPM client.
however, it failed removing the old components from the filesystem.
please use bit remove command to remove them.`,
        err
      );
    }
  }

  /**
   * as part of the 'eject' operation, a component is removed locally. as opposed to the remove
   * command, in this case, no need to remove the objects from the scope, only remove from the
   * filesystem, which means, delete the component files, untrack from .bitmap and clean
   * package.json and bit.json traces.
   */
  async removeLocalComponents(): Promise<void> {
    // @todo: what about the dependencies? if they are getting deleted we have to make sure they
    // not used anywhere else. Because this is part of the eject operation, the user probably
    // gets the dependencies as npm packages so we don't need to worry much about have extra
    // dependencies on the filesystem
    await deleteComponentsFiles(this.consumer, this.idsToEject, true);
    await this.consumer.cleanFromBitMap(this.idsToEject, new BitIds());
  }

  throwEjectError(message: string, originalError: Error) {
    const { message: originalErrorMessage } = defaultErrorHandler(originalError);
    logger.error(`eject has stopped due to an error ${originalErrorMessage}`, originalError);
    throw new Error(`${message}

got the following error: ${originalErrorMessage}`);
  }

  _validateIdsHaveScopesAndVersions() {
    this.idsToEject.forEach((id) => {
      if (!id.hasScope() || !id.hasVersion()) {
        throw new TypeError(`EjectComponents expects ids with scope and version, got ${id.toString()}`);
      }
    });
  }
}
