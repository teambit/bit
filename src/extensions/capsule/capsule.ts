import os from 'os';
import v4 from 'uuid';
import path from 'path';
import hash from 'object-hash';
import filenamify from 'filenamify';
import { Exec, Console, State } from '@teambit/capsule';
import { WorkspaceCapsules } from './types';
import { ComponentCapsule } from '../capsule/component-capsule';
import { PackageManager } from '../package-manager';
import { Component, ComponentID } from '../component';
import FsContainer, { BitExecOption } from '../capsule/component-capsule/container';
import BitId from '../../bit-id/bit-id';

export default class Capsule {
  async create(bitId: BitId, baseDir: string, opts?: {}): Promise<ComponentCapsule> {
    // TODO: make this a static method and combine with ComponentCapsule
    const config = Object.assign(
      {
        alwaysNew: false,
        name: undefined
      },
      opts
    );

    const capsuleDirName = config.name || filenamify(bitId.toString(), { replacement: '_' });
    const wrkDir = path.join(baseDir, config.alwaysNew ? `${capsuleDirName}_${v4()}` : capsuleDirName);

    const container = new FsContainer(wrkDir);
    const capsule = new ComponentCapsule(container, container.fs, new Console(), new State(), bitId);
    await capsule.start();
    return capsule;
  }

  static async provide() {
    return new Capsule();
  }
}
