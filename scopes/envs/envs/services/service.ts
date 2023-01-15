import { Component } from '@teambit/component';
import { Env } from '../env-interface';
import { Environment } from '../environment';
import { ServiceHandler } from './service-handler';
import { ServiceHandlerContext } from './service-handler-context';

export type EnvContext = {
  components: Component[];
};

export interface ServiceExecutionResult {
  errors?: Error[];
}

export type ServiceTransformHandlerFactory<T> = (
  handlerContext?: any
) => (ServiceHandler & T) | Promise<ServiceHandler & T>;

/**
 * definition of the service handler type
 * This used to define new types of handlers like
 * Compiler, Tester, Preview, etc.
 */
export type TransformationMap = {
  /**
   * The name of the function that will be called on the service run/run once later.
   * This func will be exist on the final env object
   */
  [funcName: string]: ServiceTransformHandlerFactory<any>;
};

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
  render?(env: Environment, context: EnvContext[]): JSX.Element | Promise<JSX.Element>;

  /**
   * get service data from an environment.
   */
  getDescriptor?(environment: Environment, context?: EnvContext[]): TData | undefined | Promise<TData | undefined>;

  /**
   * executes a service on a subset of components.
   */
  run?(context: EnvContext, options?: TOpts): Promise<TExecResponse>;

  /**
   * run the service only once.
   */
  runOnce?(context: EnvContext[], options?: TOpts): Promise<any>;

  /**
   * Return a map of functions that will be called on the service run/run once later.
   * @param env the original env plugin object
   * @param context ServiceHandlerContext(EnvContext)
   */
  transform?(env: Env, context: ServiceHandlerContext): TransformationMap | undefined;
}
