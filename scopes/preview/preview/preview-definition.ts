import { Component, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/environments';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';

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
   * get all files to require in the preview runtime.
   */
  getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>>;
}
