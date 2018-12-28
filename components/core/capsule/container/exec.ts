
/**
 * exec instance
 */
export interface Exec {
  /**
   * stdout stream
   */
  stdout: NodeJS.ReadableStream;

  /**
   * stdin stream
   */
  stderr: NodeJS.ReadableStream;

  /**
   * stdin stream
   */
  stdin: NodeJS.WritableStream;

  /**
   * inspect the exec instance for its status.
   */
  inspect(): Promise<ExecStatus>;
  
  /**
   * abort the running command.
   */
  abort(): Promise<void>;

  on(event: 'close' | 'error', callback: () => void): void;
};

/**
 * options for executing a container command.
 */
export type ExecOptions = {
  /**
   * command to execute
   */
  command: string[],

  /**
   * detach from the command right after its started
   */
  detach?: boolean,

  /**
   * allocate a pseudo-tty.
   */
  tty?: boolean,

  /**
   * runs the exec process with extended privileges.
   */
  privileged?: boolean,

  /**
   * a list of environment variables in the form ["VAR=value", ...].
   */
  environmentVariables?: string[],

  /**
   * the user, and optionally, group to run the exec process inside the container. Format is one of: user, user:group, uid, or uid:gid.
   */
  user?: string
};

export type ExecStatus = {
  /**
   * the process id
   */
  pid: number

  /**
   * is the process still running
   */
  running: boolean,
};
