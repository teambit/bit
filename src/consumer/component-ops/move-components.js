// @flow
import fs from 'fs-extra';
import R from 'ramda';
import { NodeModuleLinker, reLinkDependents } from '../../links';
import * as packageJsonUtils from '../component/package-json-utils';
import GeneralError from '../../error/general-error';
import type Consumer from '../consumer';
import type { PathOsBasedRelative, PathOsBasedAbsolute } from '../../utils/path';
import type { PathChangeResult } from '../bit-map/bit-map';
import type Component from '../component/consumer-component';
import moveSync from '../../utils/fs/move-sync';
import RemovePath from '../component/sources/remove-path';
import BitIds from '../../bit-id/bit-ids';

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
    const componentsIds = changes.map(c => c.id);
    const { components } = await consumer.loadComponents(BitIds.fromArray(componentsIds));
    await packageJsonUtils.addComponentsToRoot(consumer, components);
    const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
    await nodeModuleLinker.link();
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
  const oldPathRelative = consumer.getPathRelativeToConsumer(oldPath);
  const newPathRelative = consumer.getPathRelativeToConsumer(newPath);
  componentMap.updateDirLocation(oldPathRelative, newPathRelative);
  component.dataToPersist.files.forEach((file) => {
    const newBase = file.base.replace(oldPathRelative, newPathRelative);
    file.updatePaths({ newBase });
  });
  component.dataToPersist.removePath(new RemovePath(oldPathRelative));
  component.writtenPath = newPathRelative;
}
