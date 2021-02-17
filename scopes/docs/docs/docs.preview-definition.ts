import { Component, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { PreviewDefinition } from '@teambit/preview';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

import { DocsMain } from './docs.main.runtime';

export class DocsPreviewDefinition implements PreviewDefinition {
  readonly prefix = 'overview';

  constructor(
    /**
     * docs extension.
     */
    private docs: DocsMain
  ) {}

  async renderTemplatePath(context: ExecutionContext): Promise<string> {
    return this.docs.getTemplate(context);
  }

  async getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>> {
    const map = this.docs.getDocsMap(components);
    return map.filter((value) => value.length !== 0);
  }
}
