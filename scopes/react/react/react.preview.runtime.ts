import { ComponentType } from 'react';
import flatten from 'lodash.flatten';
import { SlotRegistry, Slot } from '@teambit/harmony';
import PreviewAspect, { PreviewPreview, PreviewRuntime } from '@teambit/preview';
import { HighlighterProvider } from '@teambit/react.ui.highlighter-provider';
import { ReactAspect } from './react.aspect';

export type Provider = ComponentType<{}>;
export type ProviderSlot = SlotRegistry<Provider[]>;

export class ReactPreview {
  constructor(private preview: PreviewPreview, private providerSlot: ProviderSlot) {}

  registerProvider(provider: Provider[]) {
    this.providerSlot.register(provider);
  }

  getRenderingContext() {
    return {
      providers: flatten(this.providerSlot.values()),
    };
  }

  static runtime = PreviewRuntime;

  static slots = [Slot.withType<Provider>()];

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview], config, [providerSlot]: [ProviderSlot]) {
    const reactPreview = new ReactPreview(preview, providerSlot);

    reactPreview.registerProvider([HighlighterProvider]);

    preview.registerRenderContext(() => {
      return reactPreview.getRenderingContext();
    });
    return reactPreview;
  }
}

ReactAspect.addRuntime(ReactPreview);

export default ReactPreview;
