import { ComponentType } from 'react';
import { SlotRegistry, Slot } from '@teambit/harmony';
import PreviewAspect, { PreviewPreview, PreviewRuntime } from '@teambit/preview';
import { ReactAspect } from './react.aspect';

export type Provider = ComponentType<{}>;
export type ProviderSlot = SlotRegistry<Provider>;

export class ReactPreview {
  constructor(private preview: PreviewPreview, private providerSlot: ProviderSlot) {}

  registerProvider(provider: Provider) {
    this.providerSlot.register(provider);
  }

  getRenderingContext() {
    return {
      providers: this.providerSlot.values(),
    };
  }

  static runtime = PreviewRuntime;

  static slots = [Slot.withType<Provider>()];

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview], config, [providerSlot]: [ProviderSlot]) {
    const reactPreview = new ReactPreview(preview, providerSlot);
    preview.registerRenderContext(() => {
      return reactPreview.getRenderingContext();
    });
    return reactPreview;
  }
}

ReactAspect.addRuntime(ReactPreview);

export default ReactPreview;
