import { MainRuntime } from '@teambit/cli';
import { ComponentAspect, Component } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { PreviewAspect, ComponentPreviewSize, PreviewMain } from '@teambit/preview';
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
    graphql.register(componentSizerSchema(componentSizer));
    return componentSizer;
  }
}

ComponentSizerAspect.addRuntime(ComponentSizerMain);
