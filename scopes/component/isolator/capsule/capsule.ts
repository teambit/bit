import { NodeFS } from '@teambit/any-fs';
import { Capsule as CapsuleTemplate, Console, Exec, State } from '@teambit/capsule';
import { Component } from '@teambit/component';
import filenamify from 'filenamify';
import { realpathSync } from 'fs';
import glob from 'glob';
import path from 'path';
import v4 from 'uuid';

import FsContainer, { BitExecOption } from './container';
import ContainerExec from './container-exec';

export default class Capsule extends CapsuleTemplate<Exec, NodeFS> {
  private _wrkDir: string;
  constructor(
    /**
     * container implementation the capsule is being executed within.
     */
    protected container: FsContainer,
    /**
     * the capsule's file system.
     */
    readonly fs: NodeFS,
    /**
     * console for controlling process streams as stdout, stdin and stderr.
     */
    readonly console: Console = new Console(),
    /**
     * capsule's state.
     */
    readonly state: State,
    readonly component: Component
  ) {
    super(container, fs, console, state);
    this._wrkDir = container.wrkDir;
  }

  /**
   * @deprecated please use `this.path`
   */
  get wrkDir(): string {
    return this.path;
  }

  get path(): string {
    return realpathSync(this._wrkDir);
  }

  start(): Promise<any> {
    return this.container.start();
  }

  async execNode(executable: string, args: any, exec: ContainerExec) {
    return this.typedExec(
      {
        command: ['node', executable, ...(args.args || [])],
        cwd: '',
      },
      exec
    );
  }

  async typedExec(opts: BitExecOption, exec = new ContainerExec()) {
    return this.container.exec(opts, exec);
  }

  outputFile(file: string, data: any, options: any): Promise<any> {
    return this.container.outputFile(file, data, options);
  }

  removePath(dir: string): Promise<any> {
    return this.container.removePath(dir);
  }

  symlink(src: string, dest: string): Promise<any> {
    return this.container.symlink(src, dest);
  }

  // TODO: refactor this crap and simplify capsule API
  async execute(cmd: string, options?: Record<string, any> | null | undefined) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const execResults = await this.exec({ command: cmd.split(' '), options });
    let stdout = '';
    let stderr = '';
    return new Promise((resolve, reject) => {
      execResults.stdout.on('data', (data: string) => {
        stdout += data;
      });
      execResults.stdout.on('error', (error: string) => {
        return reject(error);
      });
      // @ts-ignore
      execResults.on('close', () => {
        return resolve({ stdout, stderr });
      });
      execResults.stderr.on('error', (error: string) => {
        return reject(error);
      });
      execResults.stderr.on('data', (data: string) => {
        stderr += data;
      });
    });
  }

  /**
   * @todo: fix.
   * it skips the capsule fs because for some reason `capsule.fs.promises.readdir` doesn't work
   * the same as `capsule.fs.readdir` and it doesn't have the capsule dir as pwd.
   *
   * returns the paths inside the capsule
   */
  getAllFilesPaths(dir = '.', options: { ignore?: string[] } = {}) {
    const files = glob.sync('**', { cwd: path.join(this.path, dir), nodir: true, ...options });
    return files.map((file) => path.join(dir, file));
  }

  static getCapsuleDirName(component: Component, config: { alwaysNew?: boolean; name?: string } = {}) {
    return config.name || filenamify(component.id.toString(), { replacement: '_' });
  }

  static getCapsuleRootDir(component: Component, baseDir: string, config: { alwaysNew?: boolean; name?: string } = {}) {
    return path.join(baseDir, Capsule.getCapsuleDirName(component, config));
  }

  static async createFromComponent(
    component: Component,
    baseDir: string,
    config: { alwaysNew?: boolean; name?: string } = {}
  ): Promise<Capsule> {
    // TODO: make this a static method and combine with ComponentCapsule
    const capsuleDirName = Capsule.getCapsuleDirName(component, config);
    const wrkDir = path.join(baseDir, config.alwaysNew ? `${capsuleDirName}_${v4()}` : capsuleDirName);
    const container = new FsContainer(wrkDir);
    const capsule = new Capsule(container, container.fs, new Console(), new State(), component);
    await capsule.start();
    return capsule;
  }
}
