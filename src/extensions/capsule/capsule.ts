import os from 'os';
import v4 from 'uuid';
import path from 'path';
import hash from 'object-hash';
import filenamify from 'filenamify';
import capsuleOrchestrator from '../network/orchestrator/orchestrator';
import { WorkspaceCapsules } from './types';
import { CapsuleOrchestrator } from '../network/orchestrator/orchestrator';
import { ComponentCapsule } from '../capsule/component-capsule';
import { CapsuleOptions, CreateOptions } from '../network/orchestrator/types';
import { PackageManager } from '../package-manager';
import { Component, ComponentID } from '../component';
import { Options } from '../network'; // TODO: get rid of me

export type CapsuleDeps = [PackageManager];

const DEFAULT_OPTIONS = {
  alwaysNew: false
};

export default class Capsule {
  constructor(
    /**
     * instance of the capsule orchestrator.
     */
    readonly orchestrator: CapsuleOrchestrator // readonly builder: CapsuleBuilder
  ) {}

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
    // @ts-ignore - TODO: remove me by sorting out the options situation
    return this.orchestrator.getCapsule(capsuleOptions.workspace, config, orchOptions);
  }

  static async provide([packageManager]: any) {
    await capsuleOrchestrator.buildPools();
    return new Capsule(capsuleOrchestrator);
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
