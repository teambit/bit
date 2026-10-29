import type { Component } from './component';

export interface EnvRuntime {
  /**
   * id of the env.
   */
  readonly id: string;

  /**
   * the env instance.
   */
  readonly env: Record<string, any>;

  /**
   * components that use the env.
   */
  readonly components: Component[];
}

/**
 * the context of a service execution for one env, e.g. a build or a test run.
 */
export interface ExecutionContext {
  /**
   * id of the env.
   */
  readonly id: string;

  readonly envRuntime: EnvRuntime;

  /**
   * the env instance.
   */
  readonly env: Record<string, any>;

  components: Component[];
}
