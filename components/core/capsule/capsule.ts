import State from "./state";
import Container from './container';
// @ts-ignore
import { Volume } from "memfs/lib/volume";
import Console from "./console";
// @ts-ignore
import { Union } from 'unionfs';
import { ContainerFS } from './container';
import { Exec } from "./container";

export class ContainerFactoryOptions {
  image: string = '';
  config: object = {};
};

export default class Capsule {
  constructor(
    /**
     * container implementation the capsule is being executed within.
     */
    protected container: Container,

    /**
     * the capsule's file system.
     */
    readonly fs: Volume,

    /**
     * console for controlling process streams as stdout, stdin and stderr.
     */
    readonly console: Console,

    /**
     * capsule's state.
     */
    readonly state: State
  ) {}

  /**
   * default capsule image.
   */
  static image = 'ubuntu';

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

  updateFs(fs: {[path: string]: string}, fn: Function): void {
    Object.keys(fs).forEach((path) => {
      // @ts-ignorex
      this.fs.writeFile(path, fs[path], () => {
        if (Object.keys(fs).length === 1) fn();
      });
    });
  }

  outputFile(file: string, data: any, options: Object): Promise<any> {
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
    return this.container.resume()
  }

  stop() {
    return this.container.stop();
  }

  status() {
    return this.container.inspect();
  }

  async exec(command: string, options: Object): Promise<Exec> {
    return await this.container.exec({
      command: command.split(' '),
      ...options
    });
  }

  async get(options: { path: string }): Promise<NodeJS.ReadableStream> {
    return this.container.get(options);
  }

  destroy() {
    return this.container.stop();
  }

  private static buildFs(memFs: Volume, containerFs: ContainerFS): Volume {
    const fs = new Union();
    fs
      .use(memFs)
      .use(containerFs);

    return fs;
  }

  static async create<T extends Capsule>(
      containerFactory: (options: ContainerFactoryOptions) => Promise<Container>,
      volume: Volume = new Volume(),
      initialState: State = new State(),
      console: Console = new Console()
    ): Promise<T> {
    const container = await containerFactory({ image: this.image, config: this.config });
    const fs = await ContainerFS.fromJSON(container, {});
    return (new this(container, this.buildFs(volume, fs), console, initialState) as T);
  }
}
