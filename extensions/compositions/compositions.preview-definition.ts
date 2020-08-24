import { Component, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/environments';
import { PreviewDefinition } from '@teambit/preview';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';

import { CompositionsMain } from './compositions.main.runtime';

export class CompositionPreviewDefinition implements PreviewDefinition {
  readonly prefix = 'compositions';

  constructor(private compositions: CompositionsMain) {}

  async renderTemplatePath(context: ExecutionContext): Promise<string> {
    return context.env.getMounter();
  }

  async getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>> {
    const map = this.compositions.getCompositionFiles(components);
    return map.filter((value) => value.length !== 0);
  }
}
