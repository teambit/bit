import { PreviewPreview, PreviewRuntime, PreviewAspect } from '@teambit/preview';
import { ReactPreview, ReactAspect } from '@teambit/react';
import { ReactNativeAspect } from './react-native.aspect';

export class ReactNativePreview {
  constructor(private reactPreview: ReactPreview, private preview: PreviewPreview) {}

  registerProvider = this.reactPreview.registerProvider.bind(this.reactPreview);

  getRenderingContext = this.reactPreview.getRenderingContext.bind(this.reactPreview);

  static runtime = PreviewRuntime;

  static slots = [];

  static dependencies = [ReactAspect, PreviewAspect];

  static async provider([reactPreview, preview]: [ReactPreview, PreviewPreview]) {
    const reactNativePreview = new ReactNativePreview(reactPreview, preview);

    // preview.registerRenderContext(reactNativePreview.getRenderingContext);

    return reactNativePreview;
  }
}

ReactNativeAspect.addRuntime(ReactNativePreview);

export default ReactNativePreview;
