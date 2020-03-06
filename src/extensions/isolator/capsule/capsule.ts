import os from 'os';
import v4 from 'uuid';
import path from 'path';
import hash from 'object-hash';
import filenamify from 'filenamify';
import librarian from 'librarian';
import { realpathSync } from 'fs';
import { Capsule as CapsuleTemplate, Exec, Console, State } from '@teambit/capsule';
import { NodeFS } from '@teambit/any-fs';
import FsContainer, { BitExecOption } from './container';
import BitId from '../../../bit-id/bit-id';

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
    readonly bitId: BitId
  ) {
    super(container, fs, console, state);
    this._wrkDir = container.wrkDir;
  }

  get wrkDir(): string {
    return realpathSync(this._wrkDir);
  }

  start(): Promise<any> {
    return this.container.start();
  }

  async execNode(executable: string, args: any) {
    return librarian.runModule(executable, { ...args, cwd: this.wrkDir });
  }
  async typedExec(opts: BitExecOption) {
    return this.container.exec(opts);
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

  static async createFromBitId(bitId: BitId, baseDir: string, opts?: {}): Promise<Capsule> {
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
    const capsule = new Capsule(container, container.fs, new Console(), new State(), bitId);
    await capsule.start();
    return capsule;
  }
}
