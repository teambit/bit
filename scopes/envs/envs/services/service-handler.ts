import type { AsyncEnvHandler, EnvContext as ServiceHandlerContext, EnvHandler } from '@teambit/envs.contracts';

/**
 * definition of the service handler.
 * the context is the env contract's interface, checked bivariantly, so handlers typed with either the interface
 * or the ServiceHandlerContext class are accepted.
 */
export type ServiceHandlerFactory<T> = EnvHandler<T>;
export type AsyncServiceHandlerFactory<T> = AsyncEnvHandler<T>;

export interface ServiceHandler {
  /**
   * name of the service. e.g. 'typescript-compiler'
   */
  name?: string;
  /**
   * version of the service. optional.
   */
  version?: () => string;

  /**
   * config of the service. e.g. tsconfig.json
   */
  // config?: string;
}

export type ReduceFactoryCallback<T> = (acc: T, value: T) => ServiceHandler & T;
export function reduceServiceHandlersFactories<T>(
  factories: ServiceHandlerFactory<T>[],
  callback: ReduceFactoryCallback<T>
): ServiceHandlerFactory<T> {
  if (!factories.length) throw new Error('no factories were provided');
  const result: ServiceHandlerFactory<T> = (context: ServiceHandlerContext) => {
    // @ts-ignore
    const initialVal = factories.shift()(context);
    const reduced: ServiceHandler & T = factories.reduce((acc, currFactory) => {
      const curr = currFactory(context);
      return callback(acc, curr);
    }, initialVal);
    return reduced;
  };
  return result;
}
