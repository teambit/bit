import { EnvsAspect } from './environments.aspect';

export { ServiceHandlerContext as EnvContext } from './services';

export type {
  ServiceHandlerFactory as EnvHandler,
  AsyncServiceHandlerFactory as AsyncEnvHandler,
  ServiceHandler,
  ServiceTransformationMap,
} from './services';
export { DEFAULT_ENV } from './environments.main.runtime';
export * from './environment';
export { ExecutionContext } from './context';
export type { EnvService, ConcreteService } from './services';
export { reduceServiceHandlersFactories } from './services';
export { EnvRuntime } from './runtime/env-runtime';
export type { Env } from './env-interface';
export type {
  EnvsMain,
  EnvTransformer,
  Descriptor,
  RegularCompDescriptor,
  EnvCompDescriptor,
  EnvJsonc,
} from './environments.main.runtime';
export { EnvsAspect };
export { EnvsExecutionResult } from './runtime/envs-execution-result';
export type { EnvServiceList } from './env-service-list';
export { EnvDefinition } from './env-definition';
export default EnvsAspect;
