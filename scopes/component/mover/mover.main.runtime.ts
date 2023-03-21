import fs from 'fs-extra';
import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { isDir } from '@teambit/legacy/dist/utils';
import moveSync from '@teambit/legacy/dist/utils/fs/move-sync';
import { PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { PathChangeResult } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import { MoverAspect } from './mover.aspect';
import { MoveCmd } from './move-cmd';

export class MoverMain {
  constructor(private workspace: Workspace) {}

  async movePaths({ from, to }: { from: PathOsBasedRelative; to: PathOsBasedRelative }): Promise<PathChangeResult[]> {
    const consumer = await this.workspace.consumer;
    const fromExists = fs.existsSync(from);
    const toExists = fs.existsSync(to);
    if (fromExists && toExists) {
      throw new BitError(`unable to move because both paths from (${from}) and to (${to}) already exist`);
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
      await linkToNodeModulesByIds(this.workspace, componentsIds);
    }
    await this.workspace.bitMap.write();
    return changes;
  }

  moveExistingComponent(component: Component, oldPath: PathOsBasedAbsolute, newPath: PathOsBasedAbsolute) {
    const consumer = this.workspace.consumer;
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
    component.dataToPersist.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const newRelative = file.relative.replace(oldPathRelative, newPathRelative);
      file.updatePaths({ newRelative });
    });
    component.dataToPersist.removePath(new RemovePath(oldPathRelative));
    component.writtenPath = newPathRelative;
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect];
  static runtime = MainRuntime;

  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    const moverMain = new MoverMain(workspace);
    cli.register(new MoveCmd(moverMain));
    return moverMain;
  }
}

MoverAspect.addRuntime(MoverMain);

export default MoverMain;
