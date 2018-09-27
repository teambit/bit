// @flow
import R from 'ramda';
import { BitIds, BitId } from '../../bit-id';
import GeneralError from '../../error/general-error';
import { Consumer } from '..';
import * as packageJson from '../component/package-json';
import { installPackages } from '../../npm-client/install-packages';
import logger from '../../logger/logger';

export type EjectResults = {
  ejectedComponents: BitIds,
  failedComponents: { modifiedComponents: BitIds, stagedComponents: BitIds }
};

/**
 * eject is a combination of a two main operations:
 * 1) deleting the components locally
 * 2) installing the component via the NPM client
 * since things may get wrong during these operations, it's better to have a roll back option.
 */
export default (async function eject(
  consumer: Consumer,
  componentsIds: BitId[],
  force: boolean = false
): Promise<EjectResults> {
  const { componentsToDelete, modifiedComponents, stagedComponents } = await getComponentsToDelete(
    consumer,
    componentsIds,
    force
  );
  const failedComponents = { modifiedComponents, stagedComponents };
  const ejectResults: EjectResults = {
    ejectedComponents: componentsToDelete,
    failedComponents
  };
  if (!componentsToDelete.length) return ejectResults;

  const originalPackageJson = await packageJson.getPackageJsonObject(consumer);
  try {
    await packageJson.addComponentsWithVersionToRoot(consumer, componentsToDelete);
  } catch (err) {
    logger.error(err);
    await packageJson.writePackageJsonFromObject(consumer, originalPackageJson);
    throw new Error(`eject operation failed adding the components to your package.json file. no changes have been done.
    error: ${err.message}`);
  }
  try {
    await packageJson.addComponentsWithVersionToRoot(this, componentsToDelete);
  } catch (err) {
    logger.error(err);
    await packageJson.removeComponentsFromNodeModules(this, componentsToDelete);
    throw new Error(`eject operation failed removing some or all the component generated data from node_modules.
    your package.json has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.
    error: ${err.message}`);
  }
  try {
    await installPackages(this, [], true, true);
  } catch (err) {
    logger.error(err);
    await packageJson.removeComponentsFromNodeModules(this, componentsToDelete);
    throw new Error(`eject operation failed installing your component using the NPM client.
    your package.json has been restored, however, some bit generated data may have been deleted, please run "bit link" to restore them.
    error: ${err.message}`);
  }

  try {
    removeLocalComponents(consumer, componentsToDelete);
  } catch (err) {
    logger.error(err);
    throw new Error(`eject operation has installed your components successfully using the NPM client.
    however, it failed removing the old components from the filesystem.
    please use bit remove command to remove them.
    error: ${err.message}`);
  }

  return ejectResults;
});

async function getComponentsToDelete(consumer: Consumer, bitIds: BitId[], force: boolean): Promise<Object> {
  const modifiedComponents = new BitIds();
  const stagedComponents = new BitIds();
  const exportedComponents = new BitIds();
  if (R.isEmpty(bitIds)) return {};
  if (!force) {
    await Promise.all(
      bitIds.map(async (id) => {
        try {
          const componentStatus = await consumer.getComponentStatusById(id);
          if (componentStatus.modified) modifiedComponents.push(id);
          else if (componentStatus.staged) stagedComponents.push(id);
          else exportedComponents.push(id);
        } catch (err) {
          throw new GeneralError(`eject operation failed getting the status of ${id.toString()}, no action has been done.
          please fix the issue to continue.
          error: ${err.message}`);
        }
      })
    );
  }

  return {
    componentsToDelete: force ? bitIds : exportedComponents,
    modifiedComponents,
    stagedComponents
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
  await packageJson.removeComponentsFromWorkspacesAndDependencies(consumer, bitIds);
  await consumer.cleanBitMapAndBitJson(bitIds, new BitIds());
}
