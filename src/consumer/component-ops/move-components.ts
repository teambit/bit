import { BitError } from '@teambit/bit-error';
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';

import { BitId } from '../../bit-id';
import BitIds from '../../bit-id/bit-ids';
import { COMPONENT_ORIGINS } from '../../constants';
import GeneralError from '../../error/general-error';
import { NodeModuleLinker } from '../../links';
import { isDir, isDirEmptySync } from '../../utils';
import moveSync from '../../utils/fs/move-sync';
import { pathJoinLinux, PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import { PathChangeResult } from '../bit-map/bit-map';
import { PathChange } from '../bit-map/component-map';
import Component from '../component/consumer-component';
import RemovePath from '../component/sources/remove-path';
import Consumer from '../consumer';

export async function movePaths(
  consumer: Consumer,
  { from, to }: { from: PathOsBasedRelative; to: PathOsBasedRelative }
): Promise<PathChangeResult[]> {
  const fromExists = fs.existsSync(from);
  const toExists = fs.existsSync(to);
  if (fromExists && toExists) {
    throw new GeneralError(`unable to move because both paths from (${from}) and to (${to}) already exist`);
  }
  if (!fromExists && !toExists) throw new GeneralError(`both paths from (${from}) and to (${to}) do not exist`);
  if (!consumer.isLegacy && fromExists && !isDir(from)) {
    throw new BitError(`bit move supports moving directories only, not files.
files withing a component dir are automatically tracked, no action is needed.
to change the main-file, use "bit add <component-dir> --main <new-main-file>"`);
  }
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
    const componentsIds = changes.map((c) => c.id);
    const { components } = await consumer.loadComponents(BitIds.fromArray(componentsIds));
    const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
    await nodeModuleLinker.link();
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
  consumer.bitMap.markAsChanged();
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
    component.dataToPersist.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const newRelative = file.relative.replace(oldPathRelative, newPathRelative);
      file.updatePaths({ newRelative });
    });
  } else {
    component.dataToPersist.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const newBase = file.base.replace(oldPathRelative, newPathRelative);
      file.updatePaths({ newBase });
    });
  }
  component.dataToPersist.removePath(new RemovePath(oldPathRelative));
  component.writtenPath = newPathRelative;
}
