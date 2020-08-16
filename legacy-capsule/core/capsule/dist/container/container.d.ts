import { Exec, ExecOptions } from './exec';
import { Readable as ReadableStream } from 'readable-stream';
export default interface Container {
  /**
   * container id
   */
  id: string;
  /**
   * execute a command on the container
   */
  exec(options: ExecOptions): Promise<Exec>;
  /**
   * get a directory or a file.
   */
  get(options: { path: string }): Promise<ReadableStream>;
  /**
   * put a file or a directory to the container.
   */
  put(
    files: {
      [path: string]: string;
    },
    options: {
      overwrite?: boolean;
      path: string;
    }
  ): Promise<void>;
  // @ts-ignore
  on(event: string, fn: (data: any) => void): void;
  /**
   * start a container.
   */
  start(): Promise<void>;
  /**
   * get the container status.
   */
  inspect(): Promise<ContainerStatus>;
  /**
   * pause a container.
   */
  pause(): Promise<void>;
  /**
   * resume a paused container
   */
  resume(): Promise<void>;
  /**
   * stop an existing container.
   */
  stop(ttl?: number): Promise<void>;
  /**
   * get the container stats
   */
  stats?(): Promise<any>;
  /**
   * create a new image from the container current state
   */
  commit?(options: CommitOptions): Promise<void>;
  /**
   * display the container's running processes.
   */
  top?(psArgs?: string): Promise<any>;
}
export declare type ContainerStatus = {
  /**
   * array of open container ports
   */
  ports: number[];
  /**
   * container host
   */
  host: string;
};
export declare type CommitOptions = {
  /**
   * repository name for the created image
   */
  repo: string;
  /**
   * tag name for the create image
   */
  tag: string;
  /**
   * commit message
   */
  comment: string;
  /**
   * author of the image.
   */
  author: string;
  /**
   * whether to pause the container before committing
   */
  pause: boolean;
};
