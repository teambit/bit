/**
 * add a custom type and include all properties from within the environment.
 */
export interface Environment {
  /**
   * name of the environment.
   */
  name?: string;

  /**
   * description of the environment.
   */
  description?: string;

  /**
   * icon of the environment.
   */
  icon?: string;

  [key: string]: any; // :TODO need to define an abstract type for service handlers (now using any)
}
