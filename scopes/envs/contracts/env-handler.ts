import type { Remote } from 'comlink';
import type { ComponentID } from '@teambit/component-id';

/**
 * a service an env provides, e.g. a compiler, a tester or a linter.
 */
export interface ServiceHandler {
  /**
   * name of the service. e.g. 'typescript-compiler'
   */
  name?: string;

  /**
   * version of the service. optional.
   */
  version?: () => string;
}

/**
 * the context Bit passes to a service handler when it creates the service.
 */
export interface EnvContext {
  /**
   * id of the env.
   */
  readonly envId: ComponentID;

  /**
   * return a logger instance for the env.
   */
  createLogger(name?: string): Logger;

  /**
   * get an instance of an aspect. undefined when the aspect isn't loaded, e.g. the workspace in a scope.
   */
  getAspect<T>(aspectId: string): T | undefined;

  /**
   * create a worker for the env.
   */
  createWorker<T>(name: string, path: string): EnvWorker<T>;
}

/**
 * a factory Bit calls with the env context to create a service of the env.
 * declared with a method signature, so the context parameter is checked bivariantly. this keeps handlers
 * typed with the envs aspect's ServiceHandlerContext class (all the published services) assignable to it.
 */
export type EnvHandler<T> = { bivarianceHack(context: EnvContext): ServiceHandler & T }['bivarianceHack'];
export type AsyncEnvHandler<T> = {
  bivarianceHack(context: EnvContext): Promise<ServiceHandler & T>;
}['bivarianceHack'];

export interface Logger {
  trace(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
  info(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  error(message: string, ...meta: any[]): void;
  fatal(message: string, ...meta: any[]): void;
  setStatusLine(text: string, shouldPrintOnCI?: boolean): void;
  clearStatusLine(): void;
  console(message?: string, ...meta: any[]): void;
  consoleWarn(message?: string, ...meta: any[]): void;
  consoleError(message?: string, ...meta: any[]): void;
  consoleSuccess(message?: string, startTime?: [number, number]): void;
  consoleFailure(message?: string): void;
}

export interface EnvWorker<T> {
  initiate(options: Record<string, any>): Remote<T>;
  get(): Remote<T> | undefined;
  terminate(): Promise<void>;
}
