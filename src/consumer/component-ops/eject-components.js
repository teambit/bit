// @flow
import R from 'ramda';
import { BitIds, BitId } from '../../bit-id';
import { Consumer } from '..';
import * as packageJson from '../component/package-json';
import { installPackages } from '../../npm-client/install-packages';
import logger from '../../logger/logger';
import defaultErrorHandler from '../../cli/default-error-handler';

export type EjectResults = {
  ejectedComponents: BitIds,
  failedComponents: { modifiedComponents: BitIds, stagedComponents: BitIds, notExportedComponents: BitIds }
};

/**
 * eject is a combination of a two main operations:
 * 1) deleting the components locally
 * 2) installing the component via the NPM client
 * since things may get wrong during these operations, it's better to have a roll back option.
 */
export default (async function ejectComponents(
  consumer: Consumer,
  componentsIds: BitId[],
  force: boolean = false
): Promise<EjectResults> {
  logger.debug('eject: getting the components status');
  const {
    componentsToDelete,
    modifiedComponents,
    stagedComponents,
    notExportedComponents
  } = await getComponentsToDelete(consumer, componentsIds, force);
  const failedComponents = { modifiedComponents, stagedComponents, notExportedComponents };
  const ejectResults: EjectResults = {
    ejectedComponents: componentsToDelete,
    failedComponents
  };
  if (!componentsToDelete.length) return ejectResults;

  const originalPackageJson = (await packageJson.getPackageJsonObject(consumer)) || {};
  try {
    logger.debug('eject: removing the existing links/files of the added packages from node_modules');
    await packageJson.removeComponentsFromWorkspacesAndDependencies(consumer, componentsToDelete);
  } catch (err) {
    logger.debug('eject: failed removing the existing links/files, restoring package.json');
    await packageJson.writePackageJsonFromObject(consumer, originalPackageJson);
    throwEjectError(
      `eject operation failed removing some or all the components generated data from node_modules.
your package.json has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.`,
      err
    );
  }
  try {
    logger.debug('eject: adding the component packages into package.json');
    await packageJson.addComponentsWithVersionToRoot(consumer, componentsToDelete);
  } catch (err) {
    logger.error(err);
    logger.debug('eject: failed adding the component packages, restoring package.json');
    await packageJson.writePackageJsonFromObject(consumer, originalPackageJson);
    throwEjectError(
      `eject operation failed adding the components to your package.json file. no changes have been done.
your package.json (if existed) has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.`,
      err
    );
  }
  try {
    logger.debug('eject: installing NPM packages');
    await installPackages(consumer, [], true, true);
  } catch (err) {
    await packageJson.writePackageJsonFromObject(consumer, originalPackageJson);
    throwEjectError(
      `eject operation failed installing your component using the NPM client.
your package.json (if existed) has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.`,
      err
    );
  }
  try {
    logger.debug('eject: removing the components files from the filesystem');
    await removeLocalComponents(consumer, componentsToDelete);
  } catch (err) {
    throwEjectError(
      `eject operation has installed your components successfully using the NPM client.
however, it failed removing the old components from the filesystem.
please use bit remove command to remove them.`,
      err
    );
  }

  logger.debug('eject: completed successfully');
  return ejectResults;
});

async function getComponentsToDelete(consumer: Consumer, bitIds: BitId[], force: boolean): Promise<Object> {
  const modifiedComponents = new BitIds();
  const stagedComponents = new BitIds();
  const exportedComponents = BitIds.fromArray(bitIds.filter(id => id.hasScope()));
  const notExportedComponents = BitIds.fromArray(bitIds.filter(id => !id.hasScope()));
  const componentsToDelete = new BitIds();
  if (R.isEmpty(bitIds)) return {};
  if (!force) {
    await Promise.all(
      exportedComponents.map(async (id) => {
        try {
          const componentStatus = await consumer.getComponentStatusById(id);
          if (componentStatus.modified) modifiedComponents.push(id);
          else if (componentStatus.staged) stagedComponents.push(id);
          else componentsToDelete.push(id);
        } catch (err) {
          throwEjectError(
            `eject operation failed getting the status of ${id.toString()}, no action has been done.
          please fix the issue to continue.`,
            err
          );
        }
      })
    );
  }

  return {
    componentsToDelete: force ? exportedComponents : componentsToDelete,
    modifiedComponents,
    stagedComponents,
    notExportedComponents
  };
}

/**
 * as part of the 'eject' operation, a component is removed locally. as opposed to the remove
 * command, in this case, no need to remove the objects from the scope, only remove from the
 * filesystem, which means, delete the component files, untrack from .bitmap and clean
 * package.json and bit.json traces.
 */
async function removeLocalComponents(consumer: Consumer, bitIds: BitIds): Promise<void> {
  // @todo: what about the dependencies? if they are getting deleted we have to make sure they
  // not used anywhere else. Because this is part of the eject operation, the user probably
  // gets the dependencies as npm packages so we don't need to worry much about have extra
  // dependencies on the filesystem
  await consumer.removeComponentFromFs(bitIds, true);
  // await packageJson.removeComponentsFromWorkspacesAndDependencies(consumer, bitIds);
  await consumer.cleanBitMapAndBitJson(bitIds, new BitIds());
}

function throwEjectError(message: string, originalError: Error) {
  // $FlowFixMe that's right, we don't know whether originalError has 'msg' property, but most has. what other choices do we have?
  const originalErrorMessage: string = defaultErrorHandler(originalError) || originalError.msg || originalError;
  logger.error('eject has stopped due to an error', originalErrorMessage);
  throw new Error(`${message}

got the following error: ${originalErrorMessage}`);
}
