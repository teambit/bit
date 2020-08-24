import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';

import { BitId } from '../../bit-id';
import BitIds from '../../bit-id/bit-ids';
import { COMPONENT_ORIGINS } from '../../constants';
import GeneralError from '../../error/general-error';
import { NodeModuleLinker, reLinkDependents } from '../../links';
import { isDirEmptySync } from '../../utils';
import moveSync from '../../utils/fs/move-sync';
import { pathJoinLinux, PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import { PathChangeResult } from '../bit-map/bit-map';
import { PathChange } from '../bit-map/component-map';
import Component from '../component/consumer-component';
import * as packageJsonUtils from '../component/package-json-utils';
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

/**
 * since v14.8.0 Bit encourages users not to add individual files, only directories.
 * this function helps migrate a component that have files in different directories in the
 * workspace and moves them into one specified directory. this dir will be the rootDir.
 * since it only moves files, one prerequisite is to not have the same filename twice.
 */
export async function moveExistingComponentFilesToOneDir(
  consumer: Consumer,
  id: BitId,
  to: string
): Promise<PathChangeResult[]> {
  const componentMap = consumer.bitMap.getComponent(id, { ignoreVersion: true });
  if (componentMap.origin !== COMPONENT_ORIGINS.AUTHORED) {
    throw new GeneralError(
      `bit move --component is relevant for authored components only. ${id.toString()} is not an authored component`
    );
  }
  const existingRootDir = componentMap.hasRootDir() ? componentMap.rootDir : componentMap.trackDir;
  if (existingRootDir) {
    throw new GeneralError(`${id.toString()} has already one directory (${existingRootDir}) for all its files.
to change that directory, use bit move without --component flag`);
  }
  const toRelative = consumer.getPathRelativeToConsumer(to);
  const toAbsolute = consumer.toAbsolutePath(toRelative);
  if (fs.existsSync(toAbsolute)) {
    const stats = fs.statSync(toAbsolute);
    if (stats.isFile()) throw new GeneralError(`unable to move files into "${to}", as this path is a file`);
    const isEmpty = isDirEmptySync(toAbsolute);
    if (!isEmpty) throw new GeneralError(`unable to move files into "${to}", the directory is not empty`);
  }
  const fileNames = componentMap.files.map((f) => f.name);
  const sameName = fileNames.find((name) => fileNames.filter((n) => n === name).length > 1);
  if (sameName) {
    throw new GeneralError(`unable to move the files because there are more than one file with the name ${sameName}`);
  }
  const changes: PathChange[] = componentMap.files.map((file) => {
    const fromAbsolute = consumer.toAbsolutePath(file.relativePath);
    moveSync(fromAbsolute, path.join(toAbsolute, file.name));
    return { from: file.relativePath, to: pathJoinLinux(toRelative, file.name) };
  });
  componentMap.addRootDirToDistributedFiles(toRelative);
  consumer.bitMap.markAsChanged();
  return [{ id, changes }];
}
