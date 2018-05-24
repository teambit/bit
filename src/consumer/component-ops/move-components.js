// @flow
import fs from 'fs-extra';
import R from 'ramda';
import { BitId } from '../../bit-id';
import { linkComponentsToNodeModules, reLinkDependents } from '../../links';
import * as packageJson from '../component/package-json';
import GeneralError from '../../error/general-error';
import { Consumer } from '..';
import type { PathOsBasedRelative, PathOsBasedAbsolute } from '../../utils/path';
import type { PathChangeResult } from '../bit-map/bit-map';
import Component from '../component/consumer-component';
import moveSync from '../../utils/fs/move-sync';

export async function movePaths(
  consumer: Consumer,
  { from, to }: { from: PathOsBasedRelative, to: PathOsBasedRelative }
): Promise<PathChangeResult[]> {
  const fromExists = fs.existsSync(from);
  const toExists = fs.existsSync(to);
  if (fromExists && toExists) {
    throw new GeneralError(`unable to move because both paths from (${from}) and to (${to}) already exist`);
  }
  if (!fromExists && !toExists) throw new GeneralError(`both paths from (${from}) and to (${to}) do not exist`);

  const fromRelative = consumer.getPathRelativeToConsumer(from);
  const toRelative = consumer.getPathRelativeToConsumer(to);
  const fromAbsolute = consumer.toAbsolutePath(fromRelative);
  const toAbsolute = consumer.toAbsolutePath(toRelative);
  const existingPath = fromExists ? fromAbsolute : toAbsolute;
  const changes = consumer.bitMap.updatePathLocation(fromRelative, toRelative, existingPath);
  if (fromExists && !toExists) {
    // user would like to physically move the file. Otherwise (!fromExists and toExists), user would like to only update bit.map
    moveSync(fromAbsolute, toAbsolute);
  }
  if (!R.isEmpty(changes)) {
    const componentsIds = changes.map(c => BitId.parse(c.id));
    await packageJson.addComponentsToRoot(consumer, componentsIds);
    const { components } = await consumer.loadComponents(componentsIds);
    await linkComponentsToNodeModules(components, consumer);
    await reLinkDependents(consumer, components);
  }
  return changes;
}

export function moveExistingComponent(
  consumer: Consumer,
  component: Component,
  oldPath: PathOsBasedAbsolute,
  newPath: PathOsBasedAbsolute
) {
  if (fs.existsSync(newPath)) {
    throw new GeneralError(
      `could not move the component ${component.id.toString()} from ${oldPath} to ${newPath} as the destination path already exists`
    );
  }
  const componentMap = consumer.bitMap.getComponent(component.id);
  componentMap.updateDirLocation(
    consumer.getPathRelativeToConsumer(oldPath),
    consumer.getPathRelativeToConsumer(newPath)
  );
  moveSync(oldPath, newPath);
  component.writtenPath = newPath;
}
