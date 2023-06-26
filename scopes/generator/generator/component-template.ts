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

  /**
   * aspect id of the aspect that register the template itself
   */
  aspectId: ComponentID;

  /**
   * env id of the env that register the template itself
   * This will be usually identical to the aspectId
   * but aspectId will always exist, while envId will be undefined if the template is not registered by an env
   * so in case you want to use the envId, you should check if it exists first
   * You can use this in case you want to only do something if the template was registered by an env
   */
  envId?: ComponentID;
}

export interface ConfigContext {
  /**
   * Aspect id of the aspect that register the template itself
   */
  aspectId: string;
}

export type ComponentConfig = { [aspectName: string]: any };

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
   * env to use for the component.
   */
  env?: string;

  /**
   * template function for generating the file of a certain component.,
   */
  generateFiles(context: ComponentContext): Promise<ComponentFile[]> | ComponentFile[];

  /**
   * component config. gets saved in the .bitmap file and it overrides the workspace.jsonc config.
   * for example, you can set the env that will be used for this component as follows:
   * "teambit.envs/envs": {
   *    "env": "teambit.harmony/aspect"
   * },
   */
  config?: ComponentConfig | ((context: ConfigContext) => ComponentConfig);
}
