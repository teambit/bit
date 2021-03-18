/**
 * a classic use case of eject is when a user imports a component using `bit import` to update it,
 * but the user has no intention to have the code as part of the project source code.
 * the eject provides the option to delete the component locally and install it via the NPM client.
 *
 * an implementation note, the entire process is done with rollback in mind.
 * since installing the component via NPM client is an error prone process, we do it first, before
 * removing the component files, so then it's easier to rollback.
 */
import { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import defaultErrorHandler from '@teambit/legacy/dist/cli/default-error-handler';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import * as packageJsonUtils from '@teambit/legacy/dist/consumer/component/package-json-utils';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import { Logger } from '@teambit/logger';

export type EjectResults = {
  ejectedComponents: BitIds;
  failedComponents: FailedComponents;
};

export type EjectOptions = {
  force: boolean; // eject although a component is modified/staged
  keepFiles: boolean; // keep component files on the workspace
};

type FailedComponents = {
  modifiedComponents: BitIds;
  stagedComponents: BitIds;
  notExportedComponents: BitIds;
  selfHostedExportedComponents: BitIds;
};

export class ComponentsEjector {
  consumer: Consumer;
  componentsIds: BitId[];
  idsToEject: BitIds;
  componentsToEject: Component[] = [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  notEjectedDependents: Array<{ dependent: Component; ejectedDependencies: Component[] }>;
  failedComponents: FailedComponents;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageJsonFilesBeforeChanges: PackageJsonFile[]; // for rollback in case of errors
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    componentsIds: BitId[],
    private ejectOptions: EjectOptions
  ) {
    this.consumer = this.workspace.consumer;
    this.componentsIds = componentsIds;
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
    this.logger.debug(`${this.idsToEject.length} to eject`);
    await this.loadComponentsToEject();
    if (this.idsToEject.length) {
      this._validateIdsHaveScopesAndVersions();
      await this.removeComponentsFromNodeModules();
      await this.untrackComponents();
      await this.installPackages();
      await this.removeComponentsFiles();
      await this.consumer.writeBitMap();
    }
    this.logger.debug('eject: completed successfully');
    return {
      ejectedComponents: this.idsToEject,
      failedComponents: this.failedComponents,
    };
  }

  async decideWhichComponentsToEject(): Promise<void> {
    this.logger.setStatusLine('Eject: getting the components status');
    if (R.isEmpty(this.componentsIds)) return;
    const remotes = await getScopeRemotes(this.consumer.scope);
    const hubExportedComponents = new BitIds();
    this.componentsIds.forEach((bitId) => {
      if (!bitId.hasScope()) this.failedComponents.notExportedComponents.push(bitId);
      else if (remotes.isHub(bitId.scope as string)) hubExportedComponents.push(bitId);
      else this.failedComponents.selfHostedExportedComponents.push(bitId);
    });
    if (this.ejectOptions.force) {
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
    this.logger.consoleSuccess();
  }

  async loadComponentsToEject() {
    const { components } = await this.consumer.loadComponents(this.idsToEject);
    this.componentsToEject = components;
  }

  async removeComponentsFromNodeModules() {
    const action = 'Eject: removing the existing components from node_modules';
    this.logger.setStatusLine(action);
    this.logger.debug(action);
    await packageJsonUtils.removeComponentsFromNodeModules(this.consumer, this.componentsToEject);
    this.logger.consoleSuccess(action);
  }

  async installPackages() {
    this.logger.setStatusLine('Eject: installing packages using the package-manager');
    const packages = this.getPackagesToInstall();
    await this.workspace.install(packages);
  }

  getPackagesToInstall(): string[] {
    return this.componentsToEject.map((c) => componentIdToPackageName(c));
  }

  _buildExceptionMessageWithRollbackData(action: string): string {
    return `eject failed ${action}.
your package.json (if existed) has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.`;
  }

  /**
   * as part of the 'eject' operation, a component is removed locally. as opposed to the remove
   * command, in this case, no need to remove the objects from the scope, only remove from the
   * filesystem, which means, delete the component files, untrack from .bitmap and clean
   * package.json and bit.json traces.
   */
  private async removeComponentsFiles() {
    if (this.ejectOptions.keepFiles) {
      return;
    }
    this.logger.setStatusLine('Eject: removing the components files from the filesystem');
    const dataToPersist = new DataToPersist();
    this.componentsToEject.forEach((component) => {
      const componentMap = component.componentMap;
      if (!componentMap) {
        throw new Error('ComponentEjector.removeComponentsFiles expect a component to have componentMap prop');
      }
      const rootDir = componentMap.rootDir;
      if (!rootDir) {
        throw new Error('ComponentEjector.removeComponentsFiles expect a componentMap to have rootDir');
      }
      dataToPersist.removePath(new RemovePath(rootDir, true));
    });
    dataToPersist.addBasePath(this.consumer.getPath());
    await dataToPersist.persistAllToFS();
    this.logger.consoleSuccess();
  }

  private async untrackComponents() {
    this.logger.debug('eject: removing the components from the .bitmap');
    await this.consumer.cleanFromBitMap(this.idsToEject, new BitIds());
  }

  throwEjectError(message: string, originalError: Error) {
    const { message: originalErrorMessage } = defaultErrorHandler(originalError);
    this.logger.error(`eject has stopped due to an error ${originalErrorMessage}`, originalError);
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
