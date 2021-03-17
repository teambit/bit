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
import deleteComponentsFiles from '@teambit/legacy/dist/consumer/component-ops/delete-component-files';
import { Logger } from '@teambit/logger';

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

export class ComponentsEjector {
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
  constructor(private workspace: Workspace, private logger: Logger, componentsIds: BitId[], force?: boolean) {
    this.consumer = this.workspace.consumer;
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
    this.logger.debug(`${this.idsToEject.length} to eject`);
    await this.loadComponentsToEject();
    if (this.idsToEject.length) {
      this._validateIdsHaveScopesAndVersions();
      await this.removeComponentsFromNodeModules();
      await this.removeComponents();
      await this.installPackages();
      await this.consumer.writeBitMap();
    }
    this.logger.debug('eject: completed successfully');
    return {
      ejectedComponents: this.idsToEject,
      failedComponents: this.failedComponents,
    };
  }

  async decideWhichComponentsToEject(): Promise<void> {
    this.logger.debug('eject: getting the components status');
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

  async removeComponentsFromNodeModules() {
    const action = 'removing the existing components from node_modules';
    this.logger.debug(action);
    await packageJsonUtils.removeComponentsFromNodeModules(this.consumer, this.componentsToEject);
  }

  async installPackages() {
    const action = 'installing the components using the package manager';
    this.logger.debug(action);
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

  async removeComponents() {
    try {
      this.logger.debug('eject: removing the components files from the filesystem');
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
