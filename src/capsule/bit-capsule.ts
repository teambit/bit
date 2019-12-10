import { default as Capsule, Exec, Volume, Console, State } from 'capsule-new';
import FsContainer from './container';
// @ts-ignore
import librarian from 'librarian';

import loader from '../cli/loader'; // TODO: better (have the capsule accept the loader as an arg?)

export class ContainerFactoryOptions {
  image: string = '';
  config: object = {};
}

export default class BitCapsule extends Capsule<Exec> {
  constructor(
    public path: string,

    /**
     * container implementation the capsule is being executed within.
     */
    protected container: FsContainer,

    /**
     * the capsule's file system.
     */
    readonly fs: Volume,

    /**
     * console for controlling process streams as stdout, stdin and stderr.
     */
    readonly console: Console = new Console(),

    /**
     * capsule's state.
     */
    readonly state: State
  ) {
    super(container, fs, console, state);
  }

  /**
   * default capsule image.
   */

  componentName?: string;

  /**
   * default capsule config.
   */
  static config = {};

  // implement this to handle capsules ids.
  get id(): string {
    return '';
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

  async execNode(executable: string, args: any) {
    // TODO: better
    const loaderPrefix = this.componentName ? `isolating ${this.componentName}` : '';
    const log = message => (this.componentName ? loader.setText(`${loaderPrefix}: ${message}`) : {});
    const { patchFileSystem } = librarian.api();
    const onScriptRun = () =>
      this.componentName ? loader.setText(`running build for ${this.componentName} in an isolated environment`) : {}; // TODO: do this from the compiler/tester so we can customize the message
    await patchFileSystem(executable, { args, cwd: this.path, log, onScriptRun });
  }

  setComponentName(componentName: string) {
    this.componentName = componentName;
  }

  outputFile(file: string, data: any, options: Object): Promise<any> {
    return this.container.outputFile(file, data, options);
  }

  removePath(dir: string): Promise<any> {
    return this.fs.promises.unlink(dir);
    //return this.container.removePath(dir);
  }

  symlink(src: string, dest: string): Promise<any> {
    return this.fs.promises.symlink(src, dest);
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

  /*
  async exec(command: string, options: Object): Promise<Exec> {
    return await this.container.exec({
      command: command.split(' '),
      ...options
    });
  }
*/

  /*  async get(options: { path: string }): Promise<NodeJS.ReadableStream> {
    return this.container.get(options);
  }*/

  destroy() {
    return this.container.stop();
  }

  /*
  static async create<T extends Capsule>(
    containerFactory: (options: ContainerFactoryOptions) => Promise<Container<Exec>>,
    volume: Volume = new Volume(),
    initialState: State = new State(),
    console: Console = new Console()
  ): Promise<T> {
    const container = await containerFactory( config: this.config });
    const fs = container.fs;
    return new this(container, fs, console, initialState) as T;
  }*/
}
