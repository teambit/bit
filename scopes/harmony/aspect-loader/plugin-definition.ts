import { Aspect } from "@teambit/harmony";

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


  /**
   * Plugin implementation.
   * @param object The object that was exported as default by the *.plugin-pattern file.
   * @param sourceAspect Pointer to the aspect that is using the plugin (the aspect that contain the *.plugin-pattern file).
   */
  register<T>(object: T, sourceAspect: Aspect): void;
}
