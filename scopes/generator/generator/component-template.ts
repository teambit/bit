export interface File {
  /**
   * relative path of the file within the component.
   */
  relativePath: string;

  /**
   * file contents.
   */
  contents: string;
}

export interface GeneratorContext {
  /**
   * component name of the generating component. e.g. `ui/button` or `hook/use-date`.
   * without the scope.
   */
  componentName: string;
}

export interface ComponentTemplate {
  /**
   * name of the component template. for example: `hook`, `react-component` or `module`.
   */
  name: string;

  /**
   * file to track as main.
   */
  main: string;

  /**
   * template function for generating the file of a certain component.,
   */
  generateFiles(context: GeneratorContext): File[];
}
