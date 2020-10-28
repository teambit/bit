import { Component } from '@teambit/component';
import { Environment } from '../environment';

export type EnvContext = {
  components: Component[];
};

export interface ServiceExecutionResult {
  errors?: Error[];
}

/**
 * services allows to reuse and standardize services for development environments.
 * examples for services can be: `linting`, `compilation`, `build`, and others which offer
 * standard services to environments such as `react`, `angular` and `vue` and different compositions of each for
 * more concrete needs.
 *
 * `TData` - type of data returned by the service handler.
 * `TOpts` is the type of options passed to the environment through execution.
 * `TExecResponse` is the execution result of the service.
 */
export interface Service<TExecResponse extends ServiceExecutionResult, TData = {}, TOpts = {}> {
  /**
   * name of the service. (e.g. `compile`, `test`, etc.)
   */
  name?: string;

  /**
   * description of the env.
   */
  description?: string;

  /**
   * create a string to describe to service in the env cli.
   */
  render?(env: Environment): JSX.Element;

  /**
   * get service data from an environment.
   */
  getDescriptor?(environment: Environment): TData | undefined;

  /**
   * executes a service on a subset of components.
   */
  run?(context: EnvContext, options?: TOpts): Promise<TExecResponse>;

  /**
   *
   */
  runOnce?(context: EnvContext[], options?: TOpts): Promise<any>;
}
