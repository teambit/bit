import { ComponentID } from '@teambit/component-id';

export interface ComponentFile {
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

export interface ComponentContext {
  /**
   * component-name as entered by the user, e.g. `use-date`.
   * without the scope and the namespace.
   */
  name: string;

  /**
   * component-name as upper camel case, e.g. `use-date` becomes `UseDate`.
   * useful when generating the file content, for example for a class name.
   */
  namePascalCase: string;

  /**
   * component-name as lower camel case, e.g. `use-date` becomes `useDate`.
   * useful when generating the file content, for example for a function/variable name.
   */
  nameCamelCase: string;

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
   * short description of the template. shown in the `bit templates` command.
   */
  description?: string;

  /**
   * hide this template so that it is not listed with `bit templates`
   */
  hidden?: boolean;

  /**
   * template function for generating the file of a certain component.,
   */
  generateFiles(context: ComponentContext): ComponentFile[];
}
