import os from 'os';
import v4 from 'uuid';
import path from 'path';
import hash from 'object-hash';
import filenamify from 'filenamify';
import { Exec, Console, State } from '@teambit/capsule';
import { WorkspaceCapsules } from './types';
import { ComponentCapsule } from '../capsule/component-capsule';
import { CapsuleOptions, CreateOptions } from '../network/orchestrator/types';
import { PackageManager } from '../package-manager';
import { Component, ComponentID } from '../component';
import { Options } from '../network'; // TODO: get rid of me
import FsContainer, { BitExecOption } from '../capsule/component-capsule/container';

export type CapsuleDeps = [PackageManager];

const DEFAULT_OPTIONS = {
  alwaysNew: false
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

  async create(
    bitId: ComponentID,
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options
  ): Promise<ComponentCapsule> {
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const config = this._generateResourceConfig(bitId, capsuleOptions || {}, orchOptions);
    const container = new FsContainer(config.options);
    const capsule = new ComponentCapsule(container, container.fs, new Console(), new State(), config.options);
    await capsule.start();
    return capsule;
  }

  static async provide(config: any, [packageManager]: any) {
    return new Capsule();
  }
  private _generateResourceConfig(bitId: ComponentID, capsuleOptions: CapsuleOptions, options: Options): CreateOptions {
    const dirName = filenamify(bitId.toString(), { replacement: '_' });
    const wrkDir = this._generateWrkDir(dirName, capsuleOptions, options);
    const ret = {
      resourceId: `${bitId.toString()}_${hash(wrkDir)}`,
      options: Object.assign(
        {},
        {
          bitId,
          wrkDir
        },
        capsuleOptions
      )
    };
    return ret;
  }
  private _generateWrkDir(bitId: string, capsuleOptions: CapsuleOptions, options: Options) {
    const baseDir = capsuleOptions.baseDir || os.tmpdir();
    capsuleOptions.baseDir = baseDir;
    if (options.alwaysNew) return path.join(baseDir, `${bitId}_${v4()}`);
    if (options.name) return path.join(baseDir, `${bitId}_${options.name}`);
    return path.join(baseDir, `${bitId}_${hash(capsuleOptions)}`);
  }
}
