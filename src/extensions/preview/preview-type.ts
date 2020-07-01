export interface PreviewType {
  /**
   * preview name to register.
   */
  name: string;

  /**
   * preview render method.
   */
  render(componentId: string, linkedModules: { [key: string]: any }): void;

  /**
   * determine if this will be the default preview to render.
   */
  default?: boolean;
}
