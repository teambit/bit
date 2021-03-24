import { ComponentID } from '@teambit/component-id';

export interface File {
  /**
   * relative path of the file within the component.
   */
  relativePath: string;

  /**
   * file content
   */
  content: string;

  /**
   * whether this file will be tracked as the main file
   */
  isMain?: boolean;
}

export interface GeneratorContext {
  /**
   * component name of the generating component. e.g. `button` or `use-date`.
   * without the scope and the namespace.
   */
  componentName: string;

  /**
   * e.g. `use-date` becomes `useDate`.
   * useful when generating the file content, for example for a function name.
   */
  componentNameCamelCase: string;

  /**
   * component id.
   * the name is the name+namespace. the scope is the scope entered by --scope flag or the defaultScope
   */
  componentId: ComponentID;
}

export interface ComponentTemplate {
  /**
   * name of the component template. for example: `hook`, `react-component` or `module`.
   */
  name: string;

  /**
   * template function for generating the file of a certain component.,
   */
  generateFiles(context: GeneratorContext): File[];
}
