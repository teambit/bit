import type { Component, ComponentMap } from '@teambit/component';
import type { Environment, ExecutionContext } from '@teambit/envs';
import type { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

export interface PreviewDefinition {
  /**
   * extension preview prefix
   */
  prefix: string;

  /**
   * which other extension modules to include in the preview context.
   */
  include?: string[];

  /**
   * path of the default template to be executed.
   */
  renderTemplatePath: (context: ExecutionContext) => Promise<string | undefined>;

  /**
   * get the template by env.
   * TODO: refactor `renderTemplatePath` to accept only an env and remove this method.
   */
  renderTemplatePathByEnv: (env: Environment) => Promise<string | undefined>;

  /**
   * get all files to require in the preview runtime.
   */
  getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>>;

  /**
   * Whether to include the peers chunk in the output html
   */
  includePeers?: boolean;

  /**
   * Get metadata for the preview
   */
  getMetadata?: (component: Component) => Promise<unknown>;
}
