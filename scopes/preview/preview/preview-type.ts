import { RenderingContext } from './rendering-context';
import { PreviewModule } from './types/preview-module';

export interface PreviewType {
  /**
   * preview name to register.
   */
  name: string;

  /**
   * preview render method.
   */
  render(
    componentId: string,
    linkedModules: PreviewModule<any>,
    includedPreviews: string[],
    renderingContext: RenderingContext
  ): void;

  /**
   * determine if this will be the default preview to render.
   */
  default?: boolean;

  /**
   * which other extension modules to include in the preview context.
   */
  include?: string[];

  /**
   * select relevant information to show in preview context
   */
  selectPreviewModel?: (componentId: string, module: PreviewModule) => any;
}
