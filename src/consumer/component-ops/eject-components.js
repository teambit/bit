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
import { BitIds, BitId } from '../../bit-id';
import { Consumer } from '..';
import * as packageJson from '../component/package-json';
import { installPackages } from '../../npm-client/install-packages';
import logger from '../../logger/logger';
import defaultErrorHandler from '../../cli/default-error-handler';
import { getScopeRemotes } from '../../scope/scope-remotes';

export type EjectResults = {
  ejectedComponents: BitIds,
  failedComponents: FailedComponents
};

type FailedComponents = {
  modifiedComponents: BitIds,
  stagedComponents: BitIds,
  notExportedComponents: BitIds,
  selfHostedExportedComponents: BitIds
};

export default class EjectComponents {
  consumer: Consumer;
  componentsIds: BitId[];
  force: boolean;
  componentsToEject: BitIds;
  failedComponents: FailedComponents;
  originalPackageJson: Object; // for rollback in case of errors
  constructor(consumer: Consumer, componentsIds: BitId[], force?: boolean) {
    this.consumer = consumer;
    this.componentsIds = componentsIds;
    this.force = force || false;
    this.componentsToEject = new BitIds();
    this.failedComponents = {
      modifiedComponents: new BitIds(),
      stagedComponents: new BitIds(),
      notExportedComponents: new BitIds(),
      selfHostedExportedComponents: new BitIds()
    };
  }

  async eject(): Promise<EjectResults> {
    await this.decideWhichComponentsToEject();
    logger.debug(`eject: ${this.componentsToEject.length} to eject`);
    if (this.componentsToEject.length) {
      this.originalPackageJson = (await packageJson.getPackageJsonObject(this.consumer)) || {};
      await this.removeComponentsFromPackageJsonAndNodeModules();
      await this.addComponentsAsPackagesToPackageJson();
      await this.installPackagesUsingNPMClient();
      await this.removeComponents();
    }
    logger.debug('eject: completed successfully');
    return {
      ejectedComponents: this.componentsToEject,
      failedComponents: this.failedComponents
    };
  }

  async decideWhichComponentsToEject(): Promise<void> {
    logger.debug('eject: getting the components status');
    if (R.isEmpty(this.componentsIds)) return;
    const remotes = await getScopeRemotes(this.consumer.scope);
    const hubExportedComponents = new BitIds();
    this.componentsIds.forEach((bitId) => {
      if (!bitId.hasScope()) this.failedComponents.notExportedComponents.push(bitId);
      else if (remotes.isHub(bitId.scope)) hubExportedComponents.push(bitId);
      else this.failedComponents.selfHostedExportedComponents.push(bitId);
    });
    if (this.force) {
      this.componentsToEject = hubExportedComponents;
    } else {
      await Promise.all(
        hubExportedComponents.map(async (id) => {
          try {
            const componentStatus = await this.consumer.getComponentStatusById(id);
            if (componentStatus.modified) this.failedComponents.modifiedComponents.push(id);
            else if (componentStatus.staged) this.failedComponents.stagedComponents.push(id);
            else this.componentsToEject.push(id);
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

  async removeComponentsFromPackageJsonAndNodeModules() {
    const action = 'removing the existing components from package.json and node_modules';
    try {
      logger.debug(`eject: ${action}`);
      await packageJson.removeComponentsFromWorkspacesAndDependencies(this.consumer, this.componentsToEject);
    } catch (err) {
      logger.warn(`eject: failed ${action}, restoring package.json`);
      await this.rollBack(action);
      this.throwEjectError(this._buildExceptionMessageWithRollbackData(action), err);
    }
  }

  async addComponentsAsPackagesToPackageJson() {
    const action = 'adding the components as packages into package.json';
    try {
      logger.debug(`eject: ${action}`);
      await packageJson.addComponentsWithVersionToRoot(this.consumer, this.componentsToEject);
    } catch (err) {
      logger.error(err);
      logger.warn(`eject: failed ${action}, restoring package.json`);
      await this.rollBack(action);
      this.throwEjectError(this._buildExceptionMessageWithRollbackData(action), err);
    }
  }

  async installPackagesUsingNPMClient() {
    const action = 'installing the components using the NPM client';
    try {
      logger.debug(`eject: ${action}`);
      await installPackages(this.consumer, [], true, true);
    } catch (err) {
      await this.rollBack(action);
      this.throwEjectError(this._buildExceptionMessageWithRollbackData(action), err);
    }
  }

  async rollBack(action: string): Promise<void> {
    logger.warn(`eject: failed ${action}, restoring package.json`);
    await packageJson.writePackageJsonFromObject(this.consumer, this.originalPackageJson);
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
    await this.consumer.removeComponentFromFs(this.componentsToEject, true);
    await this.consumer.cleanBitMapAndBitJson(this.componentsToEject, new BitIds());
  }

  throwEjectError(message: string, originalError: Error) {
    // $FlowFixMe that's right, we don't know whether originalError has 'msg' property, but most have. what other choices do we have?
    const originalErrorMessage: string = defaultErrorHandler(originalError) || originalError.msg || originalError;
    logger.error('eject has stopped due to an error', originalErrorMessage);
    throw new Error(`${message}

got the following error: ${originalErrorMessage}`);
  }
}
