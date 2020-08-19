import { PreviewDefinition } from '../preview';
import { ComponentMap, Component } from '../component';
import { ExecutionContext } from '../environments';
import { DocsMain } from './docs.main.runtime';
import { AbstractVinyl } from '../../consumer/component/sources';

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
