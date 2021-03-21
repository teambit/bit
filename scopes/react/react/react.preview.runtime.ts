import { ComponentType } from 'react';
import flatten from 'lodash.flatten';
import { SlotRegistry, Slot } from '@teambit/harmony';
import PreviewAspect, { PreviewPreview, PreviewRuntime } from '@teambit/preview';
import { createHighlighter } from '@teambit/ui.highlighter';
import { PubsubAspect, PubsubPreview } from '@teambit/pubsub';
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

  static dependencies = [PreviewAspect, PubsubAspect];

  static async provider(
    [preview, pubsubPreview]: [PreviewPreview, PubsubPreview],
    config,
    [providerSlot]: [ProviderSlot]
  ) {
    const reactPreview = new ReactPreview(preview, providerSlot);

    reactPreview.registerProvider([createHighlighter(pubsubPreview)]);

    preview.registerRenderContext(() => reactPreview.getRenderingContext());
    return reactPreview;
  }
}

ReactAspect.addRuntime(ReactPreview);

export default ReactPreview;
