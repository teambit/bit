import { ComponentType } from 'react';
import flatten from 'lodash.flatten';
import { SlotRegistry, Slot } from '@teambit/harmony';
import PreviewAspect, { PreviewPreview, PreviewRuntime, RenderingContextProvider } from '@teambit/preview';
import { HighlighterProvider } from '@teambit/react.ui.highlighter-provider';
import { ReactAspect } from './react.aspect';

export type Provider = ComponentType<{}>;
export type ProviderSlot = SlotRegistry<Provider[]>;

export class ReactPreview {
  constructor(private preview: PreviewPreview, private providerSlot: ProviderSlot) {}

  registerProvider(provider: Provider[]) {
    this.providerSlot.register(provider);
  }

  getRenderingContext: RenderingContextProvider = ({ aspectsFilter }) => {
    let entries = this.providerSlot.toArray();

    if (aspectsFilter) {
      const allowedAspects = new Set(aspectsFilter);
      allowedAspects.add(ReactAspect.id);

      entries = entries.filter(([aspectId]) => allowedAspects.has(aspectId));
    }

    const providers = flatten(entries.map(([, provider]) => provider));

    return {
      providers,
    };
  };

  static runtime = PreviewRuntime;

  static slots = [Slot.withType<Provider>()];

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview], config, [providerSlot]: [ProviderSlot]) {
    const reactPreview = new ReactPreview(preview, providerSlot);

    reactPreview.registerProvider([HighlighterProvider]);

    preview.registerRenderContext(reactPreview.getRenderingContext);

    return reactPreview;
  }
}

ReactAspect.addRuntime(ReactPreview);

export default ReactPreview;
