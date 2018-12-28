import State from "./state";
import Container from './container';
// @ts-ignore
import { Volume } from "memfs/lib/volume";
import Console from "./console";
// @ts-ignore
import { Union } from 'unionfs';
import { ContainerFS } from './container';
import { Exec } from "./container";


export type ContainerFactoryOptions = {
  image: string
};

export default class Capsule<StateType = {}> {
  constructor(
    protected container: Container,
    readonly fs: Volume,
    readonly console: Console,
    readonly state: State
  ) {}

  static image = 'ubuntu';

  get containerId(): string {
    return this.container.id;
  }

  start(): Promise<any> {
    return this.container.start();
  }

  updateFs(fs: {[path: string]: string}, fn: Function): void {
    Object.keys(fs).forEach((path) => {
      // @ts-ignore
      this.fs.writeFile(path, fs[path], () => {
        if (Object.keys(fs).length === 1) fn();
      });
    });
  }

  setState() {

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

  async exec(command: string): Promise<Exec> {
    return await this.container.exec({
      command: command.split(' ')
    });
  }

  destroy() {
    return this.container.destroy();
  }

  static buildFs(memFs: Volume, containerFs: ContainerFS): Volume {
    const fs = new Union();
    fs
      .use(memFs)
      .use(containerFs);
    
    return fs;
  }

  static async create(
      containerFactory: (options: ContainerFactoryOptions) => Promise<Container>, 
      volume: Volume, 
      initialState: State = new State(),
      console: Console = new Console()
    ) {
    const container = await containerFactory({ image: this.image });
    const fs = await ContainerFS.fromJSON(container, {});
    return new Capsule(container, this.buildFs(volume, fs), console, initialState);
  }
}
