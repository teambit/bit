import { MainRuntime } from '@teambit/cli';
import type { Component } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { ComponentPreviewSize, PreviewMain } from '@teambit/preview';
import { PreviewAspect } from '@teambit/preview';
import { ComponentSizerAspect } from './component-sizer.aspect';
import { componentSizerSchema } from './component-sizer.graphql';

export class ComponentSizerMain {
  constructor(
    /**
     * preview aspect.
     */
    private preview: PreviewMain
  ) {}

  getComponentSize(component: Component): ComponentPreviewSize | undefined {
    return this.preview.getComponentBundleSize(component);
  }

  static slots = [];
  static dependencies = [PreviewAspect, GraphqlAspect, ComponentAspect];
  static runtime = MainRuntime;
  static async provider([preview, graphql]: [PreviewMain, GraphqlMain]) {
    const componentSizer = new ComponentSizerMain(preview);
    graphql.register(() => componentSizerSchema(componentSizer));
    return componentSizer;
  }
}

ComponentSizerAspect.addRuntime(ComponentSizerMain);
