import { Component } from '@teambit/component';

export type EnvContext = {
  components: Component[];
};

export interface ServiceExecutionResult {
  errors?: Error[] | string[];
}

export interface Service<TExecResponse extends ServiceExecutionResult, TOpts = {}> {
  /**
   * executes a service on a subset of components.
   */
  run(context: EnvContext, options?: TOpts): Promise<TExecResponse>;
}
