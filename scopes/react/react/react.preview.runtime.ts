import { ComponentType } from 'react';
import PreviewAspect, { PreviewPreview, PreviewRuntime } from '@teambit/preview';
import { ReactAspect } from './react.aspect';

export class ReactPreview {
  constructor(private preview: PreviewPreview) {}

  registerProvider(provider: ComponentType) {
    this.preview.registerRenderContext({
      provider,
    });
  }

  static runtime = PreviewRuntime;

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview]) {
    return new ReactPreview(preview);
  }
}

ReactAspect.addRuntime(ReactPreview);
