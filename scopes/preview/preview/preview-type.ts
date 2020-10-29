export interface PreviewType {
  /**
   * preview name to register.
   */
  name: string;

  /**
   * preview render method.
   * :TODO @uri type this properly
   */
  render(componentId: string, linkedModules: { [key: string]: any }, includedPreviews: any[]): void;

  /**
   * determine if this will be the default preview to render.
   */
  default?: boolean;

  /**
   * which other extension modules to include in the preview context.
   */
  include?: string[];
}
