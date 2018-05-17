// @flow
import fs from 'fs-extra';
import R from 'ramda';
import { BitId } from '../../bit-id';
import { linkComponentsToNodeModules, reLinkDependents } from '../../links';
import * as packageJson from '../component/package-json';
import GeneralError from '../../error/general-error';
import { Consumer } from '..';
import type { PathOsBased } from '../../utils/path';
import type { PathChangeResult } from '../bit-map/bit-map';
import Component from '../component/consumer-component';
import BitMap from '../bit-map';

export async function movePaths(
  consumer: Consumer,
  { from, to }: { from: PathOsBased, to: PathOsBased }
): Promise<PathChangeResult[]> {
  const fromExists = fs.existsSync(from);
  const toExists = fs.existsSync(to);
  if (fromExists && toExists) {
    throw new GeneralError(`unable to move because both paths from (${from}) and to (${to}) already exist`);
  }
  if (!fromExists && !toExists) throw new GeneralError(`both paths from (${from}) and to (${to}) do not exist`);
  if (to.startsWith(from)) throw new GeneralError(`unable to move '${from}' into itself '${to}'`);

  const fromRelative = consumer.getPathRelativeToConsumer(from);
  const toRelative = consumer.getPathRelativeToConsumer(to);
  const changes = consumer.bitMap.updatePathLocation(fromRelative, toRelative, fromExists);
  if (fromExists && !toExists) {
    // user would like to physically move the file. Otherwise (!fromExists and toExists), user would like to only update bit.map
    fs.moveSync(from, to);
  }
  if (!R.isEmpty(changes)) {
    const componentsIds = changes.map(c => BitId.parse(c.id));
    await packageJson.addComponentsToRoot(consumer, componentsIds);
    const { components } = await consumer.loadComponents(componentsIds);
    linkComponentsToNodeModules(components, consumer);
    await reLinkDependents(consumer, components);
  }
  return changes;
}

export function moveExistingComponent(bitMap: BitMap, component: Component, oldPath: string, newPath: string) {
  if (fs.existsSync(newPath)) {
    throw new GeneralError(
      `could not move the component ${component.id.toString()} from ${oldPath} to ${newPath} as the destination path already exists`
    );
  }
  if (newPath.startsWith(oldPath)) throw new GeneralError(`unable to move '${oldPath}' into itself '${newPath}'`);
  const componentMap = bitMap.getComponent(component.id);
  componentMap.updateDirLocation(oldPath, newPath);
  fs.moveSync(oldPath, newPath);
  component.writtenPath = newPath;
}
