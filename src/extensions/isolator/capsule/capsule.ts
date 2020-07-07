import v4 from 'uuid';
import path from 'path';
import filenamify from 'filenamify';
import { realpathSync } from 'fs';
import { Capsule as CapsuleTemplate, Exec, Console, State } from '@teambit/capsule';
import { NodeFS } from '@teambit/any-fs';
import FsContainer, { BitExecOption } from './container';
import { Component } from '../../component';
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
        cwd: ''
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

  static async createFromComponent(component: Component, baseDir: string, opts?: {}): Promise<Capsule> {
    // TODO: make this a static method and combine with ComponentCapsule
    const config = Object.assign(
      {
        alwaysNew: false,
        name: undefined
      },
      opts
    );

    const capsuleDirName = config.name || filenamify(component.id.toString(), { replacement: '_' });
    const wrkDir = path.join(baseDir, config.alwaysNew ? `${capsuleDirName}_${v4()}` : capsuleDirName);
    const container = new FsContainer(wrkDir);
    const capsule = new Capsule(container, container.fs, new Console(), new State(), component);
    await capsule.start();
    return capsule;
  }
}
