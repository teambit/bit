import { Component, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { PreviewDefinition } from '@teambit/preview';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

import { CompositionsMain } from './compositions.main.runtime';

export class CompositionPreviewDefinition implements PreviewDefinition {
  readonly prefix = 'compositions';

  constructor(private compositions: CompositionsMain) {}

  async renderTemplatePath(context: ExecutionContext): Promise<string> {
    return context.env.getMounter();
  }

  async getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>> {
    const map = this.compositions.getPreviewFiles(components);
    return map.filter((value) => value.length !== 0);
  }
}
