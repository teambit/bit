import { realpathSync } from 'fs';
import { Capsule, Exec, Console, State } from '@teambit/capsule';
import { NodeFS } from '@teambit/any-fs';
import _ from 'lodash';
import librarian from 'librarian';
import FsContainer, { BitExecOption } from './container';
import ContainerExec from './container-exec';
import BitContainerFactory from '../../network/orchestrator/bit-container-factory';
import { BitId } from '../../../bit-id';
import { SupportedPackageManagers } from '../../network/orchestrator/types/capsule-options';

export default class ComponentCapsule extends Capsule<Exec, NodeFS> {
  private _wrkDir: string;
  private _bitId: BitId;
  private _new = false;
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
    /**
     * config to pass capsule
     */
    readonly config: any = {}
  ) {
    super(container, fs, console, state, config);
    this._wrkDir = container.path;
    this._bitId = config.bitId;
  }

  get new(): boolean {
    return this._new;
  }

  set new(value: boolean) {
    this._new = value;
  }
  get bitId(): BitId {
    return this._bitId;
  }

  get wrkDir(): string {
    return realpathSync(this._wrkDir);
  }

  // implement this to handle capsules ids.
  get id(): string {
    return this._bitId.toString();
  }

  get containerId(): string {
    return this.container.id;
  }

  start(): Promise<any> {
    return this.container.start();
  }

  on(event: string, fn: (data: any) => void) {
    this.container.on(event, fn);
  }

  // async terminal(shell: string = process.env.SHELL || '/bin/sh') {
  async terminal() {
    return this.container.terminal();
  }

  serialize(): string {
    return JSON.stringify({
      id: this.containerId,
      wrkDir: this.container.path,
      bitId: this.bitId,
      options: _.omit(this.config, ['bitId', 'wrkDir'])
    });
  }
  static deSerializeConfig(config: any): string {
    return Object.assign({}, config, { bitId: new BitId(config.bitId) });
  }

  async execNode(
    executable: string,
    args: any,
    exec: ContainerExec,
    packageMannager: SupportedPackageManagers = 'npm'
  ) {
    return packageMannager === 'librarian'
      ? librarian.runModule(executable, { ...args, cwd: this.wrkDir })
      : this.typedExec(
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

  pause() {
    return this.container.pause();
  }

  resume() {
    return this.container.resume();
  }

  stop() {
    return this.container.stop();
  }

  status() {
    return this.container.inspect();
  }

  destroy() {
    return this.container.stop();
  }

  static async obtain<Exec, Volume, ComponentCapsule, CapsuleBaseOptions>(
    containerFactory: BitContainerFactory,
    raw: string
  ): Promise<ComponentCapsule> {
    const object = JSON.parse(raw);
    const deserializedObject = Object.assign({}, object, ComponentCapsule.deSerializeConfig(object));
    const container = (await containerFactory.obtain(deserializedObject)) as FsContainer;
    // @ts-ignore
    return new ComponentCapsule(container, container.fs, new Console(), new State(), deserializedObject);
  }
}
