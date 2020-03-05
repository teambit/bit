import os from 'os';
import v4 from 'uuid';
import path from 'path';
import hash from 'object-hash';
import filenamify from 'filenamify';
import { Exec, Console, State } from '@teambit/capsule';
import { WorkspaceCapsules } from './types';
import { ComponentCapsule } from '../capsule/component-capsule';
// import { CapsuleOptions, CreateOptions } from '../network/orchestrator/types';
import { PackageManager } from '../package-manager';
import { Component, ComponentID } from '../component';
import { Options } from '../network'; // TODO: get rid of me
import FsContainer, { BitExecOption } from '../capsule/component-capsule/container';
import BitId from '../../bit-id/bit-id';

export type CapsuleDeps = [PackageManager];

const DEFAULT_OPTIONS = {
  alwaysNew: false
};

export type CreateOptions = {
  // resourceId: string;
  options: CapsuleOptions;
};

export type CapsuleOptions = {
  // bitId?: BitId;
  bitId?: ComponentID;
  wrkDir: string;
  baseDir?: string;
  //  writeDists?: boolean;
  //  writeSrcs?: boolean;
  //  writeBitDependencies?: boolean;
  //  installPackages?: boolean;
  //  packageManager?: 'npm' | 'librarian' | 'yarn' | 'pnpm';
  //  workspace?: string;
  //  alwaysNew?: boolean;
  //  name?: string;
};

export default class Capsule {
  /**
   * list all of the existing workspace capsules.
   */
  list(): ComponentCapsule[] {
    return [];
  }

  /**
   * list capsules from all workspaces.
   */
  listAll(): WorkspaceCapsules {
    // @ts-ignore
    return '';
  }

  async create(bitId: BitId, baseDir: string, orchestrationOptions?: Options): Promise<ComponentCapsule> {
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);

    const componentDirname = filenamify(bitId.toString(), { replacement: '_' });
    const wrkDir = path.join(baseDir, componentDirname);

    const container = new FsContainer(wrkDir);
    const capsule = new ComponentCapsule(container, container.fs, new Console(), new State(), bitId);
    await capsule.start();
    return capsule;
  }

  static async provide(config: any, [packageManager]: any) {
    return new Capsule();
  }
}
