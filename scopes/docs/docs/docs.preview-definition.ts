import type { Component, ComponentMap } from '@teambit/component';
import type { Environment, ExecutionContext } from '@teambit/envs';
import type { PreviewDefinition } from '@teambit/preview';
import type { AbstractVinyl } from '@teambit/component.sources';

import type { DocsMain } from './docs.main.runtime';

export class DocsPreviewDefinition implements PreviewDefinition {
  readonly prefix = 'overview';
  readonly include = ['compositions'];
  readonly includePeers = true;

  constructor(
    /**
     * docs extension.
     */
    private docs: DocsMain
  ) {}

  /**
   * application root
   */
  async renderTemplatePath(context: ExecutionContext): Promise<string | undefined> {
    return this.renderTemplatePathByEnv(context.env);
  }

  async renderTemplatePathByEnv(env: Environment): Promise<string | undefined> {
    return this.docs.getTemplate(env);
  }

  /**
   * files to load.
   */
  async getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>> {
    const map = this.docs.getDocsMap(components);
    return map;
  }
}
