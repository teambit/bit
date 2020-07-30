import { Component, ComponentMap } from '../component';
import { ExecutionContext } from '../environments';
import { AbstractVinyl } from '../../consumer/component/sources';

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
