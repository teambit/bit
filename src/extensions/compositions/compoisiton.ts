/**
 * a composition is stateless form of component used to render the component in different ways
 */
export type Composition = {
  /**
   * render function of the composition
   */
  render: () => JSX.Element;

  /**
   * compoisition title
   */
  title: string;

  /**
   * compoisition description
   */
  description: string;

  /**
   * width of the composition in pixels
   */
  width: number;

  /**
   * height of the composition in pixels
   */
  height: number;
};
