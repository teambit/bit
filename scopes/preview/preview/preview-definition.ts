import { Component, ComponentMap } from '@teambit/component';
import { Environment, ExecutionContext } from '@teambit/envs';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

export interface PreviewDefinition {
  /**
   * extension preview prefix
   */
  prefix: string;

  /**
   * path of the default template to be executed.
   */
  renderTemplatePath?: (context: ExecutionContext) => Promise<string>;

  /**
   * get the template by env.
   * TODO: refactor `renderTemplatePath` to accept only an env and remove this method.
   */
  renderTemplatePathByEnv?: (env: Environment) => Promise<string>;

  /**
   * get all files to require in the preview runtime.
   */
  getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>>;
}
