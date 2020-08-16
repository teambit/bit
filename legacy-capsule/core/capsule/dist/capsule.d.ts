import State from './state';
import Container from './container';
import { Volume } from 'memfs/lib/volume';
import Console from './console';
import { Exec } from './container';
export declare class ContainerFactoryOptions {
  image: string;
  config: object;
}
export default class Capsule {
  /**
   * container implementation the capsule is being executed within.
   */
  public container: Container;
  /**
   * the capsule's file system.
   */
  readonly fs: Volume;
  /**
   * console for controlling process streams as stdout, stdin and stderr.
   */
  readonly console: Console;
  /**
   * capsule's state.
   */
  readonly state: State;
  constructor(
    /**
     * container implementation the capsule is being executed within.
     */
    container: Container,
    /**
     * the capsule's file system.
     */
    fs: Volume,
    /**
     * console for controlling process streams as stdout, stdin and stderr.
     */
    console: Console,
    /**
     * capsule's state.
     */
    state: State
  );
  /**
   * default capsule image.
   */
  static image: string;
  /**
   * default capsule config.
   */
  static config: {};
  readonly id: string;
  readonly containerId: string;
  start(): Promise<any>;
  on(event: string, fn: (data: any) => void): void;
  updateFs(
    fs: {
      [path: string]: string;
    },
    fn: Function
  ): void;
  outputFile(file: string, data: any, options: Object): Promise<any>;
  removePath(dir: string): Promise<any>;
  symlink(src: string, dest: string): Promise<any>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<import('./container').ContainerStatus>;
  exec(command: string, options: Object): Promise<Exec>;
  destroy(): Promise<void>;
  private static buildFs;
  static create<T extends Capsule>(
    containerFactory: (options: ContainerFactoryOptions) => Promise<Container>,
    volume?: Volume,
    initialState?: State,
    console?: Console
  ): Promise<T>;
}
