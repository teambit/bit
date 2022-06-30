export interface PluginDefinition {
  /**
   * regex pattern for detecting the definition file within a component.
   */
  pattern: string | RegExp;

  /**
   * runtimes for the plugin to apply.
   */
  runtimes: string[];

  /**
   * register the plugin to its slot registry.
   */
  register<T>(object: T): Promise<void>;
}
