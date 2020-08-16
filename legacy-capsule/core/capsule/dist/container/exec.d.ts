import { Readable as ReadableStream, Writable as WritableStream } from 'readable-stream';
/**
 * exec instance
 */
export interface Exec {
  /**
   * stdout stream
   */
  stdout: ReadableStream;
  /**
   * stdin stream
   */
  stderr: ReadableStream;
  /**
   * stdin stream
   */
  stdin: WritableStream;
  /**
   * inspect the exec instance for its status.
   */
  inspect(): Promise<ExecStatus>;
  /**
   * abort the running command.
   */
  abort(): Promise<void>;
}
/**
 * options for executing a container command.
 */
export declare type ExecOptions = {
  /**
   * command to execute
   */
  command: string[];
  /**
   * detach from the command right after its started
   */
  detach?: boolean;
  /**
   * allocate a pseudo-tty.
   */
  tty?: boolean;
  /**
   * runs the exec process with extended privileges.
   */
  privileged?: boolean;
  /**
   * a list of environment variables in the form ["VAR=value", ...].
   */
  environmentVariables?: string[];
  /**
   * the user, and optionally, group to run the exec process inside the container. Format is one of: user, user:group, uid, or uid:gid.
   */
  user?: string;
  /**
   * relative path inside the container.
   */
  cwd?: string;
};
export declare type ExecStatus = {
  /**
   * the process id
   */
  pid: number;
  /**
   * is the process still running
   */
  running: boolean;
};
