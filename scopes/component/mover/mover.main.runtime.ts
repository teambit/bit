import fs from 'fs-extra';
import { isAbsolute } from 'path';
import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { isEmpty } from 'lodash';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { isDir, PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/legacy.utils';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { PathChangeResult } from '@teambit/legacy.bit-map';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import { RemovePath } from '@teambit/component.sources';
import { MoverAspect } from './mover.aspect';
import { MoveCmd } from './move-cmd';

export class MoverMain {
  constructor(private workspace: Workspace) {}

  async movePaths({ from, to }: { from: PathOsBasedRelative; to: PathOsBasedRelative }): Promise<PathChangeResult[]> {
    const consumer = this.workspace.consumer;
    const fromExists = fs.existsSync(from);
    const toExists = fs.existsSync(to);
    if (fromExists && toExists) {
      throw new BitError(`unable to move because both paths from (${from}) and to (${to}) already exist`);
    }
    if (!fromExists && !toExists) throw new BitError(`both paths from (${from}) and to (${to}) do not exist`);
    if (fromExists && !isDir(from)) {
      throw new BitError(`bit move supports moving directories only, not files.
files withing a component dir are automatically tracked, no action is needed.
to change the main-file, use "bit add <component-dir> --main <new-main-file>"`);
    }
    if (toExists && !isDir(to)) {
      throw new BitError(`unable to move because the destination path (${to}) is a file and not a directory`);
    }
    const fromRelative = consumer.getPathRelativeToConsumer(from);
    const toRelative = consumer.getPathRelativeToConsumer(to);
    const fromAbsolute = consumer.toAbsolutePath(fromRelative);
    const toAbsolute = consumer.toAbsolutePath(toRelative);
    const changes = consumer.bitMap.updatePathLocation(fromRelative, toRelative);
    if (fromExists && !toExists) {
      // user would like to physically move the file. Otherwise (!fromExists and toExists), user would like to only update bit.map
      moveSync(fromAbsolute, toAbsolute);
    }
    if (!isEmpty(changes)) {
      const componentsIds = changes.map((c) => c.id);
      await linkToNodeModulesByIds(this.workspace, componentsIds);
    }
    await this.workspace.bitMap.write('move');
    return changes;
  }

  moveExistingComponent(component: Component, oldPath: PathOsBasedAbsolute, newPath: PathOsBasedAbsolute) {
    const consumer = this.workspace.consumer;
    if (fs.existsSync(newPath)) {
      throw new BitError(
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
      file.updatePaths({ newRelative, newBase: newPathRelative });
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

export function moveSync(src: PathOsBasedAbsolute, dest: PathOsBasedAbsolute, options?: Record<string, any>) {
  if (!isAbsolute(src) || !isAbsolute(dest)) {
    throw new Error(`moveSync, src and dest must be absolute. Got src "${src}", dest "${dest}"`);
  }
  try {
    fs.moveSync(src, dest, options);
  } catch (err: any) {
    if (err.message.includes('Cannot move') && err.message.includes('into itself')) {
      throw new BitError(`unable to move '${src}' into itself '${dest}'`);
    }
    throw err;
  }
}
