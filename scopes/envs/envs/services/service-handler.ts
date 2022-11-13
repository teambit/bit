import { ServiceHandlerContext } from "./service-handler-context";

/**
 * definition of the service handler.
 */
export type ServiceHandlerFactory<T> = (context: ServiceHandlerContext) => ServiceHandler & T

export interface ServiceHandler {
  /**
   * name of the service. e.g. 'typescript-compiler'
   */
  name?: string
  /**
   * version of the service. optional.
   */
  version?: () => string;

  /**
   * config of the service. e.g. tsconfig.json
   */
  // config?: string;
}
